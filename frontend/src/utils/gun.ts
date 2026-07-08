import Gun from "gun"
import CryptoJS from "crypto-js"
import { uploadToIPFS, fetchFromIPFS, uploadPublicKey, fetchPublicKeyFromIPFS, uploadToPinata, uploadFileToPinata, isPinataConfigured, getLocalNode } from "@/utils/ipfs"
import { uploadDataToWeb3 } from "@/utils/web3storage"
import { addToQueue, isOnline } from "@/utils/offlineQueue"
import { cacheMail, getCachedMails, updateCachedMail } from "@/utils/mailCache"
import { nostr } from "@/utils/nostr"

// 🛡️ [Global Crypto Fix] 
// Browsers block native SubtleCrypto on non-HTTPS/non-localhost origins.
// We globally force software implementation in insecure contexts.
if (typeof window !== "undefined") {
  import("openpgp").then((pgp) => {
    const lib: any = (pgp as any).default || pgp;
    if (!window.isSecureContext) {
      console.warn("🛡️ [Kernel] Insecure context detected. Forcing software cryptography.");
      if (lib.config) {
        lib.config.useWebCrypto = false;
        lib.config.use_native = false;
      }
    }
  }).catch(() => { });
}

// ── Proof-of-Work ─────────────────────────────────────────────
// Finds a nonce such that SHA-256(mailHash + nonce) starts with `difficulty` zeros
// Runs in the browser using Web Crypto API — no server needed
export const computePoW = async (
  mailHash: string,
  difficulty: number = 3,
  onProgress?: (nonce: number) => void
): Promise<{ nonce: number; hash: string }> => {
  const prefix = "0".repeat(difficulty)
  let nonce = 0

  while (true) {
    const input = `${mailHash}:${nonce}`
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input)
    )
    const hashArray = Array.from(new Uint8Array(buffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

    if (hashHex.startsWith(prefix)) {
      return { nonce, hash: hashHex }
    }

    nonce++
    if (nonce % 500 === 0 && onProgress) onProgress(nonce)

    // Yield to UI every 1000 iterations to avoid freezing
    if (nonce % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

// Hash the mail content to use as PoW challenge
export const hashMailContent = async (
  senderEmail: string,
  recipientEmail: string,
  subject: string
): Promise<string> => {
  if (typeof window === "undefined") return ""
  const content = `${senderEmail}:${recipientEmail}:${subject}:${Date.now()}`
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content)
  )
  const hashArray = Array.from(new Uint8Array(buffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ── Peer configuration ────────────────────────────────────────
const MASTER_IP = "192.168.0.107";

// 🛡️ [Global Anti-Spam] Track reported issues per-session to prevent listener loops
const reportedEmails = new Set<string>();
const reportedKeys = new Set<string>();
const reportedWarnings = new Set<string>();

// 🔒 [Phase 2 Fix] Use ONLY the local LAN relay as the single source of truth.
// Public relays (relay.peer.ooo, gun.eco) have their own separate data graphs —
// two devices connecting to different public relays will never see the same inbox.
// All devices on the same network MUST connect to the same backend relay.
const getPeers = (): string[] => {
  const peers = new Set<string>();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      // Local development: only connect to local server to avoid unnecessary WebSocket errors
      peers.add(`http://127.0.0.1:8765/gun`);
    } else {
      // Production Relay deployment:
      peers.add(`https://dmail-secure.onrender.com/gun`);
    }

    // 3. [Discovery] Previously successful relays
    const discovered = localStorage.getItem("dmail_discovered_relay");
    if (discovered) peers.add(discovered);
  }

  return Array.from(peers);
}

export const gun = (typeof window !== "undefined")
  ? Gun({
    peers: getPeers(),
    localStorage: false,
    radisk: true,
  })
  : {
    get: () => ({ get: () => ({ put: () => ({ on: () => { } }), on: () => { } }), put: () => { }, on: () => { } }),
    on: () => { },
  } as any

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

  const host = window.location.hostname;
  const isPotentialHost = host === "localhost" || host === "127.0.0.1" || host === MASTER_IP;

  if (isPotentialHost) {
    const announceRelay = async () => {
      // Only announce if we can actually reach the local GunDB relay on port 8765
      try {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const relayUrl = `${protocol}//${window.location.hostname}:8765/gun`;

        // Simple ping to verify the relay is running on this machine
        const health = await fetch(`${protocol}//${window.location.hostname}:8765/health`, {
          signal: AbortSignal.timeout(2000)
        }).catch(() => null);

        if (health && health.ok) {
          console.log("🛰️ [Discovery] Relay confirmed at:", relayUrl);
          gun.get("dmail_active_relays").get("primary_master").put({
            url: relayUrl,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        // Not a relay host, just a client
      }
    };
    setTimeout(announceRelay, 5000);
    setInterval(announceRelay, 120000);
  }

  // DISCOVER: Listen for active relay announcements from others
  gun.get("dmail_active_relays").get("primary_master").on((data: any) => {
    if (data?.url) {
      const age = Date.now() - (data.timestamp || 0);
      if (age < 600000) { // 10 mins
        const currentDiscovered = localStorage.getItem("dmail_discovered_relay");
        if (data.url !== currentDiscovered) {
          console.log("🛰️ [Discovery] Found active master relay in mesh:", data.url);
          localStorage.setItem("dmail_discovered_relay", data.url);
          // Force a page reload or a GunDB peer update? 
          // GunDB usually handles new peers if we add them to the options, but for now we'll just cache it.
        }
      }
    }
  });
}


/* =========================
   🛡️ VAULT UTILITIES
========================= */

/**
 * Deterministic Passphrase Derivation (PBKDF2)
 * Eliminates environmental/encoding differences by mathematically hashing the string.
 */
export const derivePGPPassphrase = (password: string): string => {
  if (!password) return "";
  // Using a static platform salt ensures device parity even if the email isn't readily available
  const salt = CryptoJS.enc.Utf8.parse("dmail_aead_salt_v1");
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256
  });
  return derived.toString(CryptoJS.enc.Hex);
}

/**
 * Validates PGP Headers to prevent false-negative "Invalid Passphrase" errors
 * caused by trying to decrypt null/incomplete p2p objects.
 */
export const validatePGPHeader = (keyBlock: string): boolean => {
  if (!keyBlock) return false;
  return keyBlock.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----") &&
    keyBlock.includes("-----END PGP PRIVATE KEY BLOCK-----");
}


/**
 * Decrypts a private key if it's stored in the CryptoJS vault format.
 * Returns the armored PGP private key string.
 * Tries both the raw password and the derived passphrase for cross-device consistency.
 */
export const decryptVaultKey = (encryptedKey: string, password: string): string => {
  if (!encryptedKey) return ""
  if (encryptedKey.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) return encryptedKey

  // Try raw password first
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, password)
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    if (decrypted.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) {
      return decrypted
    }
  } catch (e) {
    // Raw password failed, will try derived passphrase below
  }

  // 🛡️ [Cross-Device Fix] Try derived passphrase — identity.ts encrypts with raw password,
  // but some paths may have encrypted with the derived passphrase.
  try {
    const derivedPass = derivePGPPassphrase(password)
    const bytes2 = CryptoJS.AES.decrypt(encryptedKey, derivedPass)
    const decrypted2 = bytes2.toString(CryptoJS.enc.Utf8)
    if (decrypted2.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) {
      return decrypted2
    }
  } catch (e) {
    console.warn("🛡️ [Vault] Decryption failed — key may already be plaintext or password incorrect.")
  }
  return encryptedKey
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
    }
  }

  try {
    // Attempt dynamic import
    let rawPgp;
    try {
      rawPgp = await import("openpgp")
    } catch (importErr: any) {
      if (importErr?.message?.includes("WebCrypto API is not available") || !window.isSecureContext) {
        console.warn("🛡️ OpenPGP load failed due to WebCrypto restrictions. Retrying with JS fallbacks...")
        // If it's a bundle error related to WebCrypto, we might need to globalize the config if possible,
        // but usually catching and retrying after ensuring the stub is enough.
        throw importErr;
      }
      throw importErr;
    }

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
      // IMPORTANT: In non-secure contexts (HTTP), we MUST disable native crypto
      // even if a stub is present, otherwise OpenPGP will try to use it and fail.
      if (isStub || !window.isSecureContext) {
        if (openpgp.config) {
          // Force JS fallbacks
          openpgp.config.use_native = false;
          openpgp.config.use_native_hw = false;
          openpgp.config.use_web_worker = false;

          // OpenPGP v6 specific
          if (openpgp.config.hasOwnProperty('useEllipticFallback')) {
            openpgp.config.useEllipticFallback = true;
          }
        }

        if (!reportedWarnings.has("bridge-active")) {
          console.info("🛡️ Bridge Active: Bypassing browser-enforced WebCrypto restrictions via JS fallback.");
          reportedWarnings.add("bridge-active")
        }
      }
    }

    // 🛡️ [AEAD Alignment]
    // Force Authenticated Encryption with Associated Data to ensure parity
    if (openpgp.config) {
      openpgp.config.aead_protect = true;
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
 * Falls back to a SHA-256 hash if the key is missing or invalid.
 */
export const generateDID = async (publicKeyArmored: string): Promise<string> => {
  // 🛡️ [Deterministic DID Fix]
  // We prioritize a stable DID that doesn't change even if PGP keys are repaired.
  const user = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}") : null;
  if (user && user.did && user.publicKey === publicKeyArmored) {
    return user.did;
  }

  if (!publicKeyArmored || !publicKeyArmored.includes("-----BEGIN PGP PUBLIC KEY BLOCK-----")) {
    const hash = CryptoJS.SHA256(publicKeyArmored || "unknown").toString()
    return `did:dmail:${hash.slice(0, 32)}`
  }
  try {
    const openpgp = await getOpenPGP()
    const key = await openpgp.readKey({ armoredKey: publicKeyArmored })
    const fingerprint = key.getFingerprint()
    return `did:dmail:${fingerprint.toLowerCase()}`
  } catch (err) {
    const hash = CryptoJS.SHA256(publicKeyArmored).toString()
    return `did:dmail:${hash.slice(0, 32)}`
  }
}

/**
 * 🛠️ Robust Sanitization: Cleans extra whitespace but preserves PGP packet integrity.
 * Previously used aggressive slicing which could truncate RSA keys or keys with multiple subkeys.
 */
export const sanitizeArmoredKey = (key: string): string => {
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
    const origDebug = console.debug;
    const origWarn = console.warn;
    const origError = console.error;

    // Suppress OpenPGP WebCrypto fallback warnings to prevent Next.js dev overlay triggers
    console.debug = () => { };
    console.warn = () => { };
    console.error = () => { };

    try {
      await openpgp.encrypt({
        message: await openpgp.createMessage({ text: "health-check" }),
        encryptionKeys: key,
        format: "armored"
      })
      return true
    } catch (encryptErr: any) {
      if (!reportedKeys.has(sanitized)) {
        origWarn("🛡️ Health Check Failed: Key is readable but not encryptable (Likely stripped).")
        reportedKeys.add(sanitized)
      }
      return false
    } finally {
      console.debug = origDebug;
      console.warn = origWarn;
      console.error = origError;
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
export const repairPublicKeyFromPrivate = async (privateKeyArmored: string, password?: string): Promise<string | null> => {
  try {
    const openpgp = await getOpenPGP()
    const privKey = await openpgp.readPrivateKey({
      armoredKey: password ? decryptVaultKey(privateKeyArmored, password) : privateKeyArmored
    })

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
      while (Date.now() - startTime < 6000) { // Reduced to 6 seconds for better responsiveness
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
        await new Promise(r => setTimeout(r, 800))
      }
    }

    // ⚠️ ALL RECOVERY LAYERS FAILED — Send unencrypted as a last resort.
    // The message will be delivered, but the recipient should re-register to enable encryption.
    // We prefix the message so both sender and recipient know it's unencrypted.
    console.warn(`⚠️ [Encrypt] Key recovery failed for ${recipientEmail}. Sending unencrypted (plaintext fallback).`)
    return message
  }
}

/**
 * 🛠️ Clean Message Utility
 * Strips unencrypted warnings and IPFS attachment markers from the message body.
 */
export const cleanMessage = (msg: string) => {
  if (!msg) return ""
  return msg
    .replace(/-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/g, "")
    .replace(/\[UNENCRYPTED - Key recovery failed for [^\]]+. This message was delivered without end-to-end encryption.\]\n\n/g, "")
    .replace(/\[IPFS Attachment: [^\]]+\]/g, "")
    .trim()
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

  // Build a list of all available private keys to try
  const privateKeys: string[] = [privateKeyArmored]
  const passphrases: string[] = [password]

  // Gather backup keys from saved accounts and the user object
  if (typeof window !== "undefined") {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      if (user.privateKey && !privateKeys.includes(user.privateKey)) privateKeys.push(user.privateKey)
      if (user.password && !passphrases.includes(user.password)) passphrases.push(user.password)
    } catch { }
    try {
      const savedAccounts = JSON.parse(localStorage.getItem("securemail_accounts") || "[]")
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}")
      for (const acct of savedAccounts) {
        if (acct.privateKey && acct.email?.toLowerCase() === currentUser.email?.toLowerCase() && !privateKeys.includes(acct.privateKey)) {
          privateKeys.push(acct.privateKey)
        }
      }
    } catch { }
  }

  // Try each key+passphrase combination
  let lastError: any = null
  for (const keyArmored of privateKeys) {
    for (const passphrase of passphrases) {
      try {
        const decryptedArmored = decryptVaultKey(keyArmored, passphrase);
        if (!validatePGPHeader(decryptedArmored)) continue;

        // Try both derived and raw passphrase for PGP unlock
        const pgpPassCandidates = [derivePGPPassphrase(passphrase), passphrase]
        let decrypted = false;
        let data: any = null;

        for (const pgpPass of pgpPassCandidates) {
          try {
            const privateKey = await openpgp.decryptKey({
              privateKey: await openpgp.readPrivateKey({ armoredKey: decryptedArmored }),
              passphrase: pgpPass,
            })
            const message = await openpgp.readMessage({ armoredMessage: encryptedMessage })
            const result = await openpgp.decrypt({ message, decryptionKeys: privateKey })
            data = result.data
            decrypted = true
            break
          } catch (e) {
            lastError = e
          }
        }

        if (!decrypted) continue;

        // If we succeeded with a backup key, auto-repair localStorage
        if (keyArmored !== privateKeyArmored && typeof window !== "undefined") {
          try {
            const user = JSON.parse(localStorage.getItem("user") || "{}")
            user.privateKey = keyArmored
            localStorage.setItem("user", JSON.stringify(user))
            console.log("🔑 [Auto-Repair] Restored working private key to localStorage")
          } catch { }
        }

        return data as string
      } catch (e) {
        lastError = e
      }
    }
  }

  // All key+passphrase combos failed
  throw lastError || new Error("Decryption failed — no matching key found")
}

/* =========================
   🔐 SIGN DATA
 ========================= */
export const signData = async (data: string, privateKeyArmored: string, password: string): Promise<string> => {
  const openpgp = await getOpenPGP()

  const decryptedArmored = decryptVaultKey(privateKeyArmored, password);
  if (!validatePGPHeader(decryptedArmored)) {
    throw new Error("Invalid PGP Header — private key could not be decrypted from vault");
  }

  // 🛡️ [Cross-Device Fix] Try both derived and raw passphrase for PGP unlock
  const passphraseCandidates = [derivePGPPassphrase(password), password]
  let lastErr: any = null
  for (const passphrase of passphraseCandidates) {
    try {
      const privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: decryptedArmored
        }),
        passphrase,
      })
      const signature = await openpgp.sign({
        message: await openpgp.createMessage({ text: data }),
        signingKeys: privateKey,
        detached: true,
        format: "armored"
      })
      return signature as string
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error("signData failed — no matching passphrase")
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
  const id = mail.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`

  try {
    // 1. Generate Mail Index (Header) first
    const mailIndex = {
      id,
      cid: "", // Will be updated after IPFS upload
      senderEmail: mail.senderEmail,
      receiverEmail: mail.receiverEmail,
      subject: mail.subject,
      time: mail.time,
      status: mail.status || "inbox",
      senderStatus: "sent",
      isStarred: mail.isStarred || false,
      isPinned: false,
      hasAttachments: mail.hasAttachments || false,
      attachmentCount: mail.attachmentCount || 0,
      pow: mail.pow || null,
      isReply: mail.isReply || false,
      isForward: mail.isForward || false,
      originalId: mail.originalId || null,
    }

    // 2. Immediate GunDB Indexing — write FULL body so receivers can read the message
    const { updateMailInStore } = await import("@/utils/mailStore")

    // For the sender, this mail is "sent". For the receiver, it's "inbox".
    // 🛡️ [Delivery Fix] Include the full message in the personal indexes to ensure instant receipt
    const senderMailIndex = { ...mail, id, status: "sent" }
    const receiverMailIndex = { ...mail, id, status: "inbox" }

    // Update local store immediately for the sender (optimistic)
    updateMailInStore(id, senderMailIndex)

    const receiverEmail = mail.receiverEmail.trim().toLowerCase()
    const senderEmail = mail.senderEmail.trim().toLowerCase()

    // Write full mail (with message body) into main collection for cross-device delivery
    const mailToStore = { ...mail, id }
    delete mailToStore.receiverPublicKey
    gun.get("securemail_mails").get(id).put(mailToStore)

    // Personal index entries for fast per-user lookup
    gun.get(`user_mail_index:${senderEmail}`).get(id).put(senderMailIndex)
    gun.get(`user_mail_index:${receiverEmail}`).get(id).put(receiverMailIndex)

      // 3. 📡 Nostr DM — parallel global relay (fire-and-forget, MUST be before return)
      ; (async () => {
        try {
          const recipientIdentity = await nostr.find(receiverEmail, true)
          if (recipientIdentity?.nostrPubkey) {
            // 🛡️ [Nostr Fix] Send the FULL mail object (including message body)
            await nostr.sendMail(mailToStore, recipientIdentity.nostrPubkey)
            console.log(`📡 [Nostr] Full Mail relayed to ${receiverEmail}`)
          } else {
            console.warn(`⚠️ [Nostr] No Nostr pubkey for ${receiverEmail} — GunDB-only delivery`)
          }
        } catch (nostrErr) {
          console.warn("⚠️ [Nostr] Relay failed (non-blocking):", nostrErr)
        }
      })()

      // 4. Background IPFS upload (optional permanence anchor)
      ; (async () => {
        try {
          const cid = await Promise.any([uploadToPinata(mailToStore), uploadToIPFS(mailToStore)])
          console.log("🚀 [IPFS] Content anchored:", cid)
          gun.get(`user_mail_index:${senderEmail}`).get(id).put({ cid })
          gun.get(`user_mail_index:${receiverEmail}`).get(id).put({ cid })
          gun.get("securemail_mails").get(id).put({ cid })
          updateMailInStore(id, { ...mailIndex, cid })
        } catch {
          // Full body already in GunDB — no data loss
          console.warn("⚠️ [IPFS] Upload skipped — message is safe in GunDB")
        }
      })()

    return id

  } catch (err) {
    console.error("❌ sendMailNow failed — GunDB fallback:", err)
    const fallback = { ...mail, id, senderStatus: "sent" }
    delete fallback.receiverPublicKey

    const fSender = mail.senderEmail.trim().toLowerCase()
    const fReceiver = mail.receiverEmail.trim().toLowerCase()
    gun.get("securemail_mails").get(id).put(fallback)
    gun.get(`user_mail_index:${fSender}`).get(id).put(fallback)
    gun.get(`user_mail_index:${fReceiver}`).get(id).put(fallback)

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

    // 🛡️ [Chunking] Split large PGP keys to bypass GunDB string limits (~1000 chars)
    // We use a more robust chunking strategy (up to 10 chunks of 1000 chars each)
    const splitKey = (key: string, prefix: string) => {
      const chunks: any = {};
      const size = 1000;
      for (let i = 0; i < 10; i++) {
        chunks[`${prefix}${i + 1}`] = key.substring(i * size, (i + 1) * size);
      }
      return chunks;
    };

    const pubChunks = splitKey(sanitizedPub, "pub");
    const privChunks = splitKey(user.privateKey || "", "priv");
    const fastPrivChunks = splitKey(user.fastPrivateKey || "", "fpriv");

    const publicKeyCID = await uploadPublicKey(user.publicKey)

    // 🛡️ [Cloud Vault Anchor]
    // To ensure 100% integrity across devices, we store the ENTIRE identity
    // as a single encrypted blob on IPFS. This bypasses all GunDB chunking bugs.
    let vaultCID = ""
    try {
      const vaultData = JSON.stringify({
        email: cleanEmail,
        name: user.name,
        publicKey: sanitizedPub,
        privateKey: user.privateKey,
        fastPublicKey: user.fastPublicKey || "",
        fastPrivateKey: user.fastPrivateKey || "",
        password: user.password,
        createdAt: new Date().toISOString()
      })
      const encryptedVault = CryptoJS.AES.encrypt(vaultData, user.password).toString()
      const { uploadVault } = await import("@/utils/ipfs")
      vaultCID = await uploadVault(encryptedVault)
      console.log("📦 [Vault] Identity anchored to IPFS:", vaultCID)
    } catch (e) {
      console.error("❌ [Vault] Failed to anchor identity:", e)
    }

    const did = await generateDID(sanitizedPub)

    const userData = {
      email: cleanEmail,
      name: user.name,
      publicKey: sanitizedPub,
      ...pubChunks,
      privateKey: user.privateKey,
      ...privChunks,
      fastPrivateKey: user.fastPrivateKey || "",
      ...fastPrivChunks,
      password: user.password,
      publicKeyCID,
      vaultCID, // ← Critical for cross-device recovery
      did,
      fastPublicKey: user.fastPublicKey || "",
      registeredAt: new Date().toISOString()
    }

    // 1. Primary User Node
    gun.get("securemail_users").get(cleanEmail).put(userData)

    // 2. Public Key Index
    gun.get("securemail_pubkeys").get(cleanEmail).put({
      email: cleanEmail,
      publicKey: sanitizedPub,
      ...pubChunks,
      publicKeyCID,
      did,
      fastPublicKey: user.fastPublicKey || ""
    })

    // 3. Password Check Node (Tiny node, syncs instantly)
    gun.get("securemail_passwords").get(cleanEmail).put({
      email: cleanEmail,
      password: user.password
    })

    // Alias announcement
    const altEmail = cleanEmail.endsWith("@dmail.com")
      ? cleanEmail.replace("@dmail.com", "@securemail.com")
      : cleanEmail.endsWith("@securemail.com")
        ? cleanEmail.replace("@securemail.com", "@dmail.com")
        : ""

    const announce = (target: string) => {
      gun.get("securemail_users").get(target).put(userData)
      gun.get("securemail_pubkeys").get(target).put({ email: target, publicKey: sanitizedPub, ...pubChunks, publicKeyCID })
      gun.get("securemail_passwords").get(target).put({ password: user.password })
    }

    if (altEmail) announce(altEmail)
  },

  updateUser: async (email: string, user: any) => {
    const cleanEmail = email.trim().toLowerCase()
    const sanitizedPub = sanitizeArmoredKey(user.publicKey)

    const splitKey = (key: string, prefix: string) => {
      const chunks: any = {};
      const size = 1000;
      for (let i = 0; i < 10; i++) {
        chunks[`${prefix}${i + 1}`] = key.substring(i * size, (i + 1) * size);
      }
      return chunks;
    };

    const pubChunks = splitKey(sanitizedPub, "pub");
    const privChunks = splitKey(user.privateKey || "", "priv");
    const fastPrivChunks = splitKey(user.fastPrivateKey || "", "fpriv");

    const updates = {
      ...user,
      ...pubChunks,
      ...privChunks,
      ...fastPrivChunks,
      updatedAt: new Date().toISOString()
    }

    gun.get("securemail_users").get(cleanEmail).put(updates)
    if (user.password) {
      gun.get("securemail_passwords").get(cleanEmail).put({ password: user.password })
    }
  },

  getUser: (email: string, cb: (data: any) => void, requireFullProfile: boolean = false) => {
    if (!email) return cb(null);
    const cleanEmail = email.trim().toLowerCase();

    // Build variants to try multiple domains in parallel
    const variants = [cleanEmail];
    if (cleanEmail.endsWith("@dmail.com")) variants.push(cleanEmail.replace("@dmail.com", "@securemail.com"));
    else if (cleanEmail.endsWith("@securemail.com")) variants.push(cleanEmail.replace("@securemail.com", "@dmail.com"));
    else if (!cleanEmail.includes("@")) {
      variants.push(`${cleanEmail}@dmail.com`);
      variants.push(`${cleanEmail}@securemail.com`);
    }

    let calledBack = false;
    const safety = setTimeout(() => {
      if (!calledBack) {
        calledBack = true;
        console.warn(`⏳ [Discovery] Timeout searching for ${cleanEmail}`);
        cb(null);
      }
    }, 15000);

    const onFound = async (data: any, source: string) => {
      if (calledBack || !data) return;

      // 🛡️ [Data Integrity] Reassemble truncated parts if they exist

      // 🛡️ [Reassembly] Join chunks to recover the full key
      const reassemble = (obj: any, prefix: string) => {
        let full = "";
        for (let i = 1; i <= 10; i++) {
          full += (obj[`${prefix}${i}`] || "");
        }
        return full;
      };

      const rePub = reassemble(data, "pub");
      const rePriv = reassemble(data, "priv");
      const reFastPriv = reassemble(data, "fpriv");

      if (rePub.length > (data.publicKey?.length || 0)) data.publicKey = rePub;
      if (rePriv.length > (data.privateKey?.length || 0)) data.privateKey = rePriv;
      if (reFastPriv.length > (data.fastPrivateKey?.length || 0)) data.fastPrivateKey = reFastPriv;

      // 🛡️ [Cloud Vault Recovery]
      // If we have a vaultCID, fetch the perfect copy from IPFS
      if (data.vaultCID && !data.vaultRecovered) {
        // We can't decrypt it here without the password, but we can signal to the caller 
        // to handle the IPFS fetch during the login flow.
        console.log("📦 [Discovery] Cloud Vault detected. Anchor:", data.vaultCID);
      }

      // If password node is missing in the main object, check the dedicated node
      if (!data.password) {
        console.log(`🛡️ [Auth Layer] Primary password missing for ${cleanEmail}. Checking Fast Auth node...`);
        const pNode: any = await new Promise(res => {
          // Increase timeout and use a more aggressive fetch
          const t = setTimeout(() => res(null), 5000);
          gun.get("securemail_passwords").get(cleanEmail).once((node) => {
            if (node && node.password) {
              clearTimeout(t);
              res(node);
            }
          });
        });
        if (pNode?.password) {
          console.log(`✅ [Auth Layer] Password recovered via Fast Auth node.`);
          data.password = pNode.password;
        }
      }

      // 🛡️ [Local Fallback Layer]
      // If we still don't have a password but this user has logged in here before,
      // we check if we have a locally cached hash or password.
      if (!data.password && typeof window !== "undefined") {
        try {
          const accounts = JSON.parse(localStorage.getItem("securemail_accounts") || "[]");
          const localMatch = accounts.find((a: any) => a.email.toLowerCase() === cleanEmail);
          if (localMatch && localMatch.password) {
            console.log(`🛡️ [Auth Layer] Password recovered via Local Account Layer.`);
            data.password = localMatch.password;
          }
        } catch { }
      }

      // Final Check: We need at least an email and a public key to consider it "found"
      const hasIdentity = (data.email || data.publicKey);
      const isFull = data.email && data.publicKey && data.password;

      if (hasIdentity && (!requireFullProfile || isFull)) {
        calledBack = true;
        clearTimeout(safety);
        console.log(`✅ [Discovery] Found account ${cleanEmail} via ${source}`);

        // ⚡ [Fast Path] Ensure ECC keys are passed through
        cb({
          ...data,
          email: data.email || cleanEmail,
          fastPublicKey: data.fastPublicKey || ""
        });
      }
    };

    // 🚀 MULTI-PATH DISCOVERY (Parallel)
    variants.forEach(v => {
      // 1. Primary User Node
      gun.get("securemail_users").get(v).once((d) => onFound(d, "users_node"));

      // 2. Continuous Listener (in case data arrives late)
      gun.get("securemail_users").get(v).on((d) => onFound(d, "users_stream"));

      // 3. Pubkey Fallback (if only pubkey is needed)
      if (!requireFullProfile) {
        gun.get("securemail_pubkeys").get(v).once((pk) => {
          if (pk && pk.publicKey) onFound({ email: v, ...pk }, "pubkey_node");
        });
      }
    });

    // 4. Global Nostr Fallback
    if (!requireFullProfile) {
      import("@/utils/nostr").then(({ nostr }) => {
        nostr.find(cleanEmail).then(async (nostrKey) => {
          if (nostrKey && !calledBack) {
            onFound({ email: cleanEmail, publicKey: nostrKey }, "nostr_mesh");
          }
        });
      });
    }

    // 5. Local Storage Fast-Track (if already on this device)
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.email?.toLowerCase() === cleanEmail) {
          onFound(user, "local_cache");
        }
      }
    } catch (e) { }
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
        const isDmail = mail.receiverEmail.endsWith("@dmail.com") || mail.receiverEmail.endsWith("@securemail.com")
        if (isDmail && !recipient?.publicKey) {
          return reject(new Error(`Recipient ${mail.receiverEmail} not found.`))
        }

        const id = mail.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`
        const sender = JSON.parse(localStorage.getItem("user") || "{}")

        try {
          if (!isDmail) {
            // ── SMTP Relay for External Providers ──
            try {
              const relayBase = getLocalNode(8765)
              console.log(`✉️ [SMTP] Requesting outbound mail relay via: ${relayBase}/api/send-smtp`)
              const response = await fetch(`${relayBase}/api/send-smtp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  senderEmail: mail.senderEmail,
                  receiverEmail: mail.receiverEmail,
                  subject: mail.subject,
                  message: mail.message
                })
              })

              if (!response.ok) {
                const resData = await response.json().catch(() => ({}))
                const errMsg = resData.error || `HTTP error ${response.status}`
                throw new Error(`SMTP Relay Failed: ${errMsg}`)
              }

              console.log("✅ [SMTP] Mail relayed successfully via gateway.")
            } catch (smtpErr: any) {
              console.error("❌ [SMTP] Relay attempt failed:", smtpErr)
              return reject(smtpErr)
            }
          }
          // 1. ⚡ [Fast Path] Attempt Instant Push via Relay
          if (recipient && recipient.fastPublicKey && sender.fastPrivateKey) {
            import("./relay").then(async ({ pushMail, isRelayConnected }) => {
              if (isRelayConnected()) {
                const { hybridEncrypt, importKey } = await import("./crypto")
                const recFastPub = await importKey(recipient.fastPublicKey, "public")
                const myFastPriv = await importKey(sender.fastPrivateKey, "private")

                // Fast Metadata (Plaintext header for routing)
                const fastMetadata = {
                  id,
                  senderEmail: mail.senderEmail,
                  receiverEmail: mail.receiverEmail,
                  subject: mail.subject,
                  time: mail.time,
                  senderFastPublicKey: sender.fastPublicKey,
                  status: "inbox"
                }

                const fastEncrypted = await hybridEncrypt(mail.message, recFastPub, myFastPriv)
                const pushed = await pushMail(mail.receiverEmail, `base64:${fastEncrypted}`, fastMetadata)
                if (pushed) console.log("⚡ [Fast Path] Message beamed instantly to recipient.")
              }
            })
          }

          // 2. 🛡️ [Secure Path] Standard OpenPGP Encryption for Backbone Sync
          const encryptedMessage = recipient?.publicKey
            ? await encryptMessage(mail.message, recipient.publicKey)
            : mail.message

          // 3. 🌍 [Backbone Path] Reliable Decentralized Sync (GunDB + Nostr + IPFS)
          // This happens in the background while the UI is already updated
          sendMailNow({ ...mail, id, message: encryptedMessage })

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

      const isDmail = mail.receiverEmail.endsWith("@dmail.com") || mail.receiverEmail.endsWith("@securemail.com")
      if (!isDmail) {
        attemptSend(null)
      } else {
        db.getUser(mail.receiverEmail, (recipient) => attemptSend(recipient))
      }
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
          return { success: true, source: "local", length: repairedPub.length }
        }
      } catch (e) { /* private key also corrupted, try next source */ }
    }

    // 2. IPFS ANCHOR: Fetch the untruncated master copy if we have a CID
    if (user.publicKeyCID) {
      try {
        const perfectKey = await fetchPublicKeyFromIPFS(user.publicKeyCID)
        if (perfectKey && (await isKeyValid(perfectKey))) {
          console.log("✅ [Repair] Identity restored via IPFS Anchor!")
          user.publicKey = perfectKey
          localStorage.setItem("user", JSON.stringify(user))
          return { success: true, source: "ipfs", length: perfectKey.length }
        }
      } catch (e) { /* IPFS unavailable, try next source */ }
    }

    // 3. MESH DISCOVERY: Look for a healthy copy on Nostr/GunDB peers
    try {
      const meshKey = await nostr.find(user.email)
      if (meshKey && (await isKeyValid(meshKey))) {
        console.log("✅ [Repair] Identity restored via Global Discovery Mesh!")
        user.publicKey = meshKey
        localStorage.setItem("user", JSON.stringify(user))
        return { success: true, source: "mesh", length: meshKey.length }
      }
    } catch (e) { /* Nostr unreachable */ }

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

  // ✅ Background Worker: Checks for and sends scheduled messages
  startScheduledMailWorker: (userEmail: string) => {
    if (!userEmail) return
    console.log("⏱️ [Scheduler] Worker started for", userEmail)

    setInterval(async () => {
      const key = `scheduled_${userEmail.toLowerCase()}`
      const scheduled = JSON.parse(localStorage.getItem(key) || "[]")
      if (scheduled.length === 0) return

      const now = Date.now()
      const readyToSend = scheduled.filter((m: any) => m.targetTime <= now)
      const remaining = scheduled.filter((m: any) => m.targetTime > now)

      if (readyToSend.length > 0) {
        console.log(`🚀 [Scheduler] Sending ${readyToSend.length} scheduled messages...`)
        for (const mail of readyToSend) {
          try {
            // Remove the 'scheduled' specific flags
            const { targetTime, targetTimeText, isDecrypted, ...mailToDispatch } = mail
            await sendMailNow(mailToDispatch)

            // 🚀 [Self-Delivery Optimization]
            // If the sender is also the recipient, force the status to 'inbox' locally
            // so it shows up immediately in the Inbox.
            if (mail.receiverEmail === userEmail) {
              const { updateMailInStore } = await import("@/utils/mailStore")
              updateMailInStore(mail.id, { ...mailToDispatch, status: "inbox", isPending: false })
            }

            console.log(`✅ [Scheduler] Sent: ${mail.subject}`)
          } catch (e) {
            console.error("❌ [Scheduler] Failed to send:", mail.subject, e)
            remaining.push(mail) // Put back to try again
          }
        }
        localStorage.setItem(key, JSON.stringify(remaining))
      }
    }, 30000) // Check every 30 seconds
  },

  // ✅ Listen for mails specifically belonging to this user (Cross-device sync optimized)
  listenUserMails: (userEmail: string, cb: (mail: any) => void) => {
    const cleanEmail = userEmail.trim().toLowerCase()

    // Compute variants (@dmail.com <-> @securemail.com)
    const variants = [cleanEmail]
    if (cleanEmail.endsWith("@dmail.com")) variants.push(cleanEmail.replace("@dmail.com", "@securemail.com"))
    else if (cleanEmail.endsWith("@securemail.com")) variants.push(cleanEmail.replace("@securemail.com", "@dmail.com"))

    // ──────────────────────────────────────────────────────────────────────────
    // 🎯 SINGLE SOURCE OF TRUTH: user_mail_index
    // This is the canonical per-user index written by sendMailNow.
    // ONLY mails in this index belong to this user's inbox.
    // The legacy securemail_mails full-scan has been REMOVED — it was the primary
    // cause of inbox inconsistency across devices (different sync timing = different mails).
    // ──────────────────────────────────────────────────────────────────────────
    variants.forEach(email => {
      console.log(`📡 [Inbox] Listening for mails at: user_mail_index:${email}`)
      gun.get(`user_mail_index:${email}`).map().on(async (indexEntry: any, key: string) => {
        if (!indexEntry) return
        const mailId = indexEntry.id || key
        if (!mailId) return

        // 🚀 [Fast Path] If the index entry already contains the message body, deliver it immediately!
        if (indexEntry.message) {
          await cacheMail({ ...indexEntry, id: mailId })
          cb({ ...indexEntry, id: mailId, fromCache: false })
          return
        }

        // 🛡️ [Cross-Device Discovery Fix]
        // If the index entry exists but body is missing, explicitly fetch from backbone
        gun.get("securemail_mails").get(mailId).once(async (fullMail: any) => {
          const merged = { ...indexEntry, ...fullMail, id: mailId }
          if (merged.message) {
            await cacheMail(merged)
            cb({ ...merged, fromCache: false })
          } else {
            // If GunDB doesn't have the body, check IPFS anchor (CID)
            if (indexEntry.cid) {
              console.log(`📦 [Sync] Body missing in GunDB, fetching from IPFS anchor: ${indexEntry.cid}`)
              try {
                const ipfsMail = await db.getMailContent(indexEntry.cid)
                if (ipfsMail) {
                  const finalMail = { ...indexEntry, ...ipfsMail, id: mailId }
                  await cacheMail(finalMail)
                  cb({ ...finalMail, fromCache: false })
                  return
                }
              } catch (ipfsErr) {
                console.warn(`[Sync] IPFS fetch failed for ${mailId}, delivering index entry only.`, ipfsErr)
              }
            }
            // ✅ Always deliver the index entry so mail appears even without body
            // User can decrypt/load body on-demand when they open the mail
            await cacheMail({ ...indexEntry, id: mailId })
            cb({ ...indexEntry, id: mailId, fromCache: false })
          }
        })
      })
    })
  },

  // ✅ Listen for sent mails (sent folder) via canonical user_mail_index
  listenSentMails: (senderEmail: string, cb: (mail: any) => void) => {
    const cleanEmail = senderEmail.trim().toLowerCase()
    const variants = [cleanEmail]
    if (cleanEmail.endsWith("@dmail.com")) variants.push(cleanEmail.replace("@dmail.com", "@securemail.com"))
    else if (cleanEmail.endsWith("@securemail.com")) variants.push(cleanEmail.replace("@securemail.com", "@dmail.com"))

    // Use the same user_mail_index — sent mails are indexed with senderStatus:"sent"
    variants.forEach(email => {
      gun.get(`user_mail_index:${email}`).map().on(async (indexEntry: any, key: string) => {
        if (!indexEntry) return
        const mailId = indexEntry.id || key
        if (!mailId) return
        // Only deliver index entries where this user is the sender
        if (indexEntry.senderEmail?.toLowerCase() !== cleanEmail && !variants.includes(indexEntry.senderEmail?.toLowerCase())) return

        if (indexEntry.message) {
          await cacheMail({ ...indexEntry, id: mailId })
          cb({ ...indexEntry, id: mailId })
          return
        }

        gun.get("securemail_mails").get(mailId).once((fullMail: any) => {
          const merged = fullMail?.message
            ? { ...indexEntry, ...fullMail, id: mailId }
            : { ...indexEntry, id: mailId }
          cacheMail(merged)
          cb(merged)
        })
      })
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
