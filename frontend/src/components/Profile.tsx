"use client"

import { useEffect, useState } from "react"
import { gun, db } from "@/utils/gun"
import { copyToClipboard } from "@/utils/clipboard"

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [counts, setCounts] = useState({ inbox: 0, sent: 0, spam: 0, starred: 0, trash: 0 })
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [showFullPublicKey, setShowFullPublicKey] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const localUser = JSON.parse(localStorage.getItem("user") || "{}")
    if (!localUser.email) return
    setUser(localUser)

    // Using global gun instance

    // Collect all mails into an array first, then count
    const collected: any[] = []

    gun.get("securemail_mails").map().on((mail: any) => {
      if (!mail || !mail.id || mail.status === "purged") return

      // Update or add to collected
      const idx = collected.findIndex((m) => m.id === mail.id)
      if (idx >= 0) collected[idx] = mail
      else collected.push(mail)

      // Recount everything from collected array
      let inbox = 0, sent = 0, spam = 0, starred = 0, trash = 0

      collected.forEach((m) => {
        if (m.receiverEmail === localUser.email) {
          if (m.status === "inbox")  inbox++
          if (m.status === "spam")   spam++
          if (m.status === "trash")  trash++
          if (m.isStarred)           starred++
        }
        if (m.senderEmail === localUser.email) sent++
      })

      setCounts({ inbox, sent, spam, starred, trash })
    })

  }, [])

  const copyPublicKey = () => {
    if (!user?.publicKey) return
    copyToClipboard(user.publicKey)
    setCopiedPublic(true)
    setTimeout(() => setCopiedPublic(false), 2000)
  }

  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle")

  const syncIdentity = async () => {
    setSyncing(true)
    setSyncStatus("idle")
    
    try {
      const { isKeyValid, db } = await import("@/utils/gun")
      const localUser = JSON.parse(localStorage.getItem("user") || "{}")
      
      const isValid = await isKeyValid(localUser.publicKey)
      if (!isValid) {
        console.warn("🚨 Local public key is corrupted (Length:", localUser.publicKey?.length, "). Attempting Auto-Repair...")
        const repair = await db.repairIdentity()
        if (repair.success) {
           setSyncStatus("success")
           alert(`✅ Identity Repaired & Synced!\nYour public key has been restored. Others can now find you.`)
           setSyncing(false)
           return
        } else {
           setSyncStatus("error")
           alert(`❌ Identity Corruption: Repair failed (${repair.error}). Please log out and back in to fully reset your identity.`)
           setSyncing(false)
           return
        }
      }

      await db.reannounceUser()
      setSyncStatus("success")
      setTimeout(() => setSyncStatus("idle"), 3000)
    } catch (e) {
      setSyncStatus("error")
    }
    
    setSyncing(false)
  }

  const downloadPublicKey = () => {
    const blob = new Blob([user.publicKey], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${user.email}_publickey.asc`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getKeyPreview = (key: string) => {
    if (!key) return ""
    const short = key.replace(/\s/g, "").slice(0, 24)
    return `${short}...`
  }

  const generateFingerprint = (key: string) => {
    if (!key) return ""
    const clean = key.replace(/\s/g, "").slice(0, 40).toUpperCase()
    return clean.match(/.{1,4}/g)?.join(" ") || ""
  }

  if (!user) return <div className="empty-state">Loading profile...</div>

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>

      {/* Avatar */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%",
          background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "32px", fontWeight: "700", color: "#1a1200",
          margin: "0 auto 16px",
          boxShadow: "0 0 24px rgba(212, 175, 55,0.4)",
          animation: "goldPulse 3s ease-in-out infinite",
        }}>
          {user.name?.charAt(0).toUpperCase()}
        </div>
        <h2 style={{ color: "var(--text-bright)", marginBottom: "4px" }}>{user.name}</h2>
        <p style={{ color: "var(--gold-mid)", fontSize: "14px", fontFamily: "Courier New, monospace", marginBottom: "16px" }}>
          {user.email}
        </p>
        
        <button 
          onClick={syncIdentity} 
          disabled={syncing}
          className="btn-secondary" 
          style={{ 
            fontSize: "11px", padding: "6px 16px", borderRadius: "20px", 
            background: 
              syncStatus === "success" ? "rgba(76,175,110,0.2)" : 
              syncStatus === "error" ? "rgba(217,48,37,0.2)" : 
              syncing ? "rgba(212, 175, 55,0.1)" : "",
            color: 
              syncStatus === "success" ? "#4caf6e" : 
              syncStatus === "error" ? "#e84234" : ""
          }}
        >
          {syncing ? "Syncing..." : 
           syncStatus === "success" ? "Identity Synced!" : 
           syncStatus === "error" ? "Sync Failed" : 
           "Sync Identity with Network"}
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px", marginBottom: "28px",
      }}>
        {[
          { label: "Inbox",   count: counts.inbox },
          { label: "Sent",    count: counts.sent },
          { label: "Starred", count: counts.starred },
          { label: "Spam",    count: counts.spam },
          { label: "Trash",   count: counts.trash },
        ].map(({ label, count }) => (
          <div key={label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border-gold)",
            borderRadius: "12px", padding: "16px", textAlign: "center",
          }}>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--gold-light)" }}>
              {count}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Public Key */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-gold)",
        borderRadius: "12px", padding: "20px", marginBottom: "16px",
      }}>
        <p style={{
          color: "var(--text-muted)", fontSize: "11px", marginBottom: "6px",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          Public Key
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>
          Share this with others so they can send you encrypted messages.
        </p>

        {/* Key Preview */}
        <div style={{
          background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
          borderRadius: "8px", padding: "10px 14px", marginBottom: "12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{
            fontFamily: "Courier New, monospace", fontSize: "11px",
            color: "var(--gold-light)", flex: 1, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {getKeyPreview(user.publicKey)}
          </span>
          <button onClick={() => setShowFullPublicKey(true)} style={{
            background: "none", border: "1px solid var(--gold-mid)", borderRadius: "6px",
            padding: "3px 10px", cursor: "pointer", color: "var(--gold-mid)", fontSize: "11px",
          }}>View</button>
        </div>

        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>
          Fingerprint: {generateFingerprint(user.publicKey)}
        </p>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={copyPublicKey} className="btn-secondary">
            {copiedPublic ? "Copied!" : "Copy Key"}
          </button>
          <button onClick={downloadPublicKey} className="btn-secondary">
            Download
          </button>
        </div>
      </div>

      {/* Private key — never shown */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid rgba(217,48,37,0.25)",
        borderRadius: "12px", padding: "20px", marginBottom: "16px",
      }}>
        <p style={{
          color: "var(--text-muted)", fontSize: "11px", marginBottom: "6px",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          Private Key
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>
          Used to decrypt your messages. Never share this with anyone.
        </p>
        <div style={{
          background: "var(--bg-panel)", border: "1px solid rgba(217,48,37,0.2)",
          borderRadius: "8px", padding: "10px 14px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{
            fontFamily: "Courier New, monospace", fontSize: "11px",
            color: "#e84234", flex: 1, letterSpacing: "2px",
          }}>
            -----BEGIN PGP PRIVATE KEY----- ··· ████████...
          </span>
          <span style={{
            fontSize: "10px", background: "rgba(217,48,37,0.12)", color: "#e84234",
            border: "1px solid rgba(217,48,37,0.25)", borderRadius: "4px",
            padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            Hidden
          </span>
        </div>
      </div>

      {/* Encryption Info */}
      <div style={{
        background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
        borderRadius: "12px", padding: "16px", fontSize: "13px",
        color: "var(--text-muted)", lineHeight: "1.6",
      }}>
        <p style={{ marginBottom: "4px" }}>
          <strong style={{ color: "var(--text-bright)" }}>PGP End-to-End Encrypted</strong>
        </p>
        <p>
          Messages are encrypted with RSA-2048 PGP. Only you can decrypt them
          using your private key and password. Your private key never leaves your device.
        </p>
      </div>

      {/* Full Public Key Modal */}
      {showFullPublicKey && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "520px", width: "90%" }}>
            <h3>Your PGP Public Key</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Safe to share — used by others to encrypt messages to you.
            </p>
            <textarea readOnly value={user.publicKey} style={{
              width: "100%", height: "200px", background: "var(--bg-panel)",
              border: "1px solid var(--border-gold)", borderRadius: "8px",
              padding: "12px", fontFamily: "Courier New, monospace",
              fontSize: "10px", color: "var(--gold-light)", resize: "none",
              lineHeight: "1.5", boxSizing: "border-box",
            }} />
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="btn-secondary" onClick={() => setShowFullPublicKey(false)}>
                Close
              </button>
              <button className="btn" onClick={() => { copyPublicKey(); setShowFullPublicKey(false) }}>
                {copiedPublic ? "Copied!" : "Copy Key"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
