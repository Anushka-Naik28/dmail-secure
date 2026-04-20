// ─────────────────────────────────────────────────────────────────────────
// 🌍 GLOBAL IPFS PINNING — Backend Proxy Architecture
//
// The Pinata JWT lives ONLY on the relay server (backend/server.js).
// Users never create accounts or configure anything.
// The frontend calls /pin on the relay server → server pins to Pinata.
//
// Setup (ONE TIME, by the developer/operator):
//   1. Get a free Pinata JWT at https://pinata.cloud
//   2. Add PINATA_JWT=your_jwt to backend/.env
//   3. All users of the app get global mail delivery automatically.
// ─────────────────────────────────────────────────────────────────────────

/** 
 * Uploads JSON data via the relay server's /pin proxy.
 * The relay server holds the Pinata JWT — users never configure anything.
 * Falls back to local Kubo if the relay's /pin endpoint is not configured.
 */
export const uploadToPinata = async (data: object): Promise<string> => {
  // Calls the relay server's /pin proxy — JWT is on the server, not the browser.
  // Users never need accounts or configuration.
  const relayBase = getLocalNode(8765)

  const response = await fetch(`${relayBase}/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Relay /pin failed (${response.status}): ${err}`)
  }

  const result = await response.json()
  const cid = result.cid
  if (!cid) throw new Error("Relay /pin returned no CID")
  console.log("🌍 [Global] Mail pinned via relay:", cid)
  return cid
}

/**
 * Uploads a raw file (Blob) via the relay server's /pin-file proxy.
 */
export const uploadFileToPinata = async (blob: Blob, filename: string): Promise<string> => {
  const relayBase = getLocalNode(8765)

  const formData = new FormData()
  formData.append("file", blob, filename)

  const response = await fetch(`${relayBase}/pin-file`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Relay /pin-file failed (${response.status}): ${err}`)
  }

  const result = await response.json()
  const cid = result.cid
  if (!cid) throw new Error("Relay /pin-file returned no CID")
  console.log("🌍 [Global] File pinned via relay:", cid)
  return cid
}

/**
 * Checks if the relay server has global pinning enabled.
 * Returns true if the relay's /pin/status reports pinataReady.
 */
export const isPinataConfigured = async (): Promise<boolean> => {
  try {
    const relayBase = getLocalNode(8765)
    const res = await fetch(`${relayBase}/pin/status`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return false
    const data = await res.json()
    return data.pinataReady === true
  } catch {
    return false
  }
}

export const uploadPublicKey = async (publicKey: string): Promise<string> => {
  // Try relay proxy first (globally reachable)
  try {
    const blob = new Blob([publicKey], { type: "text/plain" })
    const cid = await uploadFileToPinata(blob, `pubkey_${Date.now()}.asc`)
    console.log("🌍 [Global] Public key anchored:", cid)
    return cid
  } catch (proxyErr) {
    console.warn("⚠️ Relay /pin-file failed for key, using local Kubo fallback", proxyErr)
  }

  // Fallback: local Kubo
  try {
    const blob = new Blob([publicKey], { type: "text/plain" })
    const formData = new FormData()
    formData.append("file", blob, `id_${Date.now()}.txt`)

    const addResponse = await fetch(`${getLocalNode(5001)}/api/v0/add?pin=true`, {
      method: "POST",
      body: formData,
    })

    if (!addResponse.ok) throw new Error("Kubo id add failed")

    const text = await addResponse.text()
    const result = JSON.parse(text.trim().split("\n").pop()!)
    return result.Hash
  } catch (err) {
    console.warn("⚠️ IPFS Identity Anchoring failed — falling back to network only", err)
    return ""
  }
}

export const fetchPublicKeyFromIPFS = async (cid: string): Promise<string> => {
  try {
    const data = await fetchFromIPFS(cid)
    return typeof data === "string" ? data : JSON.stringify(data)
  } catch { return "" }
}

export const stripPGP = (text: string): string => {
  if (!text) return ""
  return text
    .replace(/-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/g,
      "[Encrypted — open in SecureMail to decrypt]")
    .replace(/-----BEGIN PGP SIGNED MESSAGE-----[\s\S]*?-----END PGP SIGNATURE-----/g,
      "[PGP Signed Message]")
    .replace(/-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g,
      "[PGP Public Key]")
    .replace(/-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
      "[PGP Private Key — hidden for security]")
    .trim()
}

const MASTER_IP = "130.1.6.173";

export const getLocalNode = (port: number) => {
  if (typeof window !== "undefined") {
    // If we are browsing via IP, use that IP. Otherwise, use the Master IP.
    const host = window.location.hostname === "localhost" ? MASTER_IP : window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${host}:${port}`;
  }
  return `http://${MASTER_IP}:${port}`;
}

export const uploadToIPFS = async (data: object): Promise<string> => {
  try {
    const json     = JSON.stringify(data)
    const blob     = new Blob([json], { type: "application/json" })
    const formData = new FormData()
    formData.append("file", blob, `securemail_${Date.now()}.json`)

    let addResponse;
    try {
      addResponse = await fetch(`${getLocalNode(5001)}/api/v0/add?pin=false`, {
        method: "POST",
        body: formData,
      })
    } catch (err) {
      console.warn("⚠️ IPFS dynamic fetch failed, retrying with localhost...", err)
      addResponse = await fetch(`http://localhost:5001/api/v0/add?pin=false`, {
        method: "POST",
        body: formData,
      }).catch(e => { throw new Error(`Kubo connection failed: ${e.message}`) })
    }

    if (!addResponse.ok) {
      const err = await addResponse.text()
      throw new Error(`Kubo add failed: ${err}`)
    }

    const responseText = await addResponse.text()
    const lines        = responseText.trim().split("\n")
    const result       = JSON.parse(lines[lines.length - 1])
    const cid          = result.Hash
    console.log("📦 Added to Kubo:", cid)

    try {
      const pinResponse = await fetch(`${getLocalNode(9094)}/pins/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replication_factor_min: -1,
          replication_factor_max: -1,
          name: `securemail_${Date.now()}`,
        }),
      })
      if (pinResponse.ok) {
        console.log("✅ Pinned via IPFS Cluster:", cid)
      } else {
        console.warn("⚠️ Cluster pin failed, file still on local node:", cid)
      }
    } catch {
      console.warn("⚠️ Cluster offline — file pinned locally only")
    }

    return cid

  } catch (err) {
    console.error("IPFS upload failed:", err)
    throw err
  }
}

export const uploadFileToIPFS = async (blob: Blob, filename: string): Promise<string> => {
  try {
    const formData = new FormData()
    formData.append("file", blob, filename)

    const addResponse = await fetch(`${getLocalNode(5001)}/api/v0/add?pin=false`, {
      method: "POST",
      body: formData,
    })

    if (!addResponse.ok) {
      const err = await addResponse.text()
      throw new Error(`Kubo file add failed: ${err}`)
    }

    const responseText = await addResponse.text()
    const lines        = responseText.trim().split("\n")
    const result       = JSON.parse(lines[lines.length - 1])
    const cid          = result.Hash
    console.log("📦 File added to Kubo:", cid)

    try {
      const pinResponse = await fetch(`${getLocalNode(9094)}/pins/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replication_factor_min: -1,
          replication_factor_max: -1,
          name: filename,
        }),
      })
      if (pinResponse.ok) {
        console.log("✅ File pinned via IPFS Cluster:", cid)
      } else {
        console.warn("⚠️ Cluster pin failed, file still on local node:", cid)
      }
    } catch {
      console.warn("⚠️ Cluster offline — file pinned locally only")
    }

    return cid

  } catch (err) {
    console.error("IPFS file upload failed:", err)
    throw err
  }
}

export const fetchFromIPFS = async (cid: string): Promise<any> => {
  if (!cid || cid.length < 10) throw new Error("Invalid CID")

  const gateways = [
    // 🌍 PINATA FIRST — content pinned here is globally available immediately
    { name: "Pinata",       url: (c: string) => `https://gateway.pinata.cloud/ipfs/${c}`, timeout: 8000 },
    
    // 🔗 LOCAL RELAY (fast if user is on same network)
    { name: "Local Kubo",   url: (c: string) => `${getLocalNode(5001)}/api/v0/cat?arg=${c}`, method: "POST", timeout: 5000 },
    
    // 🌍 HIGH-AVAILABILITY PUBLIC GATEWAYS
    { name: "Cloudflare",   url: (c: string) => `https://cloudflare-ipfs.com/ipfs/${c}`, timeout: 10000 },
    { name: "IPFS.io",      url: (c: string) => `https://ipfs.io/ipfs/${c}`, timeout: 12000 },
    { name: "Web3.Storage", url: (c: string) => `https://${c}.ipfs.w3s.link/`, timeout: 12000 },
    { name: "DWeb",         url: (c: string) => `https://${c}.ipfs.dweb.link/`, timeout: 12000 },
    
    // 🛡️ BACKUP GATEWAYS
    { name: "Gateway.ipfs", url: (c: string) => `https://gateway.ipfs.io/ipfs/${c}`, timeout: 15000 },
    { name: "Lighthouse",   url: (c: string) => `https://gateway.lighthouse.storage/ipfs/${c}`, timeout: 15000 },
  ]

  const fetchWithTimeout = async (gate: any) => {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), gate.timeout)
    
    try {
      const response = await fetch(gate.url(cid), {
        method: gate.method || "GET",
        signal: controller.signal
      })
      clearTimeout(id)
      if (!response.ok) throw new Error(`${gate.name} failed (${response.status})`)
      const text = await response.text()
      try { return JSON.parse(text) } 
      catch { return text }
    } catch (err) {
      clearTimeout(id)
      throw err
    }
  }

  // 🔄 Multi-Stage Fetching
  // Stage 1: Fast Fetch (Local + Fast Global)
  const firstPool = gateways.slice(0, 4)
  for (const gate of firstPool) {
    try {
      // console.log(`📦 [IPFS] Trying ${gate.name}...`)
      return await fetchWithTimeout(gate)
    } catch { continue }
  }

  // Stage 2: Deep Fetch (Parallel fallback for remaining)
  console.warn(`📦 [IPFS] Fast fetch failed for ${cid.slice(0, 10)}... starting deep scan.`)
  const remainingPool = gateways.slice(4)
  
  // Try them one by one but with higher persistence
  for (const gate of remainingPool) {
    try {
      // console.log(`📦 [IPFS] Probing backup: ${gate.name}...`)
      return await fetchWithTimeout(gate)
    } catch { continue }
  }

  throw new Error(`Global Communication Error: Could not fetch content ${cid} from any of ${gateways.length} sources. The content may not have propagated yet.`)
}

export const getIPFSLinks = (cid: string) => ({
  local:  `${getLocalNode(8080)}/ipfs/${cid}`,
  public: `https://ipfs.io/ipfs/${cid}`,
})

export const checkPinStatus = async (
  cid: string
): Promise<"pinned" | "not-pinned" | "offline"> => {
  try {
    const response = await fetch(`${getLocalNode(9094)}/pins/${cid}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (response.ok) {
      const data     = await response.json()
      const statuses = Object.values(data.peer_map || {}) as any[]
      const isPinned = statuses.some((s: any) => s.status === "pinned")
      return isPinned ? "pinned" : "not-pinned"
    }
  } catch { /* cluster offline, fall through */ }

  try {
    const response = await fetch(
      `${getLocalNode(5001)}/api/v0/pin/ls?arg=${cid}&type=recursive`,
      { method: "POST", signal: AbortSignal.timeout(3000) }
    )
    if (!response.ok) return "not-pinned"
    const data = await response.json()
    if (data?.Keys?.[cid]) return "pinned"
    return "not-pinned"
  } catch {
    return "offline"
  }
}

// ── IPFS PubSub Discovery Loop ───────────────────────────────
// This enables LAN discovery for users on the same WiFi/Network
const DISCOVERY_TOPIC = "securemail_discovery_v1";

export const startDiscoveryPubSub = async (userEmail: string, publicKey: string) => {
  if (typeof window === "undefined") return;

  const announceSelf = async () => {
    try {
      // 🛡️ Pre-check connectivity to avoid console flooding
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1000)
      const isReachable = await fetch(`${getLocalNode(5001)}/api/v0/id`, { method: "POST", signal: controller.signal, mode: 'no-cors' })
        .then(() => true).catch(() => false)
      clearTimeout(timeoutId)
      if (!isReachable) return

      const data = JSON.stringify({ type: "announce", email: userEmail, publicKey, timestamp: Date.now() });
      await fetch(`${getLocalNode(5001)}/api/v0/pubsub/pub?arg=${DISCOVERY_TOPIC}`, {
        method: "POST",
        body: new TextEncoder().encode(data)
      });
    } catch {}
  };

  const listenForPeers = async () => {
    try {
      // 🛡️ Pre-check connectivity to avoid console flooding
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1000)
      const isReachable = await fetch(`${getLocalNode(5001)}/api/v0/id`, { method: "POST", signal: controller.signal, mode: 'no-cors' })
        .then(() => true).catch(() => false)
      clearTimeout(timeoutId)
      if (!isReachable) return

      const response = await fetch(`${getLocalNode(5001)}/api/v0/pubsub/sub?arg=${DISCOVERY_TOPIC}`, {
        method: "POST"
      });
      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        try {
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.trim().split("\n");
          for (const line of lines) {
            const parsed = JSON.parse(line);
            const msg = JSON.parse(atob(parsed.data));
            if (msg.type === "announce" && msg.email && msg.publicKey) {
              const { gun } = await import("./gun");
              gun.get("securemail_pubkeys").get(msg.email).put({ email: msg.email, publicKey: msg.publicKey });
            }
            // 🛡️ Discovery Storm: React to repair requests
            else if (msg.type === "REPAIR_REQUIRED" && msg.email) {
              const userJson = localStorage.getItem("user");
              if (userJson) {
                const user = JSON.parse(userJson);
                if (user.email === msg.email) {
                   console.log("🛡️ [Discovery Storm] Someone reported our key is broken. Repairing and re-broadcasting...");
                   // We don't need to import gun here to avoid cycles, announceSelf handles it
                   announceSelf(); 
                }
              }
            }
          }
        } catch {}
      }
    } catch {
      // If disconnected, retry once after a delay instead of immediate infinite loop
      await new Promise(r => setTimeout(r, 10000));
      listenForPeers();
    }
  };

  // Launch parallel loops
  announceSelf();
  listenForPeers();
  setInterval(announceSelf, 60000); // reduced heartbeat frequency
}

export const exportMailFromIPFS = async (cid: string, subject: string) => {
  const buildDownload = (rawText: string) => {
  try {
    const parsed = JSON.parse(rawText)

    const cleaned = {
      id:              parsed.id             || "",
      from:            parsed.senderEmail    || "",
      to:              parsed.receiverEmail  || "",
      subject:         parsed.subject        || subject,
      message:         stripPGP(parsed.message || ""),
      time:            parsed.time           || "",
      cid,
      status:          parsed.status         || "",
      isStarred:       parsed.isStarred      || false,
      hasAttachments:  parsed.hasAttachments  || false,
      attachmentCount: parsed.attachmentCount || 0,
      // Include attachment CIDs but NOT raw file data
      attachments: (parsed.attachments || []).map((att: any) => ({
        name: att.name || "",
        size: att.size || "",
        cid:  att.cid  || "",
        type: att.type || "",
      })),
      // Include PoW proof — it's public and useful for verification
      pow:         parsed.pow || null,
      exportedAt:  new Date().toISOString(),
      exportedBy:  "SecureMail",
      note:        "Message body is PGP encrypted. Open in SecureMail to decrypt.",
      // ── Explicitly excluded fields ──
      // message (raw):        stripped above
      // receiverPublicKey:    excluded — sensitive key material
      // privateKey:           excluded
      // password:             excluded
    }

    const blob = new Blob(
      [JSON.stringify(cleaned, null, 2)],
      { type: "application/json" }
    )
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `securemail_${subject.replace(/\s+/g, "_").slice(0, 40)}_${cid.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)

  } catch {
    const cleaned = stripPGP(rawText)
    const blob    = new Blob([cleaned], { type: "text/plain" })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement("a")
    a.href        = url
    a.download    = `securemail_${subject.replace(/\s+/g, "_").slice(0, 40)}_${cid.slice(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
}
  // Try Kubo first
  try {
    const response = await fetch(`${getLocalNode(5001)}/api/v0/cat?arg=${cid}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      buildDownload(await response.text())
      return true
    }
  } catch { /* fall through */ }

  // Fallback to ipfs.io
  try {
    const response = await fetch(`https://ipfs.io/ipfs/${cid}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (response.ok) {
      buildDownload(await response.text())
      return true
    }
  } catch { /* fall through */ }

  throw new Error("Could not export — IPFS daemon may be offline")
}