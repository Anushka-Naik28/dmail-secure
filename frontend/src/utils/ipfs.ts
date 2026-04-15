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

  const strategies = [
    // 1. Web3.Storage Gateway (Very fast for w3s uploads)
    async () => {
      const response = await fetch(`https://${cid}.ipfs.w3s.link/`, {
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error("w3s failed")
      return await response.json()
    },
    // 2. DWeb.link (Global CDN)
    async () => {
      const response = await fetch(`https://${cid}.ipfs.dweb.link/`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error("dweb failed")
      return await response.json()
    },
    // 3. Local Kubo (Still useful if user has it running)
    async () => {
      const response = await fetch(`${getLocalNode(5001)}/api/v0/cat?arg=${cid}`, {
        method: "POST",
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) throw new Error("Local cat failed")
      return JSON.parse(await response.text())
    },
    // 4. Cloudflare
    async () => {
      const response = await fetch(`https://cloudflare-ipfs.com/ipfs/${cid}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error("Cloudflare failed")
      return await response.json()
    },
    // 5. IPFS.io
    async () => {
      const response = await fetch(`https://ipfs.io/ipfs/${cid}`, {
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) throw new Error("ipfs.io failed")
      return await response.json()
    },
  ]

  for (const strategy of strategies) {
    try {
      return await strategy()
    } catch {
      continue
    }
  }

  throw new Error(`Could not fetch CID ${cid} from any source`)
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