import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import CryptoJS from "crypto-js"
import { getGatewayConfig } from "./config_manager.js"

let smtpTransporter = null
let imapClient = null
let imapSyncInterval = null
let isImapRunning = false

// Helper: upload a parsed buffer attachment to Pinata/IPFS
const uploadAttachmentToIPFS = async (buffer, filename, mimeType, pinataJwt) => {
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" })
  const formData = new FormData()
  formData.append("file", blob, filename || `attachment_${Date.now()}`)
  formData.append("pinataMetadata", JSON.stringify({ name: filename || `attachment_${Date.now()}` }))
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }))

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pinataJwt}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Pinata upload failed: ${errText}`)
  }

  const result = await response.json()
  return result.IpfsHash // returns the CID
}

// Helper: download attachment content from IPFS to attach to SMTP email
const fetchAttachmentFromIPFS = async (cid) => {
  try {
    const response = await fetch(`https://ipfs.io/ipfs/${cid}`, {
      signal: AbortSignal.timeout(20000) // 20s timeout
    })
    if (!response.ok) throw new Error(`HTTP status ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    console.error(`❌ Failed to fetch attachment ${cid} from IPFS:`, err.message)
    throw err
  }
}

/**
 * Initializes the Nodemailer SMTP transporter using active settings.
 */
export const initSMTPTransporter = () => {
  const config = getGatewayConfig()
  
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    console.log(`✉️ [SMTP] Initializing custom user transporter for ${config.smtpHost}:${config.smtpPort} (secure: ${config.smtpSecure})`)
    smtpTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: parseInt(config.smtpPort || "587"),
      secure: config.smtpSecure === true || config.smtpSecure === "true",
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    })
  } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`✉️ [SMTP] Fallback to default server transporter: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`)
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  } else {
    smtpTransporter = null
    console.warn("⚠️ [SMTP] SMTP relay is not configured or disabled.")
  }
}

/**
 * Relays an email to SMTP network.
 */
export const sendSMTPEmail = async ({ senderEmail, receiverEmail, subject, message, html, attachments = [], cc = "", bcc = "" }) => {
  if (!smtpTransporter) {
    initSMTPTransporter()
    if (!smtpTransporter) {
      throw new Error("SMTP Gateway is not configured on this server.")
    }
  }

  const config = getGatewayConfig()
  const mailAttachments = []

  // Resolve IPFS CIDs to Buffers for SMTP delivery
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.cid) {
        console.log(`⬇️ [SMTP] Fetching attachment content from IPFS for: ${att.name || att.filename}`)
        const buffer = await fetchAttachmentFromIPFS(att.cid)
        mailAttachments.push({
          filename: att.name || att.filename || "attachment",
          content: buffer,
          contentType: att.type || att.contentType
        })
      }
    }
  }

  const smtpUser = config.smtpUser || process.env.SMTP_USER || ""
  const smtpFrom = config.smtpFrom || process.env.SMTP_FROM || "DMail Gateway"

  const mailOptions = {
    from: `${smtpFrom} <${smtpUser}>`,
    to: receiverEmail,
    subject: subject,
    text: message,
    html: html || message.replace(/\n/g, "<br>"),
    cc: cc || undefined,
    bcc: bcc || undefined,
    attachments: mailAttachments,
    headers: {
      "X-Mailer": "DMail Secure Gateway",
      "X-DMail-Sender": senderEmail,
    }
  }

  const info = await smtpTransporter.sendMail(mailOptions)
  console.log(`✅ [SMTP] Email relayed successfully: ${info.messageId}`)
  return info.messageId
}

/**
 * Background IMAP synchronization worker.
 */
export const startIMAPSync = async (gun) => {
  // Stop existing worker
  if (imapSyncInterval) {
    clearInterval(imapSyncInterval)
    imapSyncInterval = null
  }
  if (imapClient) {
    try {
      await imapClient.logout()
    } catch {}
    imapClient = null
  }
  isImapRunning = false

  const config = getGatewayConfig()
  if (!config.imapHost || !config.imapUser || !config.imapPass) {
    console.warn("⚠️ [IMAP] IMAP credentials not configured. Two-way sync is disabled.")
    return
  }

  const PINATA_JWT = process.env.PINATA_JWT || ""

  const syncEmails = async () => {
    if (isImapRunning) return
    isImapRunning = true

    console.log(`📥 [IMAP] Checking inbox for ${config.imapUser}...`)
    
    const client = new ImapFlow({
      host: config.imapHost,
      port: parseInt(config.imapPort || "993"),
      secure: config.imapSecure === true || config.imapSecure === "true",
      auth: {
        user: config.imapUser,
        pass: config.imapPass,
      },
      logger: false,
    })

    imapClient = client

    try {
      await client.connect()
      
      const lock = await client.getMailboxLock("INBOX")
      try {
        // Read last synchronized UID from GunDB
        const targetEmail = config.imapUser.toLowerCase().trim()
        let lastUid = await new Promise((resolve) => {
          gun.get("imap_sync_status").get(targetEmail).once((data) => {
            resolve(data?.lastUid || 0)
          })
          setTimeout(() => resolve(0), 3000)
        })

        const mailbox = await client.select("INBOX")
        const highestUid = mailbox.uidNext - 1

        if (highestUid > lastUid) {
          console.log(`📥 [IMAP] Syncing UIDs ${lastUid + 1} to ${highestUid}`)
          const range = `${lastUid + 1}:${highestUid}`
          
          for await (let message of client.fetch(range, { uid: true, source: true })) {
            if (message.uid <= lastUid) continue
            
            try {
              const parsed = await simpleParser(message.source)
              const messageId = parsed.messageId || `smtp_gen_${Date.now()}_${Math.random().toString(36).slice(2)}`
              const mailId = `smtp_${CryptoJS.SHA256(messageId).toString()}`

              // Check if mail already exists in GunDB to avoid duplicates
              const exists = await new Promise((resolve) => {
                gun.get("securemail_mails").get(mailId).once((data) => {
                  resolve(!!data)
                })
                setTimeout(() => resolve(false), 2000)
              })

              if (!exists) {
                console.log(`✉️ [IMAP] Syncing new email: ${parsed.subject || "(No Subject)"}`)
                
                // Process attachments (upload to IPFS)
                const finalAttachments = []
                if (parsed.attachments && parsed.attachments.length > 0) {
                  for (const att of parsed.attachments) {
                    try {
                      let cid = ""
                      if (PINATA_JWT) {
                        cid = await uploadAttachmentToIPFS(att.content, att.filename, att.contentType, PINATA_JWT)
                      } else {
                        console.warn("⚠️ [IMAP] Pinata JWT not configured, skipping attachment upload.")
                        cid = `unconfigured_${Date.now()}`
                      }
                      finalAttachments.push({
                        id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        name: att.filename || "attachment",
                        size: att.size,
                        type: att.contentType || "application/octet-stream",
                        cid: cid
                      })
                    } catch (attErr) {
                      console.error(`❌ Failed to process attachment ${att.filename}:`, attErr.message)
                    }
                  }
                }

                const senderAddress = parsed.from?.value?.[0]?.address || "unknown@email.com"
                const receiverAddress = parsed.to?.value?.[0]?.address || targetEmail

                const mailObject = {
                  id: mailId,
                  messageId: messageId,
                  senderEmail: senderAddress.toLowerCase().trim(),
                  receiverEmail: receiverAddress.toLowerCase().trim(),
                  subject: parsed.subject || "(No Subject)",
                  message: parsed.text || parsed.html?.replace(/<[^>]*>/g, "") || "", // plain text fallback
                  html: parsed.html || "",
                  time: (parsed.date || new Date()).toISOString(),
                  status: "inbox",
                  source: "smtp",
                  isStarred: false,
                  isRead: false,
                  hasAttachments: finalAttachments.length > 0,
                  attachmentCount: finalAttachments.length,
                  attachments: finalAttachments,
                }

                // Put full email into GunDB main store
                gun.get("securemail_mails").get(mailId).put(mailObject)

                // Index it for recipient's fast per-user lookup
                gun.get(`user_mail_index:${mailObject.receiverEmail}`).get(mailId).put(mailObject)
                console.log(`✅ [IMAP] Added email ${mailId} to GunDB index for ${mailObject.receiverEmail}`)
              }
            } catch (err) {
              console.error("❌ Failed to parse message:", err.message)
            }
          }
          
          // Save updated lastUid
          gun.get("imap_sync_status").get(targetEmail).put({ lastUid: highestUid })
        }
      } finally {
        lock.release()
      }
      
      await client.logout()
      console.log("🔌 [IMAP] Sync complete, logged out.")
    } catch (err) {
      console.error("❌ [IMAP] Connection or sync failed:", err.message)
    } finally {
      isImapRunning = false
    }
  }

  // Initial check
  syncEmails()

  // Run poll every 30 seconds
  imapSyncInterval = setInterval(syncEmails, 30000)
}
