"use client"

import { useEffect, useState } from "react"
import { Database, Share2, Activity } from "lucide-react"
import { checkGunServer } from "@/utils/gun"
import { getLocalNode } from "@/utils/ipfs"

interface Status {
  gun: "online" | "offline" | "checking"
  ipfs: "online" | "offline" | "checking"
  sync: "synced" | "pending"
  peers: { gun: number; ipfs: number }
}

export default function NetworkStatus() {
  const [status, setStatus] = useState<Status>({
    gun: "checking",
    ipfs: "checking",
    sync: "pending",
    peers: { gun: 0, ipfs: 0 }
  })

  useEffect(() => {
    const checkStatus = async () => {
      // 1. Check GunDB Status
      let gunStatus: "online" | "offline" = "offline"
      let gunPeers = 0
      try {
        const result = await checkGunServer()
        if (result.reachable) {
          gunStatus = "online"
          gunPeers  = result.peers || 1 
        }
      } catch {
        gunStatus = "offline"
      }

      // 2. Check IPFS Status
      let ipfsStatus: "online" | "offline" = "offline"
      let ipfsPeers = 0
      try {
        const res = await fetch(`${getLocalNode(5001)}/api/v0/id`, { 
          method: "POST", 
          signal: AbortSignal.timeout(2000) 
        })
        if (res.ok) {
          const data = await res.json()
          ipfsStatus = "online"
          // Fetch IPFS peers
          const pRes = await fetch(`${getLocalNode(5001)}/api/v0/swarm/peers`, { 
            method: "POST",
            signal: AbortSignal.timeout(2000)
          })
          const pData = await pRes.json()
          ipfsPeers = pData.Peers?.length || 0
        }
      } catch {
        ipfsStatus = "offline"
      }

      setStatus({
        gun: gunStatus,
        ipfs: ipfsStatus,
        sync: gunStatus === "online" ? "synced" : "pending",
        peers: { gun: gunPeers, ipfs: ipfsPeers }
      })
    }

    checkStatus()
    const interval = setInterval(checkStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (s: string) => {
    if (s === "online") return "#4caf6e"
    if (s === "checking") return "var(--gold-mid)"
    return "#e84234"
  }

  return (
    <div className="network-status-container" style={{
      padding: "16px",
      borderTop: "1px solid var(--border-gold)",
      background: "rgba(212, 175, 55,0.02)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        fontSize: "10px", fontWeight: "800", color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px"
      }}>
        <Activity size={12} />
        Network Health
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        
        {/* GunDB */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={14} color={getStatusColor(status.gun)} style={{ opacity: 0.8 }} />
            <span style={{ fontSize: "11px", color: "var(--text-bright)", fontWeight: "600" }}>GunDB Sync</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
             <div style={{
               width: "6px", height: "6px", borderRadius: "50%",
               background: getStatusColor(status.gun),
               boxShadow: status.gun === "online" ? `0 0 8px ${getStatusColor(status.gun)}` : "none"
             }} />
             <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "Raleway, sans-serif" }}>
               {status.gun === "online" 
                 ? `${status.peers.gun} Peers ${typeof window !== "undefined" && localStorage.getItem("dmail_discovered_relay") ? "(Mesh Relay)" : ""}` 
                 : status.gun === "checking" ? "..." : "Offline"}
             </span>
          </div>
        </div>

        {/* Identity Sync */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={14} color={status.sync === "synced" ? "#4caf6e" : "var(--gold-mid)"} style={{ opacity: 0.8 }} />
            <span style={{ fontSize: "11px", color: "var(--text-bright)", fontWeight: "600" }}>Identity Sync</span>
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "Raleway, sans-serif" }}>
            {status.sync === "synced" ? "Global" : "Local Only"}
          </span>
        </div>

        {/* IPFS */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Share2 size={14} color={getStatusColor(status.ipfs)} style={{ opacity: 0.8 }} />
            <span style={{ fontSize: "11px", color: "var(--text-bright)", fontWeight: "600" }}>IPFS Node</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
             <div style={{
               width: "6px", height: "6px", borderRadius: "50%",
               background: getStatusColor(status.ipfs),
               boxShadow: status.ipfs === "online" ? `0 0 8px ${getStatusColor(status.ipfs)}` : "none"
             }} />
             <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "Raleway, sans-serif" }}>
               {status.ipfs === "online" ? `${status.peers.ipfs} Peers` : status.ipfs === "checking" ? "..." : "Offline"}
             </span>
          </div>
        </div>

      </div>

      {status.gun === "offline" && status.ipfs === "offline" && (
        <div style={{
          marginTop: "12px", padding: "6px 10px", borderRadius: "6px",
          background: "rgba(217,48,37,0.1)", border: "1px solid rgba(217,48,37,0.2)",
          fontSize: "9px", color: "#e84234", lineHeight: "1.4"
        }}>
          ⚠️ Global network disconnected. Reconnecting...
        </div>
      )}
    </div>
  )
}
