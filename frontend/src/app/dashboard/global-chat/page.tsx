"use client"

import { useEffect, useState, useRef } from "react"
import { gun, generateDID, signData, verifySignature } from "@/utils/gun"
import { computePoW, verifyPoW, createChallenge } from "@/utils/pow"
import PageHeader from "@/components/PageHeader"

interface GlobalMessage {
  id: string
  senderName: string
  senderEmail: string
  senderDid: string
  content: string
  timestamp: string
  signature?: string
  pow?: { nonce: number; difficulty: number }
  verified?: boolean
}

export default function GlobalDiscoveryPage() {
  const [messages, setMessages] = useState<GlobalMessage[]>([])
  const [newMsg, setNewMsg] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [user, setUser] = useState<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const localUser = JSON.parse(localStorage.getItem("user") || "{}")
    setUser(localUser)

    // Listen to global feed with batched updates
    const feed = gun.get("securemail_global_feed")
    let batch: GlobalMessage[] = []
    let timer: NodeJS.Timeout | null = null

    const processBatch = () => {
      setMessages(prev => {
        const map = new Map(prev.map(m => [m.id, m]))
        batch.forEach(m => {
          if (!map.has(m.id) || (!map.get(m.id).verified && m.verified)) {
            map.set(m.id, m)
          }
        })
        batch = []
        return Array.from(map.values()).sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      })
      timer = null
    }

    feed.map().on(async (data: any) => {
      if (!data || !data.id || !data.content) return
      
      const msg: GlobalMessage = { ...data, verified: false }
      batch.push(msg)
      
      if (!timer) timer = setTimeout(processBatch, 200)

      if (data.senderDid && data.signature) {
        gun.get("securemail_pubkeys").get(data.senderEmail).once(async (pubData: any) => {
          if (pubData?.publicKey) {
            const isSigValid = await verifySignature(data.content, data.signature, pubData.publicKey)
            const isPowValid = data.pow ? await verifyPoW(await createChallenge(data.senderEmail, data.content, data.timestamp), data.pow.nonce, data.pow.difficulty) : false
            
            const verifiedMsg = { ...msg, verified: isSigValid && isPowValid }
            batch.push(verifiedMsg)
            if (!timer) timer = setTimeout(processBatch, 200)
          }
        })
      }
    })

    return () => { if (timer) clearTimeout(timer) }
  }, [])

  const handleBroadcast = async () => {
    if (!newMsg.trim() || !user) return
    setIsBroadcasting(true)

    try {
      const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const did = user.did || await generateDID(user.publicKey)
      const timestamp = new Date().toISOString()
      
      // 1. Proof-of-Work
      const challenge = await createChallenge(user.email, newMsg.trim(), timestamp)
      const { nonce } = await computePoW(challenge, 3) // difficulty: 3
      
      // 2. Signature
      const signature = await signData(newMsg.trim(), user.privateKey, user.password)

      const payload: GlobalMessage = {
        id,
        senderName: user.name || "Anonymous",
        senderEmail: user.email,
        senderDid: did,
        content: newMsg.trim(),
        timestamp,
        signature,
        pow: { nonce, difficulty: 3 }
      }

      gun.get("securemail_global_feed").get(id).put(payload, (ack: any) => {
        if (ack.err) console.error("❌ Broadcast failed:", ack.err)
        else {
          console.log("✅ Broadcast successful:", id)
          setNewMsg("")
        }
        setIsBroadcasting(false)
      })
    } catch (err) {
      console.error("❌ Error broadcasting:", err)
      setIsBroadcasting(false)
    }
  }

  const filteredMessages = messages.filter(m => 
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.senderName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border-gold)",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "12px",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader 
        title="🌍 Global Discovery" 
        count={messages.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search broadcasts..."
        rightElement={
          <div style={{
            fontSize: "11px", color: "#4caf6e", 
            background: "rgba(76,175,110,0.1)", padding: "4px 10px", 
            borderRadius: "20px", border: "1px solid rgba(76,175,110,0.3)"
          }}>
            ● Live Network
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }} ref={scrollRef}>
        <div style={{ maxWidth: "700px", margin: "0 auto" }}>
          
          {/* Broadcast Input Area */}
          <div style={{
            ...cardStyle,
            background: "rgba(212, 175, 55,0.03)",
            borderStyle: "dashed",
            display: "flex", flexDirection: "column", gap: "12px",
            marginBottom: "32px"
          }}>
            <textarea 
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="What's happening in the global network?"
              style={{
                width: "100%", height: "80px", background: "none", border: "none",
                color: "var(--text-bright)", fontSize: "14px", fontFamily: "inherit",
                resize: "none", outline: "none"
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {newMsg.length}/280 · Public Broadcast
              </span>
              <button 
                onClick={handleBroadcast}
                disabled={isBroadcasting || !newMsg.trim()}
                style={{
                  background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                  color: "var(--bg-body)", border: "none", borderRadius: "20px",
                  padding: "8px 20px", fontWeight: "800", fontSize: "12px",
                  cursor: "pointer", boxShadow: "0 2px 10px rgba(212, 175, 55,0.3)",
                  opacity: (isBroadcasting || !newMsg.trim()) ? 0.6 : 1
                }}
              >
                {isBroadcasting ? "📡 Broadcasting..." : "📡 Broadcast"}
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          {filteredMessages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>🌐</div>
              <p>The global feed is quiet. Be the first to broadcast!</p>
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div key={msg.id} style={cardStyle} className="discovery-card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ 
                      width: "32px", height: "32px", borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--gold-mid), var(--gold-dark))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: "700", fontSize: "14px", color: "#1a1200"
                    }}>
                      {msg.senderName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)" }}>
                        {msg.senderName} 
                        <span style={{ fontWeight: "400", color: "var(--text-muted)", fontSize: "11px", marginLeft: "6px" }}>
                          @{msg.senderEmail.split('@')[0]}
                        </span>
                      </div>
                      <div style={{ fontSize: "9px", color: "var(--gold-mid)", fontFamily: "Courier New, monospace" }}>
                        {msg.senderDid || "no-did"}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ 
                  color: "var(--text-dim)", fontSize: "14px", lineHeight: "1.6",
                  paddingLeft: "40px"
                }}>
                  {msg.content}
                </div>
                <div style={{ 
                  marginTop: "12px", display: "flex", gap: "16px", 
                  paddingLeft: "40px", fontSize: "12px", color: "var(--text-muted)" 
                }}>
                  <span style={{ 
                    cursor: "pointer", 
                    color: msg.verified ? "#4caf6e" : "var(--text-muted)",
                    fontWeight: msg.verified ? "700" : "400"
                  }} title={msg.verified ? "Signature & PoW Verified" : "Verification in progress..."}>
                    {msg.verified ? "🛡️ Verified" : "🛡️ Processing..."}
                  </span>
                  <span style={{ cursor: "pointer" }}>💬 Reply</span>
                  <span style={{ cursor: "pointer" }}>⚡ Tip</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .discovery-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border-color: var(--gold-mid);
        }
      `}</style>
    </div>
  )
}
