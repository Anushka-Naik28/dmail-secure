import express from "express"
import http from "http"
import Gun from "gun"
import os from "os"
import dotenv from "dotenv"
import multer from "multer"

dotenv.config()

const app = express()
const server = http.createServer(app)
const PORT = 8765

// ── CORS — allow all origins for local network access ──
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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

// ── Public relay peers — verified working (April 2025) ──
const PUBLIC_RELAY_PEERS = [
  "https://relay.peer.ooo/gun",
  "https://gun-manhattan.herokuapp.com/gun",
  "https://gundb.io/gun",
  "https://gun.eco/gun",
]

// ── Mount Gun on the HTTP server ──
const gun = Gun({
  web: server,          // attach to existing HTTP server
  file: "data",          // persist data to ./data folder
  radisk: true,
  multicast: false,
  peers: PUBLIC_RELAY_PEERS,  // ← sync with global public relays
})

console.log("📡 [Relay] Syncing with global peers:", PUBLIC_RELAY_PEERS)

// ── Gun debug logging ──
gun.on("out", { "#": { "*": "" } })

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