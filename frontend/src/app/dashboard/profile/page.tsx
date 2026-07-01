"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getCounts, subscribe } from "@/utils/mailStore"
import { copyToClipboard } from "@/utils/clipboard"
import { db } from "@/utils/gun"
import { 
  User, Inbox, Send, Star, AlertOctagon, Trash2, 
  Key, Copy, Check, Download, Lock, Shield, X, 
  RefreshCw, CheckCircle2, XCircle 
} from "lucide-react"

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [counts, setCounts] = useState<any>({ inbox: 0, sent: 0, spam: 0, starred: 0, trash: 0, request: 0, drafts: 0 })
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [showFullPublicKey, setShowFullPublicKey] = useState(false)
  
  const [copiedPrivate, setCopiedPrivate] = useState(false)
  const [showFullPrivateKey, setShowFullPrivateKey] = useState(false)

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
           alert(`✅ Identity Repaired & Synced!\nYour public key has been restored (New Length: ${repair.length} chars). Others can now find you.`)
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
      console.error("Sync failed:", e)
      setSyncStatus("error")
    }
    
    setSyncing(false)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const localUser = JSON.parse(localStorage.getItem("user") || "{}")
    if (!localUser.email) return
    setUser(localUser)

    const updateStats = () => {
      setCounts(getCounts(localUser.email))
    }

    updateStats()
    const unsub = subscribe(updateStats)
    return () => unsub()
  }, [])

  const copyPublicKey = () => {
    if (!user?.publicKey) return
    copyToClipboard(user.publicKey)
    setCopiedPublic(true)
    setTimeout(() => setCopiedPublic(false), 2000)
  }

  const copyPrivateKey = () => {
    if (!user?.privateKey) return
    copyToClipboard(user.privateKey)
    setCopiedPrivate(true)
    setTimeout(() => setCopiedPrivate(false), 2000)
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
    const body = key
      .replace("-----BEGIN PGP PUBLIC KEY BLOCK-----", "")
      .replace("-----END PGP PUBLIC KEY BLOCK-----", "")
      .replace(/\s/g, "")
    return `-----BEGIN PGP PUBLIC KEY----- ··· ${body.slice(0, 8)}...`
  }

  const generateFingerprint = (key: string) => {
    if (!key) return ""
    const clean = key.replace(/\s/g, "").slice(0, 40).toUpperCase()
    return clean.match(/.{1,4}/g)?.join(" ") || ""
  }

  if (!user) return <div className="empty-state">Loading profile...</div>

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      
      {/* Profile Header */}
      <div className="inbox-header-row" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="inbox-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <User size={24} color="var(--gold-mid)" /> Profile Details
        </h2>
        <button 
          onClick={() => router.push('/dashboard/inbox')}
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-gold)", borderRadius: "8px", 
            padding: "8px 16px", color: "var(--text-bright)", cursor: "pointer", fontSize: "13px", 
            fontFamily: "Raleway, sans-serif", display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          <X size={16} /> Close
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
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
        <p style={{ color: "var(--gold-mid)", fontSize: "14px", fontFamily: "Courier New, monospace" }}>
          {user.email}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", marginTop: "12px" }}>
          <span style={{
            display: "inline-block", fontSize: "11px", padding: "3px 10px", borderRadius: "20px",
            background: "rgba(76,175,110,0.1)", color: "#4caf6e",
            border: "1px solid rgba(76,175,110,0.25)",
          }}> ● Active Secure Account</span>
          {user.did && (
            <span style={{
              fontSize: "10px", color: "var(--text-muted)",
              fontFamily: "Courier New, monospace",
              padding: "4px 12px", background: "rgba(212, 175, 55,0.06)",
              borderRadius: "20px", border: "1px solid var(--border-gold)"
            }}>
              ID: {user.did}
            </span>
          )}
        </div>

        <button 
          onClick={syncIdentity} 
          disabled={syncing}
          style={{ 
            marginTop: "16px",
            fontSize: "12px", padding: "8px 20px", borderRadius: "20px", 
            cursor: syncing ? "not-allowed" : "pointer",
            fontFamily: "Raleway, sans-serif", fontWeight: "700",
            border: "1px solid var(--border-gold)",
            transition: "all 0.2s ease",
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: 
              syncStatus === "success" ? "rgba(76,175,110,0.2)" : 
              syncStatus === "error" ? "rgba(217,48,37,0.2)" : 
              syncing ? "rgba(212, 175, 55,0.1)" : "rgba(212, 175, 55,0.05)",
            color: 
              syncStatus === "success" ? "#4caf6e" : 
              syncStatus === "error" ? "#e84234" : "var(--gold-mid)"
          }}
        >
          {syncing ? <><RefreshCw size={14} className="spin" /> Syncing...</> : 
           syncStatus === "success" ? <><CheckCircle2 size={14} /> Identity Synced!</> : 
           syncStatus === "error" ? <><XCircle size={14} /> Sync Failed</> : 
           <><RefreshCw size={14} /> Sync Identity with Network</>}
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px", marginBottom: "28px",
      }}>
        {[
          { icon: <Inbox size={22} color="var(--gold-mid)" />, label: "Inbox",   count: counts.inbox   || 0 },
          { icon: <Send size={22} color="var(--gold-mid)" />, label: "Sent",    count: counts.sent    || 0 },
          { icon: <Star size={22} color="var(--gold-mid)" />, label: "Starred", count: counts.starred || 0 },
          { icon: <AlertOctagon size={22} color="var(--gold-mid)" />, label: "Spam",    count: counts.spam    || 0 },
          { icon: <Trash2 size={22} color="var(--gold-mid)" />, label: "Trash",   count: counts.trash   || 0 },
        ].map(({ icon, label, count }) => (
          <div key={label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border-gold)",
            borderRadius: "12px", padding: "16px", textAlign: "center",
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>{icon}</div>
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
          display: "flex", alignItems: "center", gap: "6px"
        }}>
          <Key size={14} /> Public Key (Identity)
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>
          Your public ID used by the system to fetch encryption standards for your email address.
        </p>

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
            background: "none", border: "1px solid var(--gold-mid)",
            borderRadius: "6px", padding: "3px 10px", cursor: "pointer",
            color: "var(--gold-mid)", fontSize: "11px",
            fontFamily: "Raleway, sans-serif",
          }}>View</button>
        </div>

        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
          Fingerprint: <span style={{ fontFamily: "Courier New, monospace" }}>
            {generateFingerprint(user.publicKey)}
          </span>
        </p>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={copyPublicKey} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {copiedPublic ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Key</>}
          </button>
          <button onClick={() => {
            if (user.did) {
              copyToClipboard(user.did)
              setCopiedPublic(true)
              setTimeout(() => setCopiedPublic(false), 2000)
            }
          }} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Copy size={14} /> Copy DID
          </button>
          <button onClick={downloadPublicKey} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Download size={14} /> Download .asc
          </button>
        </div>
      </div>

      {/* Private Key — never shown */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid rgba(217,48,37,0.25)",
        borderRadius: "12px", padding: "20px", marginBottom: "16px",
      }}>
        <p style={{
          color: "var(--text-muted)", fontSize: "11px", marginBottom: "6px",
          textTransform: "uppercase", letterSpacing: "1px",
          display: "flex", alignItems: "center", gap: "6px"
        }}>
          <Lock size={14} /> Private Key (Master Decryption)
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>
          This key is linked to your password. Never share it; it is used to unlock your messages.
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
          <button onClick={() => setShowFullPrivateKey(true)} style={{
            background: "rgba(217,48,37,0.12)", border: "1px solid rgba(217,48,37,0.25)",
            borderRadius: "6px", padding: "3px 10px", cursor: "pointer",
            color: "#e84234", fontSize: "11px",
            fontFamily: "Raleway, sans-serif",
          }}>View Secret</button>
        </div>
      </div>

      {/* Encryption Info */}
      <div style={{
        background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
        borderRadius: "12px", padding: "16px", fontSize: "13px",
        color: "var(--text-muted)", lineHeight: "1.6",
      }}>
        <p style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Shield size={16} /> <strong style={{ color: "var(--text-bright)" }}>PGP End-to-End Encrypted</strong>
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
            <div style={{ marginBottom: "8px", color: "var(--gold-mid)", display: "flex", justifyContent: "center" }}><Key size={32} /></div>
            <h3 style={{ textAlign: "center", marginBottom: "16px" }}>Your PGP Public Key</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", textAlign: "center" }}>
              Safe to share — used by others to encrypt messages to you.
            </p>
            <textarea readOnly value={user.publicKey} style={{
              width: "100%", height: "200px",
              background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
              borderRadius: "8px", padding: "12px",
              fontFamily: "Courier New, monospace", fontSize: "10px",
              color: "var(--gold-light)", resize: "none",
              lineHeight: "1.5", boxSizing: "border-box",
            }} />
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="btn-secondary" onClick={() => setShowFullPublicKey(false)}>
                Close
              </button>
              <button className="btn" onClick={() => { copyPublicKey(); setShowFullPublicKey(false) }} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {copiedPublic ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Key</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Private Key Modal */}
      {showFullPrivateKey && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "520px", width: "90%", border: "1px solid rgba(217,48,37,0.4)" }}>
            <div style={{ marginBottom: "8px", color: "#e84234", display: "flex", justifyContent: "center" }}><Lock size={32} /></div>
            <h3 style={{ color: "#e84234", textAlign: "center", marginBottom: "16px" }}>Your PGP Private Key</h3>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px", background: "rgba(217,48,37,0.1)", padding: "10px", borderRadius: "8px", textAlign: "center" }}>
              <strong>DANGER:</strong> Never share this key with anyone. It grants full access to decrypt all your private messages.
            </p>
            <textarea readOnly value={user.privateKey || user.privateKeyArmored || "Private key not found locally"} style={{
              width: "100%", height: "200px",
              background: "var(--bg-panel)", border: "1px solid rgba(217,48,37,0.3)",
              borderRadius: "8px", padding: "12px",
              fontFamily: "Courier New, monospace", fontSize: "10px",
              color: "#e84234", resize: "none",
              lineHeight: "1.5", boxSizing: "border-box",
            }} />
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="btn-secondary" onClick={() => setShowFullPrivateKey(false)}>
                Close
              </button>
              <button onClick={() => { copyPrivateKey(); setShowFullPrivateKey(false) }} style={{
                background: "rgba(217,48,37,0.15)", border: "1px solid rgba(217,48,37,0.4)",
                padding: "10px 20px", borderRadius: "8px", cursor: "pointer",
                color: "#e84234", fontFamily: "Raleway, sans-serif", fontWeight: "700",
                display: "flex", alignItems: "center", gap: "6px"
              }}>
                {copiedPrivate ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Private Key</>}
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>
    </div>
  )
}
