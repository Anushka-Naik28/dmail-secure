import express from "express"
import http from "http"
import Gun from "gun"
import os from "os"
import dotenv from "dotenv"
import multer from "multer"
import { getGatewayConfig, saveGatewayConfig } from "./config_manager.js"
import { initSMTPTransporter, startIMAPSync, sendSMTPEmail } from "./gateway.js"

dotenv.config()

const app = express()
const server = http.createServer(app)
const PORT = 8765

// ── CORS — allow all origins for local network access ──
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-DMail-Email, X-DMail-Password, x-dmail-email, x-dmail-password")
  if (req.method === "OPTIONS") return res.sendStatus(200)
  next()
})

app.use(express.json())

// ── Health check — confirm server is running ──
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "SecureMail GunDB Relay",
    port: PORT,
    time: new Date().toISOString(),
  })
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", gun: "running", port: PORT })
})

// ── Pinata Global Pinning Proxy ──
const upload = multer({ storage: multer.memoryStorage() })
const PINATA_JWT = process.env.PINATA_JWT || ""

app.get("/pin/status", (req, res) => {
  res.json({ pinataReady: !!PINATA_JWT })
})

app.post("/pin", async (req, res) => {
  if (!PINATA_JWT) return res.status(503).send("Pinata not configured on backend")
  
  try {
    const data = req.body.data
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: { name: `dmail_json_${Date.now()}` },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).send(err)
    }

    const result = await response.json()
    res.json({ cid: result.IpfsHash })
  } catch (err) {
    res.status(500).send(err.message)
  }
})

app.post("/pin-file", upload.single("file"), async (req, res) => {
  if (!PINATA_JWT) return res.status(503).send("Pinata not configured on backend")
  if (!req.file) return res.status(400).send("No file provided")
  
  try {
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "application/octet-stream" })
    const formData = new FormData()
    formData.append("file", blob, req.file.originalname || `file_${Date.now()}`)
    formData.append("pinataMetadata", JSON.stringify({ name: req.file.originalname || `file_${Date.now()}` }))
    formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }))

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { "Authorization": `Bearer ${PINATA_JWT}` },
      body: formData,
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).send(err)
    }

    const result = await response.json()
    res.json({ cid: result.IpfsHash })
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ── SMTP Relay route deprecated ──

// ── IPFS Fetch Proxy ──
// Allows remote devices to fetch content from this master node's local IPFS daemon
// Bypasses IPFS API CORS and local-only bind restrictions (port 5001/8080)
app.get("/ipfs/:cid", async (req, res) => {
  try {
    // Try to fetch from local Kubo API
    const response = await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${req.params.cid}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      return res.status(404).send("Content not found on local master node")
    }
    
    // We stream the response back. For simplicity we assume it's text/json
    // as our app primarily fetches JSON vaults and mails.
    const text = await response.text()
    try {
      res.json(JSON.parse(text))
    } catch {
      res.send(text)
    }
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// 🔒 This server IS the relay — it does not peer with external relays.
// All devices on the LAN connect HERE and get the same shared data graph.
// External public relays have their own isolated data graphs — peering with
// them would scatter mail data and cause inbox inconsistency across devices.

// ── Mount Gun on the HTTP server ──
const gun = Gun({
  web: server,          // attach to existing HTTP server
  file: "data",          // persist data to ./data folder
  radisk: true,
  multicast: false,
  // peers: [] intentionally empty — this IS the canonical relay
})

console.log("📡 [Relay] Running as primary relay — all devices should connect to this server")

// ── Initialize Hybrid Gateway SMTP and IMAP Workers ──
initSMTPTransporter()
startIMAPSync(gun)

// ── Verification Middleware ──
const verifyUser = (req, res, next) => {
  const email = req.headers["x-dmail-email"]
  const password = req.headers["x-dmail-password"]

  if (!email || !password) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication credentials." })
  }

  const cleanEmail = email.trim().toLowerCase()
  gun.get("securemail_users").get(cleanEmail).once((user) => {
    if (user && user.password === password) {
      req.user = user
      next()
    } else {
      res.status(401).json({ error: "Unauthorized: Invalid email or password." })
    }
  })
}

// ── POST Gateway Register Auth (Sync Credentials) ──
app.post("/api/gateway/register-auth", async (req, res) => {
  const { email, password, publicKey } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." })
  }
  const cleanEmail = email.trim().toLowerCase()
  gun.get("securemail_users").get(cleanEmail).put({
    email: cleanEmail,
    password: password,
    publicKey: publicKey || ""
  })
  res.json({ success: true, message: "Credentials registered directly on backend." })
})

// ── GET Gateway Config ──
app.get("/api/gateway/config", verifyUser, (req, res) => {
  const config = getGatewayConfig()
  const redacted = { ...config }
  if (redacted.smtpPass) redacted.smtpPass = "********"
  if (redacted.imapPass) redacted.imapPass = "********"
  res.json(redacted)
})

// ── POST Gateway Config ──
app.post("/api/gateway/config", verifyUser, async (req, res) => {
  try {
    const config = req.body
    const existing = getGatewayConfig()

    if (config.smtpPass === "********") {
      config.smtpPass = existing.smtpPass || ""
    }
    if (config.imapPass === "********") {
      config.imapPass = existing.imapPass || ""
    }

    const saved = saveGatewayConfig(config)
    if (!saved) {
      return res.status(500).json({ error: "Failed to save configuration to disk." })
    }

    initSMTPTransporter()
    startIMAPSync(gun)

    res.json({ success: true, message: "Configuration saved and gateway reloaded." })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST Gateway Send SMTP ──
app.post("/api/gateway/send-smtp", verifyUser, async (req, res) => {
  const { senderEmail, receiverEmail, subject, message, html, attachments, cc, bcc } = req.body

  if (!senderEmail || !receiverEmail || !subject || !message) {
    return res.status(400).json({
      error: "Missing required fields (senderEmail, receiverEmail, subject, message).",
    })
  }

  try {
    const messageId = await sendSMTPEmail({
      senderEmail,
      receiverEmail,
      subject,
      message,
      html,
      attachments,
      cc,
      bcc
    })
    res.json({ success: true, messageId })
  } catch (err) {
    console.error("❌ [Gateway Send] SMTP delivery failed:", err.message)
    res.status(500).json({ error: `SMTP relay failed: ${err.message}` })
  }
})

// ── Gun debug logging ──
gun.on("out", { "#": { "*": "" } })

// ── Fast Relay WebSocket Layer ──
import { WebSocketServer } from "ws"
const wss = new WebSocketServer({ noServer: true })
const clients = new Map() // email -> socket

wss.on("connection", (ws) => {
  let userEmail = null

  ws.on("message", (message) => {
    try {
      const payload = JSON.parse(message)
      
      if (payload.type === "auth") {
        userEmail = payload.email?.trim().toLowerCase()
        if (userEmail) {
          clients.set(userEmail, ws)
          console.log(`🔌 [Relay] User connected: ${userEmail} (Total: ${clients.size})`)
          ws.send(JSON.stringify({ type: "ready", status: "online" }))
        }
      }

      if (payload.type === "push") {
        const target = payload.recipient?.trim().toLowerCase()
        const recipientSocket = clients.get(target)
        
        if (recipientSocket && recipientSocket.readyState === 1) {
          console.log(`🚀 [Relay] Instant Push: ${userEmail} -> ${target}`)
          recipientSocket.send(JSON.stringify({
            type: "mail",
            sender: userEmail,
            content: payload.content, // Fast-Encrypted (ECC+AES)
            metadata: payload.metadata
          }))
          ws.send(JSON.stringify({ type: "push_ack", id: payload.metadata?.id, status: "delivered" }))
        } else {
          // If recipient is offline, frontend will fallback to GunDB/Nostr (handled in sendMailNow)
          ws.send(JSON.stringify({ type: "push_ack", id: payload.metadata?.id, status: "offline" }))
        }
      }
    } catch (err) {
      console.error("❌ [Relay] Message Error:", err)
    }
  })

  ws.on("close", () => {
    if (userEmail) {
      clients.delete(userEmail)
      console.log(`🔌 [Relay] User disconnected: ${userEmail}`)
    }
  })
})

// Handle upgrade from HTTP to WS
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const pathname = url.pathname
  
  if (pathname === "/relay") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request)
    })
  } else {
    // 💡 IMPORTANT: If it's not for our custom relay, do NOT block it.
    // Let GunDB's internal WebSocket handler take over (usually on /gun).
    // This allows both the Fast Relay and the Gun Mesh to coexist on the same port.
  }
})

// ── Log all local network IPs so you know which IP to use ──
const getLocalIPs = () => {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalIPs()
  console.log("\n🚀 SecureMail GunDB Relay Server")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log(`✅ Listening on port ${PORT}`)
  console.log(`✅ Local:   http://localhost:${PORT}/gun`)
  ips.forEach((ip) => {
    console.log(`✅ Network: http://${ip}:${PORT}/gun`)
  })
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("📌 Use the Network URL for cross-device access\n")
})