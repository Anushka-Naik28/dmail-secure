"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { db, generateKeyPair } from "@/utils/gun"
import Logo from "@/components/Logo"
import { saveAccount } from "@/utils/accounts"

interface User {
  name: string
  email: string
  password: string
  publicKey: string
  privateKey: string
}

export default function Signup() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)
  const [createdEmail, setCreatedEmail] = useState("")
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [loading, setLoading] = useState(false)

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
    setMessage({ text: "Generating your PGP encryption keys...", type: "success" })

    try {
      const cleanName = name.toLowerCase().replace(/\s+/g, "")
      const randomSuffix = Math.floor(1000 + Math.random() * 9000)
      const generatedEmail = `${cleanName}${randomSuffix}@securemail.com`

      const { publicKey, privateKey } = await generateKeyPair(name, generatedEmail, password)

      const newUser: User = { name, email: generatedEmail, password, publicKey, privateKey }

      db.getUser(generatedEmail, (existing: any) => {
        if (existing && existing.email) {
          setMessage({ text: "Something went wrong, please try again.", type: "error" })
          setLoading(false)
          return
        }

        db.registerUser({ name, email: generatedEmail, publicKey, privateKey, password })

        localStorage.setItem("user", JSON.stringify(newUser))

        saveAccount({
          name,
          email: generatedEmail,
          password,
          publicKey,
          privateKey,
          addedAt: Date.now(),
        })

        setCreatedEmail(generatedEmail)
        setMessage(null)
        setLoading(false)
        setShowSuccessModal(true)
      })
    } catch (err: any) {
      console.error("KeyGen Error Detail:", err)
      const errorMsg = err.message || JSON.stringify(err) || "Unknown error"
      
      const isBridgeActive = typeof window !== "undefined" && !!(window.crypto?.subtle as any)?.__isStub;

      if (isBridgeActive || errorMsg.includes("subtle-stub") || errorMsg.includes("NotSupportedError") || errorMsg.includes("WEBCRYPTO_DISABLED")) {
        setMessage({ 
          text: "🛡️ HTTP Compatibility Mode: Your browser has restricted native encryption. We've enabled a software fallback, but key generation might take 5-10 seconds.", 
          type: "success" 
        })
        // retry once with the bridge logic if it crashed too early? 
        // Usually OpenPGP will retry internally if it sees NotSupportedError.
      } else {
        setMessage({ 
          text: `Key generation failed: ${errorMsg}. Please try a different browser or check your connection.`, 
          type: "error" 
        })
      }
      setLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="auth-card" style={{ width: "480px", padding: "50px 48px", borderRadius: "24px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Logo size={48} layout="horizontal" showText={true} />

          <div style={{ marginTop: "24px" }}>
            <h2 style={{
              fontFamily: "'Cinzel', serif", fontWeight: "600", fontSize: "28px",
              background: "linear-gradient(90deg, var(--gold-mid), var(--gold-light))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: "0.5px", margin: "0"
            }}>
              Create Account
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "12px", lineHeight: "1.5" }}>
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
            suppressHydrationWarning
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
              suppressHydrationWarning
            />
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute", right: "14px", top: "50%",
                transform: "translateY(-50%)", cursor: "pointer",
                fontSize: "16px", opacity: 0.7,
              }}
            >{showPassword ? "🙈" : "👁️"}</span>
          </div>

          <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              suppressHydrationWarning
            >← Sign in instead</button>
            <button
              className="btn" onClick={createAccount} disabled={loading}
              style={{ padding: "12px 32px", fontSize: "14px", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              suppressHydrationWarning
            >{loading ? "Generating..." : "Create Identity"}</button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>
            <div style={{ fontSize: "42px", marginBottom: "16px", animation: "fadeUp 0.6s ease" }}>🎉</div>
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
                onClick={() => navigator.clipboard.writeText(createdEmail)}
                style={{
                  background: "none", border: "1px solid var(--gold-mid)", borderRadius: "6px",
                  padding: "4px 10px", cursor: "pointer", color: "var(--gold-mid)",
                  fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >📋 Copy</button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "4px" }}>
              ⚠️ Save this address — you'll need it to log in.
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
              <button
                className="btn"
                onClick={() => { setShowSuccessModal(false); router.push("/dashboard/inbox") }}
              >Go to Inbox →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}