import Gun from "gun"
import { uploadToIPFS, fetchFromIPFS } from "@/utils/ipfs"
import { uploadDataToWeb3 } from "@/utils/web3storage"
import { addToQueue, isOnline } from "@/utils/offlineQueue"
import { cacheMail, getCachedMails, updateCachedMail } from "@/utils/mailCache"

console.group("%c🛠️ DMail Kernel Loaded (v2.3 - Crypto Fix)", "color: gold; font-weight: bold")
console.log("Environment:", typeof window !== "undefined" ? "Browser" : "Node")
console.log("Secure Context:", typeof window !== "undefined" && window.isSecureContext ? "YES" : "NO")
console.log("Subtle Crypto:", typeof window !== "undefined" && !!window.crypto?.subtle ? "Available" : "Missing/Bridged")
console.groupEnd()

// ── Peer configuration ────────────────────────────────────────
const MASTER_IP = "130.1.6.173";

const getLocalRelay = () => {
  if (typeof window !== "undefined") {
    // If we are browsing via IP, use that IP. Otherwise, use the Master IP.
    const host = window.location.hostname === "localhost" ? MASTER_IP : window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${host}:8765/gun`;
  }
  return `http://${MASTER_IP}:8765/gun`;
};

const PUBLIC_RELAYS = [
  getLocalRelay(), // 🚀 DYNAMIC LOCAL PEER (Priority)
  "https://relay.peer.ooo/gun",
  "https://gun-manhattan.herokuapp.com/gun",
  "https://dmail-relay.onrender.com/gun", // Community node
  "wss://relay.peer.ooo/gun"
]

const getPeers = (): string[] => {
  return [...PUBLIC_RELAYS]
}

export const gun = Gun({
  peers: getPeers(),
  localStorage: true,
  radisk: false,
})

// ── Connection status ─────────────────────────────────────────
let gunConnected = false
gun.on("hi", (peer: any) => {
  gunConnected = true;
  const peerCount = Object.keys((gun as any)._?.opt?.peers || {}).length
  console.log(`%c🔌 GunDB connected (${peerCount} peers):`, "color: #4caf6e; font-weight: bold", peer?.url || peer)
})
gun.on("bye", (peer: any) => {
  // silence normal disconnect noise
  console.log("%c🔌 GunDB peer offline:", "color: #888", peer?.url || peer)
})
export const isGunConnected = () => gunConnected

export const checkGunServer = async (): Promise<{ reachable: boolean; url: string; error?: string }> => {
  if (gunConnected) {
    return { reachable: true, url: PUBLIC_RELAYS[0] }
  }
  await new Promise(r => setTimeout(r, 2000))
  return {
    reachable: gunConnected,
    url: PUBLIC_RELAYS[0],
    error: gunConnected ? undefined : "Unable to reach global network"
  }
}


/* =========================
   🛡️ CRYPTO BRIDGE
========================= */

let cachedOpenPGP: any = null

/**
 * Robustly loads OpenPGP.js dynamically.
 * Handles both ESM and CJS bundling artifacts (e.g. .default wrapping).
 * Throws a clear error if WebCrypto is unavailable (non-secure context).
 */
export const getOpenPGP = async () => {
  if (cachedOpenPGP) return cachedOpenPGP

  // 1. Check for WebCrypto availability or our bridge stub
  if (typeof window !== "undefined") {
    const isStub = !!(window.crypto?.subtle as any)?.__isStub
    if (!window.crypto?.subtle || isStub || !window.isSecureContext) {
      console.warn("🛡️ WebCrypto restricted or bridled. Secure context required for native acceleration.")
      // We don't throw yet; we let the library try to load, then we configure it.
    }
  }

  try {
    const rawPgp = await import("openpgp")
    const lib: any = (rawPgp as any).default || rawPgp

    // Resolve the actual module
    let openpgp = lib
    if (typeof lib.generateKey !== "function" && lib.openpgp) {
      openpgp = lib.openpgp
    }

    if (typeof openpgp.generateKey !== "function") {
      throw new Error(`PGP_BNDL_ERR: generateKey not found. Keys: [${Object.keys(openpgp).join(", ")}]`)
    }

    // 2. Configure for environment
    if (typeof window !== "undefined") {
      const isStub = !!(window.crypto?.subtle as any)?.__isStub
      if (isStub || !window.isSecureContext) {
        // Force OpenPGP to avoid using the broken/missing native SubtleCrypto
        if (openpgp.config) {
          // Disabling native usage forces OpenPGP to its internal pure-JS fallbacks
          if (openpgp.config.use_native !== undefined) openpgp.config.use_native = false;
          if (openpgp.config.use_native_hw !== undefined) openpgp.config.use_native_hw = false;
          
          // Disable any web worker crypto to keep everything in the main thread fallback
          if (openpgp.config.use_web_worker !== undefined) openpgp.config.use_web_worker = false;

          // v6 specific fallbacks
          openpgp.config.useEllipticFallback = true;
          console.log("🛡️ OpenPGP Configured: Forced JS Fallbacks enabled (Native HW Disabled).");
        }
        
        if (isStub) {
          (openpgp as any).__isUsingStub = true;
          console.info("🛡️ Bridge Active: Bypassing browser-enforced WebCrypto restrictions.");
        }
      }
    }

    cachedOpenPGP = openpgp
    return cachedOpenPGP
  } catch (error: any) {
    console.error("❌ OpenPGP Load Failed:", error)
    throw error
  }
}


export const generateKeyPair = async (name: string, email: string, password: string) => {
  try {
    console.log("⚡ Starting Key Generation for:", email)
    const openpgp = await getOpenPGP()
    
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519",
      userIDs: [{ name, email }],
      passphrase: password,
      format: "armored"
    })
    
    if (!privateKey || !publicKey) {
      throw new Error("PGP_GEN_EMPTY: Keys returned were empty or undefined")
    }

    console.log("✅ Key Generation Success")
    return { publicKey, privateKey }
  } catch (err: any) {
    console.error("❌ Key Generation Failed:", { message: err?.message || err, stack: err?.stack })
    throw err
  }
}

/**
 * Generates a Decentralized Identifier (DID) from a PGP Public Key.
 * Format: did:dmail:hashed_fingerprint
 */
export const generateDID = async (publicKeyArmored: string): Promise<string> => {
  try {
    const openpgp = await getOpenPGP()
    const key = await openpgp.readKey({ armoredKey: publicKeyArmored })
    const fingerprint = key.getFingerprint()
    return `did:dmail:${fingerprint.toLowerCase()}`
  } catch (err) {
    console.error("❌ DID Generation Failed:", err)
    throw err
  }
}

/* =========================
   🔐 ENCRYPT MESSAGE
========================= */
export const encryptMessage = async (message: string, recipientPublicKey: string): Promise<string> => {
  const openpgp = await getOpenPGP()

  if (!recipientPublicKey) throw new Error("Missing recipient public key")
  if (message.includes("-----BEGIN PGP MESSAGE-----")) {
    console.warn("⚠️ Message already encrypted — skipping re-encryption")
    return message
  }
  const pubKey = await openpgp.readKey({ armoredKey: recipientPublicKey })
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: message }),
    encryptionKeys: pubKey,
    format: "armored"
  })
  return encrypted as string
}

/* =========================
   🔓 DECRYPT MESSAGE
========================= */
export const decryptMessage = async (
  encryptedMessage: string,
  privateKeyArmored: string,
  password: string
): Promise<string> => {
  const openpgp = await getOpenPGP()

  if (!encryptedMessage?.includes("-----BEGIN PGP MESSAGE-----")) {
    return encryptedMessage
  }

  // throws on wrong password — caller handles the error
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase: password,
  })
  const message = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey })
  return data as string
}

/* =========================
   🔐 SIGN DATA
 ========================= */
export const signData = async (data: string, privateKeyArmored: string, password: string): Promise<string> => {
  const openpgp = await getOpenPGP()

  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase: password,
  })
  const signature = await openpgp.sign({
    message: await openpgp.createMessage({ text: data }),
    signingKeys: privateKey,
    detached: true,
    format: "armored"
  })
  return signature as string
}

/* =========================
   🛡️ VERIFY SIGNATURE
 ========================= */
export const verifySignature = async (data: string, signatureArmored: string, publicKeyArmored: string): Promise<boolean> => {
  try {
    const openpgp = await getOpenPGP()
    const msg = await openpgp.createMessage({ text: data })
    const pubKey = await openpgp.readKey({ armoredKey: publicKeyArmored })
    const sig = await openpgp.readSignature({ armoredSignature: signatureArmored })
    const verification = await openpgp.verify({
      message: msg,
      signature: sig,
      verificationKeys: pubKey,
    })
    const { verified } = verification.signatures[0]
    await verified // throws on error
    return true
  } catch (err) {
    console.error("❌ Signature verification failed:", err)
    return false
  }
}

/* =========================
   📤 SEND MAIL
========================= */
export const sendMailNow = async (mail: any): Promise<string> => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`

  try {
    const mailToStore = { ...mail, id, receiverPublicKey: undefined }

    let cid: string
    try {
      // 🚀 Global Storage (Web3.Storage)
      cid = await uploadDataToWeb3(mailToStore)
      console.log("🚀 Uploaded to Web3.Storage:", cid)
    } catch (w3err) {
      console.warn("⚠️ Web3.Storage not ready, falling back to local Kubo:", w3err)
      cid = await uploadToIPFS(mailToStore)
    }

    const mailIndex = {
      id,
      cid,
      senderEmail: mail.senderEmail,
      receiverEmail: mail.receiverEmail,
      subject: mail.subject,
      time: mail.time,
      // ✅ Store both "sent" for sender and pass through actual status for receiver
      status: mail.status || "inbox",
      senderStatus: "sent",   // ← NEW: tracks status from sender's perspective
      isStarred: mail.isStarred || false,
      isPinned: false,
      hasAttachments: mail.hasAttachments || false,
      attachmentCount: mail.attachmentCount || 0,
      pow: mail.pow || null,
      isReply: mail.isReply || false,
      isForward: mail.isForward || false,
      originalId: mail.originalId || null,
    }

    console.log("📨 Step 3: Pushing to Global Relay indices...")
    await new Promise<void>((resolve) => {
      // 1. Global Bucket (Legacy fallback)
      console.log("   - Global bucket push...")
      gun.get("securemail_mails").get(id).put(mailIndex, (ack: any) => {
        if (ack.err) console.error("   ❌ GunDB global write error:", ack.err)
        else console.log("   ✅ Global bucket sync ack")
        resolve()
      })
      
      // 2. Sender Index (For Sent history sync)
      console.log(`   - Sender index push: ${mail.senderEmail}`)
      gun.get(`user_mail_index:${mail.senderEmail}`).get(id).put(mailIndex)
      
      // 3. Receiver Index (For Inbox/Historical sync)
      console.log(`   - Receiver index push: ${mail.receiverEmail}`)
      gun.get(`user_mail_index:${mail.receiverEmail}`).get(id).put(mailIndex)

      setTimeout(() => {
        console.warn("   ⏱️ Index sync wait timeout (continuing)")
        resolve()
      }, 3000)
    })

    const { updateMailInStore } = await import("@/utils/mailStore")
    updateMailInStore(id, { ...mailIndex, senderStatus: "sent" })

    console.log("%c📫 SUCCESS: Mail fully processed and pushed to network.", "color: #4caf6e; font-weight: bold", id)
    return id

  } catch (err) {
    console.error("❌ IPFS upload failed — storing directly in GunDB:", err)
    const fallback = { ...mail, id, receiverPublicKey: undefined, senderStatus: "sent" }
    
    gun.get("securemail_mails").get(id).put(fallback)
    gun.get(`user_mail_index:${mail.senderEmail}`).get(id).put(fallback)
    gun.get(`user_mail_index:${mail.receiverEmail}`).get(id).put(fallback)

    const { updateMailInStore } = await import("@/utils/mailStore")
    updateMailInStore(id, fallback)
    return id
  }
}

/* =========================
   🗄️ DATABASE
========================= */
export const db = {

  registerUser: async (user: any) => {
    const cleanEmail = user.email.trim().toLowerCase()
    const did = await generateDID(user.publicKey)
    const userData = {
      email: cleanEmail,
      name: user.name,
      publicKey: user.publicKey,
      privateKey: user.privateKey,
      password: user.password,
      did,
      registeredAt: new Date().toISOString()
    }
    gun.get("securemail_users").get(cleanEmail).put(userData, (ack: any) => {
      if (ack.err) console.error("❌ Failed to register user:", ack.err)
      else console.log("✅ User registered & announced:", cleanEmail, "| DID:", did)
    })
    gun.get("securemail_pubkeys").get(cleanEmail).put({ 
      email: cleanEmail, 
      publicKey: user.publicKey,
      did 
    })
  },

  getUser: (email: string, cb: (data: any) => void) => {
    let cleanEmail = email.trim().toLowerCase()
    
    // Auto-fix domain mismatch for user convenience
    if (cleanEmail.endsWith("@dmail.com")) {
      cleanEmail = cleanEmail.replace("@dmail.com", "@securemail.com")
    }

    let calledBack = false
    
    console.log(`🔍 [db.getUser] Looking up: ${cleanEmail} (Connected: ${gunConnected})`)
    
    // Safety timeout: 15s to allow slower P2P mesh discovery
    const safety = setTimeout(() => {
      if (!calledBack) {
        console.warn(`⏳ [db.getUser] TIMEOUT for ${cleanEmail}. Check if the user is registered and the relay is active.`)
        cleanup()
        calledBack = true
        cb(null)
      }
    }, 15000)

    const onUsers = (data: any) => {
      if (calledBack) return
      if (data?.email && data?.publicKey) {
        calledBack = true
        clearTimeout(safety)
        cleanup()
        cb(data)
      }
    }

    const onPubkeys = (pkData: any) => {
      if (calledBack) return
      if (pkData?.publicKey) {
        calledBack = true
        clearTimeout(safety)
        cleanup()
        cb({ email: cleanEmail, publicKey: pkData.publicKey, ...pkData })
      }
    }

    const cleanup = () => {
      gun.get("securemail_users").get(cleanEmail).off()
      gun.get("securemail_pubkeys").get(cleanEmail).off()
    }

    // Start Live Listeners
    gun.get("securemail_users").get(cleanEmail).on(onUsers)
    gun.get("securemail_pubkeys").get(cleanEmail).on(onPubkeys)
  },

  sendMail: async (mail: any): Promise<{ id: string; queued: boolean }> => {
    const online = await isOnline()
    if (!online) {
      const queueId = addToQueue(mail)
      await cacheMail({ ...mail, id: queueId, status: "queued" })
      return { id: queueId, queued: true }
    }

    const serverCheck = await checkGunServer()
    if (!serverCheck.reachable) {
      const queueId = addToQueue(mail)
      await cacheMail({ ...mail, id: queueId, status: "queued" })
      return { id: queueId, queued: true }
    }

    return new Promise((resolve, reject) => {
      db.getUser(mail.receiverEmail, async (recipient) => {
        if (!recipient?.publicKey) {
          return reject(new Error(
            `Recipient ${mail.receiverEmail} not found. Make sure they are registered.`
          ))
        }
        try {
          // ✅ Encrypt with recipient's public key before sending
          const encryptedMessage = await encryptMessage(mail.message, recipient.publicKey)
          const id = await sendMailNow({ ...mail, message: encryptedMessage })
          resolve({ id, queued: false })
        } catch (err) {
          reject(err)
        }
      })
    })
  },

  getMailContent: async (cid: string): Promise<any> => {
    return await fetchFromIPFS(cid)
  },

  // ✅ Self-Healing: Re-announce presence to ensure relay has our latest info
  reannounceUser: async () => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email || !user.publicKey) return

    const cleanEmail = user.email.trim().toLowerCase()
    console.log(`📡 [Sync] Re-announcing presence for: ${cleanEmail}`)

    const info = {
      email: cleanEmail,
      name: user.name,
      publicKey: user.publicKey,
      did: user.did || `did:dmail:${user.publicKey.slice(0, 16)}`,
      lastActive: new Date().toISOString()
    }

    gun.get("securemail_users").get(cleanEmail).put(info, (ack: any) => {
      if (ack.err) console.warn("📡 [Sync] Re-announcement failed:", ack.err)
      else console.log("📡 [Sync] Identity successfully synced with relay.")
    })

    gun.get("securemail_pubkeys").get(cleanEmail).put({ 
      email: cleanEmail, 
      publicKey: user.publicKey,
      did: info.did
    })
  },

  // ✅ Listen for mails specifically belonging to this user (Cross-device sync optimized)
  listenUserMails: (userEmail: string, cb: (mail: any) => void) => {
    // 1. Initial Load of Cache
    getCachedMails(userEmail).then((cached) => {
      cached.forEach((mail) => cb({ ...mail, fromCache: true }))
    })

    // 2. Optimized Indexed Sync
    gun.get(`user_mail_index:${userEmail}`).map().on(async (mail: any) => {
      if (!mail || !mail.id) return
      await cacheMail(mail)
      cb({ ...mail, fromCache: false })
    })

    // 3. Legacy Stream (Optional fallback for older records not in user_mail_index)
    gun.get("securemail_mails").map().on(async (mail: any) => {
      if (!mail || !mail.id) return
      if (mail.receiverEmail === userEmail || mail.senderEmail === userEmail) {
        cb(mail)
      }
    })
  },

  // ✅ NEW: Listen for sent mails (sent folder)
  listenSentMails: (senderEmail: string, cb: (mail: any) => void) => {
    gun.get("securemail_mails").map().on(async (mail: any) => {
      if (!mail || mail.senderEmail !== senderEmail) return
      await cacheMail(mail)
      cb(mail)
    })
  },

  updateMail: (id: string, updates: object) => {
    gun.get("securemail_mails").get(id).put(updates)
    updateCachedMail(id, updates)
  },

  pinMail: (id: string, isPinned: boolean) => {
    gun.get("securemail_mails").get(id).put({ isPinned })
    updateCachedMail(id, { isPinned })
  },

  // ── P2P SIGNALING (For Calls) ────────────────────────────────
  sendSignal: (toEmail: string, fromEmail: string, type: string, data: any) => {
    const signalId = `sig_${Date.now()}`
    gun.get("securemail_signals").get(toEmail).get(signalId).put({
      from: fromEmail,
      type,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString()
    })
  },

  listenSignals: (email: string, onSignal: (sig: any, id: string) => void) => {
    gun.get("securemail_signals").get(email).map().on((sig: any, id: string) => {
      if (!sig || !sig.from) return
      // Only process signals from the last 60 seconds to avoid old call "ghosts"
      const age = Date.now() - new Date(sig.timestamp).getTime()
      if (age < 60000) {
        onSignal({ ...sig, data: JSON.parse(sig.data) || sig.data, signalId: id }, id)
      }
    })
  }
}