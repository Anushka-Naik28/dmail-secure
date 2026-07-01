"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Logo from "@/components/Logo"
import { Eye, EyeOff, Lock, Mail, CheckCircle, Shield, Clipboard, ShieldCheck, ShieldAlert, ArrowLeft, ArrowRight } from "lucide-react"

// DYNAMIC IMPORTS to prevent 500 Internal Server Errors during SSR
// We load heavy dependencies only when the user interacts or after hydration.

export default function Signup() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)
  const [createdEmail, setCreatedEmail] = useState("")
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const [mnemonic, setMnemonic] = useState("")

  const createAccount = async () => {
    if (!name || !password) {
      setMessage({ text: "Please enter your name and choose a password.", type: "error" })
      return
    }

    const nameRegex = /^[A-Za-z\s]+$/
    if (!nameRegex.test(name)) {
      setMessage({ text: "Name should contain only letters and spaces.", type: "error" })
      return
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
    if (!passwordRegex.test(password)) {
      setMessage({
        text: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        type: "error",
      })
      return
    }

    setLoading(true)
    setMessage({ text: "Checking availability in the decentralized mesh...", type: "success" })

    try {
      const { db } = await import("@/utils/gun")
      const cleanName = name.toLowerCase().replace(/\s+/g, "")
      
      // 🛡️ [Anti-Collision] Check if identifier is already taken
      const exists = await new Promise<boolean>((res) => {
        const timeout = setTimeout(() => res(false), 5000)
        // We'll generate a tentative email to check
        // Note: The actual email generation is randomized below, but we can check if the base name is heavily used or if specific patterns exist.
        // Actually, let's just generate the email FIRST then check.
        res(false) // Placeholder, real check below
      })

      const { saveAccount } = await import("@/utils/accounts")
      const { generateSovereignIdentity } = await import("@/utils/identity")

      const randomSuffix = Math.floor(1000 + Math.random() * 9000)
      const generatedEmail = `${cleanName}${randomSuffix}@dmail.com`

      // REAL CHECK
      const meshData = await new Promise<any>(res => {
        const timeout = setTimeout(() => res(null), 8000)
        db.getUser(generatedEmail, (data) => {
          clearTimeout(timeout)
          res(data)
        }, true)
      })

      if (meshData && meshData.publicKey) {
        setMessage({ text: "Identity collision detected. Please try again to generate a unique ID.", type: "error" })
        setLoading(false)
        return
      }

      setMessage({ text: "Stretching keys for maximum security...", type: "success" })

      // REVOLUTIONARY: Mathematical Key Generation
      const identity = await generateSovereignIdentity(generatedEmail, password)

      const userObj = {
        name,
        email: generatedEmail,
        password,
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        isDeterministic: true
      }

      db.registerUser(userObj)
      localStorage.setItem("user", JSON.stringify(userObj))

      // Announce on Nostr Mesh
      import("@/utils/nostr").then(({ nostr }) => {
        nostr.initUserKeys(generatedEmail, password).then(() => {
          nostr.announce({
            email: generatedEmail,
            publicKey: identity.publicKey,
            did: identity.did,
            timestamp: Date.now(),
          })
        })
      }).catch(() => {})

      saveAccount({ ...userObj, addedAt: Date.now() })

      setMnemonic(identity.mnemonic)
      setCreatedEmail(generatedEmail)
      setMessage(null)
      setLoading(false)
      setShowSuccessModal(true)
    } catch (err: any) {
      console.error("Signup Error:", err)
      setMessage({ 
        text: `Identity generation failed: ${err.message || "Unknown error"}.`, 
        type: "error" 
      })
      setLoading(false)
    }
  }

  if (!mounted) return null;

  return (
    <div className="page-center">
      <div className="auth-card">
        <div className="auth-header">
          <Logo size={48} layout="horizontal" showText={true} />
          <div className="auth-header-content">
            <h2 className="auth-title">Create Account</h2>
            <p className="auth-subtitle">
              Generate your decentralized PGP keys and secure your communication via the ETHREX network.
            </p>
          </div>
        </div>

        {message && (
          <div style={{
            padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
            fontSize: "14px", fontWeight: "500", textAlign: "center",
            background: message.type === "success" ? "rgba(76,175,110,0.12)" : "rgba(217,48,37,0.12)",
            color: message.type === "success" ? "#4caf6e" : "#e84234",
            border: `1px solid ${message.type === "success" ? "rgba(76,175,110,0.25)" : "rgba(217,48,37,0.25)"}`,
          }}>
            {loading && message.type === "success" && (
              <span style={{
                display: "inline-block", width: "12px", height: "12px",
                border: "2px solid rgba(76,175,110,0.3)", borderTop: "2px solid #4caf6e",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                marginRight: "8px", verticalAlign: "middle",
              }} />
            )}
            {message.text}
          </div>
        )}

        <div className="auth-form">
          <input
            className="auth-input"
            placeholder="Full Name (letters only)"
            value={name}
            onChange={(e) => { setName(e.target.value); setMessage(null) }}
            disabled={loading}
          />

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              className="auth-input"
              placeholder="Strong password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMessage(null) }}
              onKeyDown={(e) => e.key === "Enter" && createAccount()}
              disabled={loading}
              style={{ paddingRight: "40px" }}
            />
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </span>
          </div>

          <div className="auth-button-row">
            <button
              onClick={() => router.push("/login")}
              style={{
                background: "none", border: "none",
                color: "var(--text-muted)", fontWeight: "500",
                cursor: "pointer", fontFamily: "Raleway, sans-serif",
                transition: "color 0.2s ease"
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--gold-mid)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
            >Back to Sign In</button>
            <button
              className="btn" onClick={createAccount} disabled={loading}
              style={{ padding: "12px 32px", fontSize: "14px", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >{loading ? "Generating..." : "Create Identity"}</button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>
            <div style={{ color: "var(--gold-mid)", marginBottom: "16px" }}>
              <CheckCircle size={48} />
            </div>
            <h3 style={{
              fontFamily: "'Cinzel', serif", fontSize: "24px", color: "var(--gold-mid)",
              marginBottom: "12px", letterSpacing: "1px"
            }}>Identity Registered!</h3>
            <p style={{ marginBottom: "20px", color: "var(--text-bright)", fontSize: "15px" }}>
              Welcome to the network, <strong style={{ color: "var(--gold-mid)", fontSize: "16px" }}>{name}</strong>!
            </p>
            <p style={{ marginBottom: "12px", color: "var(--text-muted)", fontSize: "13px" }}>Your universal identifier is:</p>
            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--gold-mid)",
              borderRadius: "10px", padding: "14px 18px", marginBottom: "16px",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
            }}>
              <span style={{
                fontFamily: "Courier New, monospace", fontSize: "13px",
                color: "var(--gold-light)", fontWeight: "600", wordBreak: "break-all",
              }}>{createdEmail}</span>
              <button
                onClick={async () => {
                   const { copyToClipboard } = await import("@/utils/clipboard");
                   copyToClipboard(createdEmail);
                }}
                style={{
                  background: "none", border: "1px solid var(--gold-mid)", borderRadius: "6px",
                  padding: "4px 10px", cursor: "pointer", color: "var(--gold-mid)",
                  fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <Clipboard size={14} style={{ marginRight: "4px" }} /> Copy
              </button>
            </div>

            <div style={{ 
              background: "rgba(212, 175, 55, 0.05)", 
              border: "1px dashed var(--gold-mid)", 
              borderRadius: "10px", 
              padding: "16px",
              marginBottom: "20px"
            }}>
              <p style={{ fontSize: "11px", color: "var(--gold-mid)", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                <ShieldCheck size={14} /> Recovery Phrase (Secure Vault)
              </p>
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(3, 1fr)", 
                gap: "8px",
                textAlign: "left"
              }}>
                {mnemonic.split(" ").map((word, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "var(--text-bright)" }}>
                    <span style={{ color: "var(--text-dim)", marginRight: "4px" }}>{i+1}.</span>
                    {word}
                  </div>
                ))}
              </div>
              <button 
                onClick={async () => {
                  const { copyToClipboard } = await import("@/utils/clipboard");
                  copyToClipboard(mnemonic);
                }}
                style={{ 
                  marginTop: "12px", background: "none", border: "none", color: "var(--gold-mid)", 
                  fontSize: "11px", cursor: "pointer", textDecoration: "underline" 
                }}
              >Copy Recovery Phrase</button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
              <ShieldAlert size={14} color="#e84234" /> Write down your phrase. You can use it to recover your account on any device.
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
              <button
                className="btn"
                onClick={() => { setShowSuccessModal(false); router.push("/dashboard/inbox") }}
              >Go to Inbox <ArrowRight size={16} style={{ marginLeft: "8px" }} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
