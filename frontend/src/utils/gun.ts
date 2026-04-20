import Gun from "gun"
import { uploadToIPFS, fetchFromIPFS, uploadPublicKey, fetchPublicKeyFromIPFS, uploadToPinata, uploadFileToPinata, isPinataConfigured } from "@/utils/ipfs"
import { uploadDataToWeb3 } from "@/utils/web3storage"
import { addToQueue, isOnline } from "@/utils/offlineQueue"
import { cacheMail, getCachedMails, updateCachedMail } from "@/utils/mailCache"
import { nostr } from "@/utils/nostr"

// console.group("%c🛠️ DMail Kernel Loaded (v2.3 - Crypto Fix)", "color: gold; font-weight: bold")
// console.log("Environment:", typeof window !== "undefined" ? "Browser" : "Node")
// console.log("Secure Context:", typeof window !== "undefined" && window.isSecureContext ? "YES" : "NO")
// console.log("Subtle Crypto:", typeof window !== "undefined" && !!window.crypto?.subtle ? "Available" : "Missing/Bridged")
// console.groupEnd()

// ── Peer configuration ────────────────────────────────────────
const MASTER_IP = "130.1.6.173";

// 🛡️ [Global Anti-Spam] Track reported issues per-session to prevent listener loops
const reportedEmails = new Set<string>();
const reportedKeys = new Set<string>();
const reportedWarnings = new Set<string>();

// Verified working public GunDB relays (tested April 2025)
// ❌ REMOVED: gun-us/eu/ams/sydney.herokuapp.com (Heroku killed free tier)
// ❌ REMOVED: peer.wallie.io (consistently down)
// ❌ REMOVED: dmail-relay.onrender.com (doesn't exist yet)
const GLOBAL_RELAY_POOL = [
  "https://relay.peer.ooo/gun",      // ✅ Most reliable 
  "https://gun-manhattan.herokuapp.com/gun", // ✅ Still running
  "https://gundb.io/gun",             // ✅ Official GunDB relay
  "https://gun.eco/gun",              // ✅ gun.eco
]

const getPeers = (): string[] => {
  const peers = new Set<string>();
  
  // 1. Local relay (works on LAN)
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    peers.add(`${protocol}//${window.location.hostname}:8765/gun`);
    peers.add(`http://localhost:8765/gun`);

    // Check for a user-discovered relay
    const discovered = localStorage.getItem("dmail_discovered_relay");
    if (discovered) peers.add(discovered);
  }
  
  // 2. ALWAYS include ALL global public relays — not just 4 random ones.
  // This is critical for cross-network (different Wi-Fi) device sync.
  GLOBAL_RELAY_POOL.forEach(p => peers.add(p));
  
  const finalPeers = Array.from(peers);
  console.log("📡 [Network] Connecting to peers:", finalPeers.length, "total");
  return finalPeers;
}

export const gun = Gun({
  peers: getPeers(),
  localStorage: true,
  radisk: false,
})

// ── Connection status ─────────────────────────────────────────
let connectedPeers = new Set<string>()
let gunConnected = false

gun.on("hi", (peer: any) => {
  gunConnected = true
  if (peer.url) connectedPeers.add(peer.url)
  // console.log(`📡 [Network] Connected to peer: ${peer.url || "unknown"}`)
})

gun.on("bye", (peer: any) => {
  if (peer.url) connectedPeers.delete(peer.url)
})

export const getGunPeerCount = () => connectedPeers.size || (gunConnected ? 1 : 0)
export const isGunConnected = () => gunConnected || connectedPeers.size > 0

export const checkGunServer = async (): Promise<{ reachable: boolean; url: string; peers?: number; error?: string }> => {
  const count = getGunPeerCount()
  const currentHost = typeof window !== "undefined" ? window.location.hostname : MASTER_IP
  const currentProtocol = typeof window !== "undefined" ? window.location.protocol : "http:"
  const localUrl = `${currentProtocol}//${currentHost}:8765/gun`
  
  if (count > 0 || gunConnected) {
    return { reachable: true, url: localUrl, peers: count || 1 }
  }
  
  // Explicitly check for discovered relays if the default is down
  const discovered = typeof window !== "undefined" ? localStorage.getItem("dmail_discovered_relay") : null;
  const testUrl = discovered || localUrl;

  // Explicitly try to ping the candidate relay
  try {
    const health = await fetch(`${testUrl.replace("/gun", "/health")}`).then(r => r.json())
    if (health.status === "ok") {
       console.log("📡 [Sync] Discovered relay reachable. Handshaking...")
       return { reachable: true, url: testUrl, peers: 0 }
    }
  } catch (e) {
    console.warn("📡 [Sync] Primary relay unreachable:", testUrl)
  }

  return {
    reachable: gunConnected,
    url: testUrl,
    peers: count,
    error: gunConnected ? undefined : "Unable to reach global network. Check internet connection."
  }
}

/**
 * 🛰️ ZERO-CONFIG RELAY DISCOVERY
 * This allows Device A (Relay) to announce its IP to Device B (Remote) automatically.
 */
export const startRelayDiscovery = () => {
  if (typeof window === "undefined") return;

  // 1. ANNOUNCE: If I am the relay host, announce my origin to the mesh
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === MASTER_IP) {
     const announceRelay = async () => {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        // We broadcast our origin as a potential relay for others on the same network
        const relayUrl = `${protocol}//${window.location.hostname}:8765/gun`;
        console.log("🛰️ [Discovery] I am a potential relay. Announcing to global mesh:", relayUrl);
        gun.get("dmail_active_relays").get("primary_master").put({ 
           url: relayUrl, 
           timestamp: Date.now() 
        });
     };
     setTimeout(announceRelay, 5000); // Wait for master connection before announcing
     setInterval(announceRelay, 60000); // Heartbeat
  }

  // 2. DISCOVER: Listen for active relay announcements from others
  gun.get("dmail_active_relays").get("primary_master").on((data: any) => {
     if (data?.url && data.url !== localStorage.getItem("dmail_discovered_relay")) {
        const age = Date.now() - (data.timestamp || 0);
        if (age < 300000) { // Only trust relays announced in the last 5 mins
           console.log("🛰️ [Discovery] Found new master relay in global mesh:", data.url);
           localStorage.setItem("dmail_discovered_relay", data.url);
        }
     }
  });
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
      if (!reportedWarnings.has("webcrypto-restricted")) {
        console.warn("🛡️ WebCrypto restricted or bridled. Secure context required for native acceleration.")
        reportedWarnings.add("webcrypto-restricted")
      }
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
          // console.log("🛡️ OpenPGP Configured: Forced JS Fallbacks enabled (Native HW Disabled).");
        }
        
        if (isStub) {
          (openpgp as any).__isUsingStub = true;
          if (!reportedWarnings.has("bridge-active")) {
            console.info("🛡️ Bridge Active: Bypassing browser-enforced WebCrypto restrictions.");
            reportedWarnings.add("bridge-active")
          }
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

/**
 * 🛠️ Robust Sanitization: Cleans extra whitespace but preserves PGP packet integrity.
 * Previously used aggressive slicing which could truncate RSA keys or keys with multiple subkeys.
 */
const sanitizeArmoredKey = (key: string): string => {
  if (!key) return ""
  let cleaned = key.trim()
  
  // Basic validation that markers exist
  if (!cleaned.includes("-----BEGIN PGP PUBLIC KEY BLOCK-----") || 
      !cleaned.includes("-----END PGP PUBLIC KEY BLOCK-----")) {
    console.warn("⚠️ PGP Key missing markers - possible corruption")
  }
  
  // Remove any leading/trailing garbage that might have been picked up during transport
  const match = cleaned.match(/-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+?-----END PGP PUBLIC KEY BLOCK-----/)
  return match ? match[0] : cleaned
}

/**
 * 🛡️ Key Integrity Check: Uses OpenPGP.js to verify the key packet and its self-signatures.
 */
export const isKeyValid = async (armoredKey: string): Promise<boolean> => {
  try {
    const openpgp = await getOpenPGP()
    const sanitized = sanitizeArmoredKey(armoredKey)
    const key = await openpgp.readKey({ armoredKey: sanitized })
    
    // Ensure the key has at least one valid identity binding (self-signature)
    const ids = key.getUserIDs()
    if (ids.length === 0) return false

    // 🔬 DEEP VALIDATION: Try a dummy encryption to ensure self-signatures are complete
    // This catches "stripped" 1937-char keys that simple readKey doesn't catch.
    try {
      await openpgp.encrypt({
        message: await openpgp.createMessage({ text: "health-check" }),
        encryptionKeys: key,
        format: "armored"
      })
      return true
    } catch (encryptErr: any) {
      if (!reportedKeys.has(sanitized)) {
        console.warn("🛡️ Health Check Failed: Key is readable but not encryptable (Likely stripped).")
        reportedKeys.add(sanitized)
      }
      return false
    }
  } catch (err) {
    console.warn("❌ Key Integrity Check Failed:", err)
    return false
  }
}

/**
 * 🛠️ Identity Repair: Derives a complete, valid public key from a private key.
 * This is used to fix truncation/mangling that occurred during network propagation.
 */
export const repairPublicKeyFromPrivate = async (privateKeyArmored: string): Promise<string | null> => {
  try {
    const openpgp = await getOpenPGP()
    const privKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored })
    
    // Extract the public key packets from the private key
    // This maintains all subkeys and user IDs but ensures the armor is complete.
    const pubKey = privKey.toPublic()
    
    return pubKey.armor()
  } catch (err) {
    console.error("❌ Local Identity Repair Failed:", err)
    return null
  }
}

/* =========================
   📦 HEALTHY KEY CACHE (LKH)
   Protects against network truncation
========================= */
const getCachedPubKey = (email: string): string | null => {
  if (typeof window === "undefined") return null
  const cache = JSON.parse(localStorage.getItem("dmail_key_cache") || "{}")
  return cache[email] || null
}

const cachePubKey = (email: string, publicKey: string) => {
  if (typeof window === "undefined" || !publicKey) return
  const cache = JSON.parse(localStorage.getItem("dmail_key_cache") || "{}")
  cache[email] = publicKey
  localStorage.setItem("dmail_key_cache", JSON.stringify(cache))
}

/* =========================
   🔐 ENCRYPT MESSAGE
========================= */
export const encryptMessage = async (
  message: string, 
  recipientPublicKey: string, 
  recipientEmail?: string
): Promise<string> => {
  const openpgp = await getOpenPGP()

  if (!recipientPublicKey && recipientEmail) {
    recipientPublicKey = getCachedPubKey(recipientEmail) || ""
  }

  if (!recipientPublicKey && !recipientEmail) {
    throw new Error("Missing recipient public key and email (cannot initiate recovery)")
  }
  
  const sanitizedKey = recipientPublicKey ? sanitizeArmoredKey(recipientPublicKey) : ""
  
  if (message.includes("-----BEGIN PGP MESSAGE-----")) {
    console.warn("⚠️ Message already encrypted — skipping re-encryption")
    return message
  }

  const performEncryption = async (keyData: string) => {
    const pubKey = await openpgp.readKey({ armoredKey: keyData })
    const ids = pubKey.getUserIDs()
    if (ids.length === 0) throw new Error("KEY_HEALTH_INCOMPLETE")

    const encrypted = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: message }),
      encryptionKeys: pubKey,
      format: "armored"
    })
    
    // If successful, cache this key as "Last Known Healthy"
    if (recipientEmail) cachePubKey(recipientEmail, keyData)
    
    return encrypted as string
  }

  try {
    return await performEncryption(sanitizedKey)
  } catch (err: any) {
    // If it fails and we have an email, try the "Discovery Storm"
    if (recipientEmail) {
      console.log(`🌪️ [Discovery Storm] Healing identity for ${recipientEmail}...`)
      
      // Check cache first (redundant but safe)
      const cached = getCachedPubKey(recipientEmail)
      if (cached && cached !== sanitizedKey && (await isKeyValid(cached))) {
        console.log("✅ [Discovery Storm] Found healthy version in local cache.")
        return await performEncryption(cached)
      }

      // 1. Trigger Proactive Mesh Repair
      nostr.announceRepairRequest(recipientEmail) // Shouts on Nostr

      // 2. Poll all discovery layers simultaneously
      const startTime = Date.now()
      while (Date.now() - startTime < 12000) { // Extended 12-second deep wait
        const results = await Promise.all([
          nostr.find(recipientEmail, true), // Passing 'true' to get raw metadata including CIDs
          new Promise<any>(res => {
            db.getUser(recipientEmail, (u) => res(u))
            setTimeout(() => res(null), 2000)
          })
        ])

        for (const found of results) {
          if (!found) continue;
          
          let pubKeyToTry = found.publicKey || (typeof found === 'string' ? found : "");
          
          // 🛡️ [Final Shield] If key is truncated but we have an IPFS CID, fetch the perfect copy
          if ((!pubKeyToTry || !(await isKeyValid(pubKeyToTry))) && found.publicKeyCID) {
             console.log("🛡️ [IPFS Anchor] Truncated key detected. Fetching master copy from IPFS CID:", found.publicKeyCID);
             const perfectKey = await fetchPublicKeyFromIPFS(found.publicKeyCID);
             if (perfectKey && (await isKeyValid(perfectKey))) {
                console.log("✅ [IPFS Anchor] Master identity recovered successfully!");
                pubKeyToTry = perfectKey;
             }
          }

          if (pubKeyToTry && (await isKeyValid(pubKeyToTry))) {
             console.log("✅ [Discovery Storm] Identity recovered successfully!")
             return await performEncryption(pubKeyToTry)
          }
        }
        await new Promise(r => setTimeout(r, 1500)) 
      }
    }
    
    // ⚠️ ALL RECOVERY LAYERS FAILED — Send unencrypted as a last resort.
    // The message will be delivered, but the recipient should re-register to enable encryption.
    // We prefix the message so both sender and recipient know it's unencrypted.
    console.warn(`⚠️ [Encrypt] Key recovery failed for ${recipientEmail}. Sending unencrypted (plaintext fallback).`)
    return `[UNENCRYPTED - Key recovery failed for ${recipientEmail}. This message was delivered without end-to-end encryption.]\n\n${message}`
  }
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
      // 🌍 PRIMARY: Relay Proxy Global IPFS Pinning
      // This is the ONLY upload that makes content accessible cross-device.
      if (await isPinataConfigured()) {
        cid = await uploadToPinata(mailToStore)
        console.log("🌍 [Global] Mail content pinned to public IPFS via relay proxy:", cid)
      } else {
        throw new Error("Relay proxy pinning not configured — falling back")
      }
    } catch (pinataErr) {
      console.warn("⚠️ Pinata unavailable, trying Web3.Storage:", pinataErr)
      try {
        // 🧳 SECONDARY: Web3.Storage (requires prior setup by user)
        cid = await uploadDataToWeb3(mailToStore)
      } catch (w3err) {
        console.warn("⚠️ Web3.Storage not ready, falling back to local Kubo:", w3err)
        // ⚠️ LAST RESORT: Local Kubo — only works on same-device/network
        cid = await uploadToIPFS(mailToStore)
        console.warn("🚨 [Warning] Mail stored on LOCAL IPFS only — cross-device delivery WILL fail unless Pinata is configured.")
      }
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

    await new Promise<void>((resolve) => {
      gun.get("securemail_mails").get(id).put(mailIndex, (ack: any) => {
        if (ack.err) console.error("❌ GunDB global write error:", ack.err)
        resolve()
      })
      
      // Index for sender
      gun.get(`user_mail_index:${mail.senderEmail}`).get(id).put(mailIndex)
      
      // Index for receiver (multi-domain support)
      const receiverEmail = mail.receiverEmail.trim().toLowerCase()
      gun.get(`user_mail_index:${receiverEmail}`).get(id).put(mailIndex)
      
      if (receiverEmail.endsWith("@dmail.com")) {
        const alt = receiverEmail.replace("@dmail.com", "@securemail.com")
        gun.get(`user_mail_index:${alt}`).get(id).put(mailIndex)
      } else if (receiverEmail.endsWith("@securemail.com")) {
        const alt = receiverEmail.replace("@securemail.com", "@dmail.com")
        gun.get(`user_mail_index:${alt}`).get(id).put(mailIndex)
      }

      setTimeout(() => resolve(), 3000)
    })

    const { updateMailInStore } = await import("@/utils/mailStore")
    updateMailInStore(id, { ...mailIndex, senderStatus: "sent" })

    // 📡 [Nostr DM] Parallel relay — zero-cost global delivery backup
    // Fire-and-forget: if Nostr fails, GunDB already delivered
    ;(async () => {
      try {
        const { nostr } = await import("@/utils/nostr")
        // Look up recipient's Nostr pubkey from their identity record
        const recipientIdentity = await nostr.find(mail.receiverEmail, true)
        if (recipientIdentity?.nostrPubkey) {
          await nostr.sendMail(mailIndex, recipientIdentity.nostrPubkey)
        }
      } catch {} // Never block mail sending on Nostr failure
    })()

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
    const sanitizedPub = sanitizeArmoredKey(user.publicKey)
    
    // We split the ~4000 char PGP key into 3 chunks to bypass GunDB's native string truncation limits!
    const pub1 = sanitizedPub.substring(0, 1500)
    const pub2 = sanitizedPub.substring(1500, 3000)
    const pub3 = sanitizedPub.substring(3000)
    
    // 🛡️ [IPFS Anchor] Proactive global anchor
    const publicKeyCID = await uploadPublicKey(user.publicKey)
    
    const did = await generateDID(sanitizedPub)
    const userData = {
      email: cleanEmail,
      name: user.name,
      publicKey: sanitizedPub,
      pub1, pub2, pub3, // 🔒 Native Network Fallback chunks
      publicKeyCID,
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
      publicKey: sanitizedPub,
      pub1, pub2, pub3,
      publicKeyCID,
      did 
    })

    // Alias announcement
    let altEmail = ""
    if (cleanEmail.endsWith("@dmail.com")) altEmail = cleanEmail.replace("@dmail.com", "@securemail.com")
    else if (cleanEmail.endsWith("@securemail.com")) altEmail = cleanEmail.replace("@securemail.com", "@dmail.com")

    const announce = async (targetEmail: string) => {
      // 🛡️ Integrity check before broadcast
      if (!(await isKeyValid(user.publicKey))) {
         console.warn(`🛑 Skipping broadcast for ${targetEmail}: Key is invalid or incomplete.`)
         return
      }
      
      gun.get("securemail_users").get(targetEmail).put(userData)
      gun.get("securemail_pubkeys").get(targetEmail).put({ 
         email: targetEmail, 
         publicKey: sanitizedPub, 
         pub1, pub2, pub3,
         publicKeyCID,
         did 
      })
    }

    announce(cleanEmail)
    if (altEmail) announce(altEmail)
  },

  updateUser: async (email: string, user: any) => {
    const cleanEmail = email.trim().toLowerCase()
    
    // 🛡️ Always re-chunk when updating to ensure remote healing!
    const sanitizedPub = sanitizeArmoredKey(user.publicKey)
    const pub1 = sanitizedPub.substring(0, 1500)
    const pub2 = sanitizedPub.substring(1500, 3000)
    const pub3 = sanitizedPub.substring(3000)
    
    const publicKeyCID = await uploadPublicKey(user.publicKey)
    const did = await generateDID(sanitizedPub)

    const updates = {
      ...user,
      email: cleanEmail,
      pub1, pub2, pub3,
      publicKeyCID,
      did,
      updatedAt: new Date().toISOString()
    }

    gun.get("securemail_users").get(cleanEmail).put(updates)
    gun.get("securemail_pubkeys").get(cleanEmail).put({
      email: cleanEmail,
      publicKey: sanitizedPub,
      pub1, pub2, pub3,
      publicKeyCID,
      did
    })
    console.log(`🛡️ [Identity] Background repair pushed for ${cleanEmail}`)
  },

  getUser: (email: string, cb: (data: any) => void) => {
    const cleanEmail = email.trim().toLowerCase()
    
    // Build both domain variants to try in parallel
    const variants: string[] = [cleanEmail]
    if (!cleanEmail.includes("@")) {
      variants.push(`${cleanEmail}@dmail.com`)
      variants.push(`${cleanEmail}@securemail.com`)
    } else if (cleanEmail.endsWith("@dmail.com")) {
      variants.push(cleanEmail.replace("@dmail.com", "@securemail.com"))
    } else if (cleanEmail.endsWith("@securemail.com")) {
      variants.push(cleanEmail.replace("@securemail.com", "@dmail.com"))
    }

    let calledBack = false

    const isRestricted = typeof window !== "undefined" && (!window.isSecureContext || !!(window.crypto?.subtle as any)?.__isStub)
    const timeoutMs = isRestricted ? 20000 : 10000 // Increased default to 10s for global mesh
    
    // Faster timeout: 10s is enough for P2P mesh discovery
    const safety = setTimeout(() => {
      if (!calledBack) {
        if (connectedPeers.size === 0) {
          console.warn(`🚨 [Network] No peers connected. User lookup for ${cleanEmail} will likely fail.`)
        }
        console.warn(`⏳ [db.getUser] TIMEOUT for ${cleanEmail}. Triggering deep network scan...`)
        
        // 1. Deep Scan: Re-request from all peers explicitly
        variants.forEach(v => {
          gun.get("securemail_users").get(v).once(async (d: any) => { 
            if(d && !calledBack) onFound(d) 
          })
          gun.get("securemail_pubkeys").get(v).once(async (p: any) => { 
            if(p && !calledBack) onPubkeyFound(p, v) 
          })
        })

        // 2. Nostr Mesh Fallback: Global Discovery
        nostr.find(cleanEmail).then(async nostrKey => {
          if (nostrKey && !calledBack) {
            console.log(`📡 [Nostr] Found identity for ${cleanEmail} via global mesh.`)
            calledBack = true
            clearTimeout(safety)
            cb({ email: cleanEmail, publicKey: nostrKey })
          }
        })

        // Final fallback after another 5s
        setTimeout(() => {
          if (!calledBack) {
            calledBack = true
            cb(null)
          }
        }, 5000)
      }
    }, timeoutMs)

    // ── Local Loophole: Fast-track if account is on THIS device ──
    try {
      const localAccs = JSON.parse(localStorage.getItem("all_accounts") || "[]")
      const match = localAccs.find((a: any) => a.email.toLowerCase() === cleanEmail)
      if (match && match.publicKey && match.privateKey) {
        (async () => {
          if (await isKeyValid(match.publicKey)) {
            console.log(`🛡️ [Discovery] Found healthy local key for ${cleanEmail}. Fast-tracking.`)
            calledBack = true
            clearTimeout(safety)
            cb(match)
            
            // Background Auto-Repair: Push the healthy copy to the mesh
            setTimeout(() => db.updateUser(match.email, match), 3000)
          }
        })()
      }
    } catch (e) { /* ignore storage errors */ }

    const onFound = async (data: any) => {
      // Atomic lock to prevent race conditions during 'await' that cause duplicate emails!
      if (calledBack) return
      calledBack = true 
      
      // 🛡️ [IPFS Anchor] Prioritize master copy if CID is available
      // This bypasses GunDB truncation ("stripped key") entirely!
      if (data?.publicKeyCID) {
          console.log(`🛡️ [IPFS Anchor] Fetching master key for ${cleanEmail} via CID:`, data.publicKeyCID)
          const masterKey = await fetchPublicKeyFromIPFS(data.publicKeyCID)
          if (masterKey && (await isKeyValid(masterKey))) {
              data.publicKey = masterKey
              clearTimeout(safety)
              cb(data)
              return
          }
      }

      // ── Fallback: Reassemble from chunks ──
      const reassembledKey = (data.pub1 || "") + (data.pub2 || "") + (data.pub3 || "")
      if (reassembledKey.length > 500 && data.publicKey && data.publicKey.length < reassembledKey.length) {
         data.publicKey = reassembledKey
      }
      
      if (data?.email && data?.publicKey) {
        // 🔒 [Strict Health Check] Relaxed for discovery to allow auto-repair on login
        if (!(await isKeyValid(data.publicKey))) {
          if (!reportedEmails.has(data.email)) {
            console.warn(`🔎 [Discovery] Reassembled key for ${data.email} is degraded (legacy account). Proceeding to allow auto-repair...`)
            reportedEmails.add(data.email)
            nostr.announceRepairRequest(data.email)
          }
        }

        clearTimeout(safety)
        variants.forEach(v => {
          gun.get("securemail_users").get(v).off()
          gun.get("securemail_pubkeys").get(v).off()
        })
        cb(data)
      } else {
        // Release lock if data was incomplete
        calledBack = false 
      }
    }
    
    const onPubkeyFound = async (pkData: any, variant: string) => {
      if (calledBack) return
      calledBack = true
      
      // 🛡️ [IPFS Anchor] Prioritize master copy
      if (pkData?.publicKeyCID) {
          console.log(`🛡️ [IPFS Anchor] Fetching untruncated public key via CID for ${variant}...`)
          const masterKey = await fetchPublicKeyFromIPFS(pkData.publicKeyCID)
          if (masterKey && (await isKeyValid(masterKey))) {
              pkData.publicKey = masterKey
              calledBack = true
              clearTimeout(safety)
              cb({ email: variant, publicKey: masterKey, ...pkData })
              return
          }
          console.warn(`⚠️ [IPFS Anchor] CID lookup failed or returned invalid key. Falling back to mesh data.`)
      }

      const reassembledKey = (pkData.pub1 || "") + (pkData.pub2 || "") + (pkData.pub3 || "")
      if (reassembledKey.length > 500 && pkData.publicKey && pkData.publicKey.length < reassembledKey.length) {
         pkData.publicKey = reassembledKey
      }
      
      if (pkData?.publicKey) {
        if (!(await isKeyValid(pkData.publicKey))) {
          if (!reportedEmails.has(variant)) {
            console.warn(`🔎 [Discovery] Truncated pubkey for ${variant} (legacy account). Repairing...`)
            reportedEmails.add(variant)
            nostr.announceRepairRequest(variant)
          }
          calledBack = false // Release lock
          return
        }

        clearTimeout(safety)
        variants.forEach(v => {
          gun.get("securemail_users").get(v).off()
          gun.get("securemail_pubkeys").get(v).off()
        })
        cb({ email: variant, publicKey: pkData.publicKey, ...pkData })
      } else {
        calledBack = false; // Release lock
      }
    }


    // Start listeners for ALL variants simultaneously
    variants.forEach(variant => {
      gun.get("securemail_users").get(variant).on(async (d) => {
        if (d) onFound(d)
      })
      gun.get("securemail_pubkeys").get(variant).on(async (pkData: any) => {
        if (pkData) onPubkeyFound(pkData, variant)
      })
    })
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
      const attemptSend = async (recipient: any, isRetry = false) => {
        if (!recipient?.publicKey) {
          return reject(new Error(`Recipient ${mail.receiverEmail} not found.`))
        }

        try {
          // ✅ Encrypt with recipient's public key before sending
          const encryptedMessage = await encryptMessage(mail.message, recipient.publicKey)
          const id = await sendMailNow({ ...mail, message: encryptedMessage })
          resolve({ id, queued: false })
        } catch (err: any) {
          // If the key is truncated, we try a "Deep Repair" search before giving up
          if (err.message === "KEY_HEALTH_INCOMPLETE" && !isRetry) {
            console.log("🛡️ [Self-Healing] Detected truncated key. Triggering global mesh discovery...")
            
            // Search other layers (Nostr/Discovery Mesh) for a repaired full key
            nostr.find(mail.receiverEmail).then(async (nostrKey) => {
              if (nostrKey && (await isKeyValid(nostrKey))) {
                console.log("✅ [Self-Healing] Found healthy key on global mesh. Retrying send...")
                attemptSend({ ...recipient, publicKey: nostrKey }, true) // Retry once
              } else {
                reject(new Error("Unable to encrypt: Recipient's public key is corrupted. They must re-sync their identity."))
              }
            }).catch(() => {
              reject(new Error("Unable to encrypt: Recipient identity corrupted and global mesh unreachable."))
            })
          } else {
            reject(err)
          }
        }
      }

      db.getUser(mail.receiverEmail, (recipient) => attemptSend(recipient))
    })
  },

  getMailContent: async (cid: string): Promise<any> => {
    return await fetchFromIPFS(cid)
  },

  // ✅ Self-Healing: Re-announce presence to ensure relay has our latest info
  reannounceUser: async () => {
    if (typeof window === "undefined") return
    
    let userJson = localStorage.getItem("user")
    if (!userJson) return
    let user = JSON.parse(userJson)

    // 🛡️ Best-Effort Repair: Try to fix corrupted key, but NEVER block the broadcast
    if (user.publicKey && !(await isKeyValid(user.publicKey))) {
      console.warn(`📡 [Sync] Degraded key detected for ${user.email}. Running background repair...`)
      const repair = await db.repairIdentity()
      if (repair.success) {
        console.log(`✅ [Sync] Identity repaired via ${repair.source}. Re-broadcasting...`)
        // Re-load fresh repaired data
        userJson = localStorage.getItem("user")
        if (userJson) user = JSON.parse(userJson)
      } else {
        // ⚠️ Repair failed — still proceed with broadcast using whatever key we have.
        // A degraded-but-present key is better than no announcement at all.
        console.warn(`⚠️ [Sync] Repair failed. Proceeding with degraded key for ${user.email}. Will retry on next heartbeat.`)
      }
    }

    if (!user.email || !user.publicKey) return
    const cleanEmail = user.email.trim().toLowerCase()
    const sanitizedPub = sanitizeArmoredKey(user.publicKey)
    
    // 🛡️ [IPFS Anchor] Upload public key to IPFS as an untruncated fallback
    const publicKeyCID = await uploadPublicKey(user.publicKey)

    const info = {
      email: cleanEmail,
      name: user.name,
      publicKey: sanitizedPub,
      publicKeyCID,
      did: user.did || `did:dmail:${sanitizedPub.slice(0, 16).replace(/[^a-zA-Z0-9]/g, "")}`,
      lastActive: new Date().toISOString(),
      globalSync: true
    }

    // 📡 Global Broadcast
    nostr.announce({
      email: cleanEmail,
      publicKey: sanitizedPub,
      publicKeyCID,
      did: info.did,
      timestamp: Date.now()
    }).catch(e => console.warn("[Nostr] Announcement failed:", e))

    console.log(`📡 [Network] Heartbeat: ${cleanEmail} (Peers: ${connectedPeers.size} | Global: ${nostr.getPeerCount()})`)

    const update = async (email: string) => {
      gun.get("securemail_users").get(email).put(info)
      gun.get("securemail_pubkeys").get(email).put({ 
        email: email, 
        publicKey: sanitizedPub,
        publicKeyCID: info.publicKeyCID,
        did: info.did
      })
    }

    update(cleanEmail)
    if (cleanEmail.endsWith("@dmail.com")) update(cleanEmail.replace("@dmail.com", "@securemail.com"))
    else if (cleanEmail.endsWith("@securemail.com")) update(cleanEmail.replace("@securemail.com", "@dmail.com"))
  },

  // ✅ Auto-Repair: Fixes corrupted local identity using all available sources
  repairIdentity: async () => {
    if (typeof window === "undefined") return { success: false, error: "No window context" }
    const userJson = localStorage.getItem("user")
    if (!userJson) return { success: false, error: "No user found" }
    
    const user = JSON.parse(userJson)

    // 1. LOCAL REPAIR: Derive public key from stored private key (most reliable)
    if (user.privateKey) {
      try {
        const repairedPub = await repairPublicKeyFromPrivate(user.privateKey)
        if (repairedPub && (await isKeyValid(repairedPub))) {
          console.log("✅ [Repair] Identity restored via Local Private Key!")
          user.publicKey = repairedPub
          localStorage.setItem("user", JSON.stringify(user))
          return { success: true, source: "local" }
        }
      } catch(e) { /* private key also corrupted, try next source */ }
    }

    // 2. IPFS ANCHOR: Fetch the untruncated master copy if we have a CID
    if (user.publicKeyCID) {
      try {
        const perfectKey = await fetchPublicKeyFromIPFS(user.publicKeyCID)
        if (perfectKey && (await isKeyValid(perfectKey))) {
          console.log("✅ [Repair] Identity restored via IPFS Anchor!")
          user.publicKey = perfectKey
          localStorage.setItem("user", JSON.stringify(user))
          return { success: true, source: "ipfs" }
        }
      } catch(e) { /* IPFS unavailable, try next source */ }
    }

    // 3. MESH DISCOVERY: Look for a healthy copy on Nostr/GunDB peers
    try {
      const meshKey = await nostr.find(user.email)
      if (meshKey && (await isKeyValid(meshKey))) {
        console.log("✅ [Repair] Identity restored via Global Discovery Mesh!")
        user.publicKey = meshKey
        localStorage.setItem("user", JSON.stringify(user))
        return { success: true, source: "mesh" }
      }
    } catch(e) { /* Nostr unreachable */ }
    
    return { success: false, error: "All discovery layers unreachable or corrupted" }
  },

  startIdentityHeartbeat: () => {
    if (typeof window === "undefined") return
    
    // First heartbeat: attempt repair, then announce regardless of outcome
    db.reannounceUser()

    // Heartbeat every 3 minutes — reannounceUser handles repair internally
    setInterval(() => {
      db.reannounceUser()
    }, 3 * 60 * 1000)
  },

  // ✅ Listen for mails specifically belonging to this user (Cross-device sync optimized)
  listenUserMails: (userEmail: string, cb: (mail: any) => void) => {
    // 1. Initial Load of Cache
    getCachedMails(userEmail).then((cached) => {
      cached.forEach((mail) => cb({ ...mail, fromCache: true }))
    })

    const variants = [userEmail]
    if (userEmail.endsWith("@dmail.com")) variants.push(userEmail.replace("@dmail.com", "@securemail.com"))
    else if (userEmail.endsWith("@securemail.com")) variants.push(userEmail.replace("@securemail.com", "@dmail.com"))

    variants.forEach(email => {
      // 2. Optimized Indexed Sync
      gun.get(`user_mail_index:${email}`).map().on(async (mail: any) => {
        if (!mail || !mail.id) return
        await cacheMail(mail)
        cb({ ...mail, fromCache: false })
      })
    })

    // 3. Legacy Stream (Optional fallback for older records not in user_mail_index)
    gun.get("securemail_mails").map().on(async (mail: any) => {
      if (!mail || !mail.id) return
      if (variants.includes(mail.receiverEmail) || variants.includes(mail.senderEmail)) {
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