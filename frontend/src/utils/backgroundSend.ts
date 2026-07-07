import { db, encryptMessage, sendMailNow, computePoW, hashMailContent } from "@/utils/gun"
import { autoSaveContact } from "@/utils/contacts"
import { uploadFileToIPFS, uploadToIPFS } from "@/utils/ipfs"
import { updateMailInStore } from "@/utils/mailStore"
import { hybridEncrypt } from "@/utils/cryptoHybrid"

interface SendMailParams {
  user: any
  recipientEmail: string
  subject: string
  message: string
  attachments: any[]
  scheduleDate?: string
  scheduleTime?: string
}

/**
 * Dispatches a mail in the background.
 * This function returns immediately after creating a pending entry in the store.
 */
export const sendMailInBackground = async ({
  user,
  recipientEmail: rawRecipient,
  subject,
  message,
  attachments,
  scheduleDate,
  scheduleTime
}: SendMailParams) => {
  const recipientEmail = rawRecipient.trim().toLowerCase()
  const mailId = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  
  // 1. Create a "Pending" entry in the store so the user sees it in 'Sent' or 'Outbox'
  const pendingMail = {
    id: mailId,
    senderEmail: user.email,
    receiverEmail: recipientEmail,
    subject,
    message, // Store raw message for optimistic local display
    time: new Date().toISOString(),
    status: recipientEmail === user.email ? "inbox" : "sent", 
    isPending: true,
    isOptimistic: true, 
    isDecrypted: true, // Show raw message immediately to sender
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
  }
  updateMailInStore(mailId, pendingMail)

  // 2. Perform the heavy lifting in a background-like async block
  ;(async () => {
    try {
      console.log(`🚀 [BackgroundSend] Starting dispatch for ${recipientEmail}`)
      
      // Step A: Recipient Lookup
      const isDmail = recipientEmail.endsWith("@dmail.com") || recipientEmail.endsWith("@securemail.com")
      let recipientData = null
      if (isDmail) {
        recipientData = await new Promise<any>(res => db.getUser(recipientEmail, res))
        if (!recipientData?.publicKey) {
          try {
            const { nostr } = await import("@/utils/nostr")
            const meshData = await nostr.find(recipientEmail, true)
            if (meshData?.publicKey) recipientData = meshData
          } catch {}
        }
      }
      if (!recipientData) recipientData = { email: recipientEmail, publicKey: null }

      // Step B: Parallel Processing
      const [powResults, encryptedMessage, finalAttachments] = await Promise.all([
        (async () => {
          if (typeof window !== "undefined" && !window.crypto?.subtle) return { nonce: 0, hash: "SKIP_INSECURE" }
          const mailHash = await hashMailContent(user.email, recipientEmail, subject)
          return await computePoW(mailHash, 1) // Using difficulty 1 as optimized earlier
        })(),

        (async () => {
          let msg = ""
          let attempts = 0
          let currentData = recipientData
          if (!currentData.publicKey) {
            return message
          }
          while (attempts < 2) {
            try {
              msg = await encryptMessage(message, currentData.publicKey, currentData.email)
              return msg
            } catch (encErr: any) {
              if (encErr.message.includes("IDENTITY_RECOVERY_FAILED") && attempts < 1) {
                attempts++
                await new Promise(r => setTimeout(r, 1000))
                const freshData = await new Promise<any>(res => db.getUser(recipientEmail, res))
                if (freshData?.publicKey) currentData = freshData
              } else throw encErr
            }
          }
          return msg
        })(),

        (async () => {
          const uploaded = []
          for (const att of attachments) {
            // Create a clean attachment object by omitting rawFile and data
            const { rawFile, data, ...cleanAtt } = att;
            
            if (att.type === "local" && att.rawFile && recipientData.publicKey) {
              console.log(`🛡️ [HybridEncrypt] Encrypting attachment: ${att.name}`)
              
              // 1. Hybrid Encrypt the file content
              const encryptedPackage = await hybridEncrypt(att.rawFile, recipientData.publicKey)
              
              // 2. Upload the encrypted package to IPFS
              const cid = await uploadToIPFS(encryptedPackage)
              
              uploaded.push({ ...cleanAtt, type: "ipfs_hybrid", cid })
            } else if (att.type === "local" && att.rawFile) {
              // Fallback if no public key (not secure, but better than nothing for local dev)
              const cid = await uploadFileToIPFS(att.rawFile, att.name)
              uploaded.push({ ...cleanAtt, type: "ipfs", cid })
            } else {
              uploaded.push(cleanAtt)
            }
          }
          return uploaded
        })()
      ])

      const { nonce: finalNonce, hash: finalHash } = powResults as any
      const ipfsRefs = (finalAttachments as any[])
        .filter((a) => a.type === "ipfs" || a.type === "ipfs_hybrid")
        .map((a) => `\n\n[IPFS Attachment: ${a.cid}${a.type === "ipfs_hybrid" ? " (Hybrid Encrypted)" : ""}]`)
        .join("")
 
      const mail = {
        id: mailId, // 🔥 PASS THE SAME ID
        senderEmail: user.email,
        receiverEmail: recipientEmail,
        subject,
        message: encryptedMessage + ipfsRefs,
        time: new Date().toISOString(),
        scheduledTimeText: scheduleDate && scheduleTime ? `${scheduleDate} ${scheduleTime}` : null,
        status: "inbox",
        isStarred: false,
        hasAttachments: (finalAttachments as any[]).length > 0,
        attachmentCount: (finalAttachments as any[]).length,
        attachments: finalAttachments,
        pow: { nonce: finalNonce, hash: finalHash, difficulty: finalHash ? 1 : 0 },
      }
 
      // Step C: Dispatch
      if (scheduleDate && scheduleTime) {
        const targetTime = new Date(`${scheduleDate}T${scheduleTime}`).getTime()
        const scheduledMail = { 
          ...mail, 
          message: message + ipfsRefs, 
          isDecrypted: true, 
          targetTime, 
          targetTimeText: `${scheduleDate} ${scheduleTime}`, 
        }
        const scheduledKey = `scheduled_${user.email}`
        const scheduledMails = JSON.parse(localStorage.getItem(scheduledKey) || "[]")
        scheduledMails.push(scheduledMail)
        localStorage.setItem(scheduledKey, JSON.stringify(scheduledMails))
        
        // Mark as purged in the current outbox since it's now in scheduled storage
        updateMailInStore(mailId, { status: "purged", isPending: false }) 
      } else {
        await sendMailNow(mail)
        if (user.publicKey && user.privateKey && user.password) {
          autoSaveContact(recipientEmail.split("@")[0], recipientEmail, user.email, user.publicKey, user.privateKey, user.password)
        }
        
        // 🛡️ [Sender Privacy Fix] 
        // Update the local store for the sender with the plaintext message.
        const { updateLocalMailInStore } = await import("@/utils/mailStore")
        updateLocalMailInStore(mailId, { ...mail, message: message + ipfsRefs, isDecrypted: true, isPending: false, fromCache: false })
      }
      
      console.log(`✅ [BackgroundSend] Dispatch complete for ${recipientEmail}`)
 
    } catch (err: any) {
      console.error("❌ [BackgroundSend] Critical Failure:", err)
      // Update the pending mail with error status
      updateMailInStore(mailId, { 
        status: "outbox", 
        isPending: false, 
        error: err?.message || "Failed to send",
        subject: `⚠️ Failed: ${subject}`
      })
    }
  })()
  
  return mailId
}
