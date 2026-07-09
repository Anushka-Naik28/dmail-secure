import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import CryptoJS from "crypto-js";
import { getGatewayConfig } from "./config_manager.js";

let smtpTransporter = null;
let imapClient = null;
let isImapSyncing = false;
let imapSyncTimeout = null;

// Initialize SMTP from configuration
export const initSMTPTransporter = () => {
  const config = getGatewayConfig();
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    console.log(`✉️ [SMTP] Initializing transporter for ${config.smtpHost}:${config.smtpPort}`);
    smtpTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: parseInt(config.smtpPort || "587"),
      secure: config.smtpSecure === true || config.smtpSecure === "true",
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });
  } else {
    smtpTransporter = null;
    console.warn("⚠️ [SMTP] SMTP credentials not fully configured. Outbound email disabled.");
  }
};

// Fetch attachment buffer from IPFS gateway
const fetchIPFSAttachment = async (cid) => {
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `http://127.0.0.1:8080/ipfs/${cid}`
  ];

  for (const url of gateways) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (e) {
      console.warn(`⚠️ [Gateway] Failed to fetch CID ${cid} from ${url}:`, e.message);
    }
  }
  throw new Error(`Failed to fetch attachment content from IPFS for CID ${cid}`);
};

// Send SMTP Email (handles attachments, CC, BCC, Reply-To)
export const sendSMTPEmail = async (mailData) => {
  if (!smtpTransporter) {
    initSMTPTransporter();
    if (!smtpTransporter) {
      throw new Error("SMTP Gateway is not configured on the server.");
    }
  }

  const config = getGatewayConfig();
  const { receiverEmail, subject, message, html, attachments, cc, bcc, replyTo } = mailData;

  const mailOptions = {
    from: config.smtpFrom || `${config.smtpUser}`,
    to: receiverEmail,
    subject: subject,
    text: message,
    html: html || message.replace(/\n/g, "<br>"),
    cc: cc || undefined,
    bcc: bcc || undefined,
    replyTo: replyTo || undefined,
    headers: {
      "X-Mailer": "DMail Hybrid Gateway",
      "X-DMail-Outbound": "true"
    }
  };

  // Download and append IPFS attachments if present
  if (attachments && attachments.length > 0) {
    mailOptions.attachments = [];
    console.log(`📎 [SMTP] Resolving ${attachments.length} attachments from IPFS...`);
    for (const att of attachments) {
      if (att.cid) {
        try {
          const buffer = await fetchIPFSAttachment(att.cid);
          mailOptions.attachments.push({
            filename: att.name || "attachment",
            content: buffer,
            contentType: att.type || "application/octet-stream"
          });
          console.log(`✅ [SMTP] Resolved attachment: ${att.name} (${att.cid})`);
        } catch (err) {
          console.error(`❌ [SMTP] Failed to attach file ${att.name}:`, err.message);
          throw err;
        }
      }
    }
  }

  const info = await smtpTransporter.sendMail(mailOptions);
  console.log(`🚀 [SMTP] Email relayed successfully. Message-ID: ${info.messageId}`);
  return info;
};

// Upload attachment to Pinata/IPFS from the backend
const uploadAttachmentToIPFS = async (buffer, filename, mimeType, pinataJwt) => {
  if (!pinataJwt) {
    throw new Error("Pinata JWT not configured on backend");
  }
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, filename || `attachment_${Date.now()}`);
  formData.append("pinataMetadata", JSON.stringify({ name: filename || `attachment_${Date.now()}` }));
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pinataJwt}`
    },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinata upload failed: ${errText}`);
  }

  const result = await response.json();
  return result.IpfsHash;
};

// Background IMAP Sync Worker
export const startIMAPSync = async (gun) => {
  // Stop existing worker/timeouts
  if (imapSyncTimeout) {
    clearTimeout(imapSyncTimeout);
    imapSyncTimeout = null;
  }
  
  if (imapClient) {
    try {
      console.log("🔌 [IMAP] Disconnecting existing client...");
      await imapClient.logout();
    } catch (e) {}
    imapClient = null;
  }

  const config = getGatewayConfig();
  if (!config.imapHost || !config.imapUser || !config.imapPass) {
    console.warn("⚠️ [IMAP] IMAP credentials not fully configured. Inbound sync disabled.");
    return;
  }

  console.log(`🔌 [IMAP] Connecting to ${config.imapHost}:${config.imapPort}...`);

  imapClient = new ImapFlow({
    host: config.imapHost,
    port: parseInt(config.imapPort || "993"),
    secure: config.imapSecure === true || config.imapSecure === "true",
    auth: {
      user: config.imapUser,
      pass: config.imapPass
    },
    logger: false
  });

  const performSync = async () => {
    if (isImapSyncing) return;
    isImapSyncing = true;
    console.log("📥 [IMAP] Starting sync check...");

    let lock = null;
    try {
      await imapClient.connect();
      lock = await imapClient.getMailboxLock("INBOX");

      // Query recent emails (last 100 messages)
      const list = await imapClient.search({ all: true });
      const recentUids = list.slice(-100); // Last 100 messages

      console.log(`📥 [IMAP] Scanning last ${recentUids.length} messages in INBOX...`);

      const pinataJwt = process.env.PINATA_JWT || "";

      for (const uid of recentUids) {
        const messageSource = await imapClient.fetchOne(uid, { source: true });
        if (!messageSource || !messageSource.source) continue;

        const parsed = await simpleParser(messageSource.source);
        const messageId = parsed.messageId;
        if (!messageId) continue;

        // Construct unique deterministic GunDB ID
        const mailId = "smtp_" + CryptoJS.SHA256(messageId).toString();

        // Check if message already exists in GunDB
        const exists = await new Promise((resolve) => {
          gun.get("securemail_mails").get(mailId).once((data) => {
            resolve(!!data);
          });
          setTimeout(() => resolve(false), 2000); // 2s timeout fallback
        });

        if (exists) {
          continue; // Already synced, skip
        }

        console.log(`📩 [IMAP] Syncing new email: ${parsed.subject || "(No Subject)"}`);

        // Upload attachments to IPFS
        const attachments = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            try {
              if (pinataJwt) {
                console.log(`📎 [IMAP] Uploading attachment ${att.filename} to IPFS...`);
                const cid = await uploadAttachmentToIPFS(att.content, att.filename, att.contentType, pinataJwt);
                attachments.push({
                  name: att.filename,
                  size: att.size,
                  type: att.contentType,
                  cid: cid
                });
              } else {
                console.warn(`⚠️ [IMAP] Pinata not configured. Attachment ${att.filename} skipped.`);
              }
            } catch (attErr) {
              console.error(`❌ [IMAP] Failed to upload attachment ${att.filename} to IPFS:`, attErr.message);
            }
          }
        }

        const cleanEmail = config.imapUser.trim().toLowerCase();
        
        // Convert to DMail schema
        const senderEmail = parsed.from?.value?.[0]?.address || "unknown@email.com";
        const senderName = parsed.from?.value?.[0]?.name || senderEmail.split("@")[0];
        
        const mailObj = {
          id: mailId,
          senderEmail: senderEmail,
          senderName: senderName,
          receiverEmail: cleanEmail,
          subject: parsed.subject || "(No Subject)",
          message: parsed.text || parsed.textAsHtml || "",
          html: parsed.html || parsed.textAsHtml || "",
          time: (parsed.date || new Date()).toISOString(),
          status: "inbox",
          source: "smtp",
          hasAttachments: attachments.length > 0,
          attachmentCount: attachments.length,
          attachments: attachments,
          isRead: false,
          isStarred: false,
          isPinned: false
        };

        // Write directly to GunDB
        gun.get("securemail_mails").get(mailId).put(mailObj);
        gun.get(`user_mail_index:${cleanEmail}`).get(mailId).put(mailObj);

        // Also write to sender index so it matches standard GunDB indexing structure
        gun.get(`user_mail_index:${senderEmail.toLowerCase()}`).get(mailId).put(mailObj);

        console.log(`✅ [IMAP] Synced: ${mailObj.subject} (ID: ${mailId})`);
      }
    } catch (err) {
      console.error("❌ [IMAP] Error during sync:", err.message);
    } finally {
      if (lock) {
        try {
          lock.release();
        } catch (e) {}
      }
      isImapSyncing = false;
      try {
        await imapClient.logout();
      } catch (e) {}
    }

    // Schedule next polling interval (every 2 minutes)
    imapSyncTimeout = setTimeout(performSync, 120000);
  };

  // Run the first sync immediately
  performSync();
};
