/**
 * relay.ts — Fast Path Client for Instant Message Delivery
 * 
 * This connects to the DMail Relay Server (WebSocket) to provide 
 * sub-second message delivery when users are online.
 */

import { updateMailInStore } from "./mailStore"
import { hybridDecrypt, importKey } from "./crypto"

let socket: WebSocket | null = null
let userEmail: string | null = null
let fastKeys: { public: string, private: string } | null = null

export const connectRelay = (email: string, keys: { public: string, private: string }) => {
  if (socket || typeof window === "undefined") return
  
  userEmail = email.trim().toLowerCase()
  fastKeys = keys

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  // In development, we use localhost. In production, we'd use the relay's IP/domain.
  const relayUrl = `${protocol}//${window.location.hostname}:8765/relay`
  
  console.log(`🔌 [Relay] Connecting to fast-path: ${relayUrl}`)
  socket = new WebSocket(relayUrl)

  socket.onopen = () => {
    console.log("🔌 [Relay] Connected. Authenticating...")
    socket?.send(JSON.stringify({ type: "auth", email: userEmail }))
  }

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data)
      
      if (payload.type === "mail") {
        console.log(`🚀 [Relay] Instant Mail Received from ${payload.sender}`)
        
        // 🛡️ Decrypt using Fast ECC (if keys are available)
        let decryptedBody = payload.content
        if (fastKeys && payload.content.includes("base64:")) {
           try {
             const senderPub = await importKey(payload.metadata.senderFastPublicKey, "public")
             const myPriv = await importKey(fastKeys.private, "private")
             const raw = payload.content.replace("base64:", "")
             decryptedBody = await hybridDecrypt(raw, senderPub, myPriv)
           } catch (e) {
             console.warn("⚠️ [Relay] Fast decryption failed, waiting for PGP/GunDB fallback:", e)
             return // Let GunDB/Nostr handle it
           }
        }

        updateMailInStore(payload.metadata.id, {
          ...payload.metadata,
          message: decryptedBody,
          isDecrypted: true,
          fromRelay: true,
          status: "inbox"
        })
      }

      if (payload.type === "push_ack") {
        console.log(`✅ [Relay] Delivery Confirmed: ${payload.id} (${payload.status})`)
      }
    } catch (err) {
      console.error("❌ [Relay] Protocol Error:", err)
    }
  }

  socket.onclose = () => {
    console.log("🔌 [Relay] Disconnected. Retrying in 5s...")
    socket = null
    setTimeout(() => connectRelay(email, keys), 5000)
  }
}

export const pushMail = async (recipient: string, content: string, metadata: any) => {
  if (!socket || socket.readyState !== 1) return false
  
  socket.send(JSON.stringify({
    type: "push",
    recipient,
    content,
    metadata
  }))
  
  return true
}

export const isRelayConnected = () => socket?.readyState === 1
