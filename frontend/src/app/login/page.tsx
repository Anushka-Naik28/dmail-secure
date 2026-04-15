
"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { db, gun } from "@/utils/gun"
import Logo from "@/components/Logo"
import {
  saveAccount,
  getSavedAccounts,
  switchAccount,
  getAvatarColor,
  type SavedAccount,
} from "@/utils/accounts"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAddAccount = searchParams.get("addAccount") === "true"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [loginMessage, setLoginMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)
  const [resetMessage, setResetMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  const [showForgotModal, setShowForgotModal] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [strength, setStrength] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [currentEmail, setCurrentEmail] = useState("")

  useEffect(() => {
    if (isAddAccount) {
      const accounts = getSavedAccounts()
      setSavedAccounts(accounts)
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      setCurrentEmail(user.email || "")
    }
  }, [isAddAccount])

  const checkStrength = (pwd: string) => {
    let score = 0
    if (pwd.length >= 8) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[a-z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[@$!%*?&]/.test(pwd)) score++
    if (score <= 2) setStrength("Weak")
    else if (score <= 4) setStrength("Medium")
    else setStrength("Strong")
  }

  const handleQuickSwitch = (account: SavedAccount) => {
    switchAccount(account)
    window.location.href = "/dashboard/inbox"
  }

  const login = () => {
    if (!email || !password) {
      setLoginMessage({ text: "Please enter your email and password.", type: "error" })
      return
    }
    setLoading(true)
    setLoginMessage({ text: "Connecting to secure network...", type: "success" })

    db.getUser(email, (userData: any) => {
      if (!userData || !userData.email) {
        setLoginMessage({ text: "Account not found. Please check your email.", type: "error" })
        setLoading(false)
        return
      }
      if (userData.password !== password) {
        setLoginMessage({ text: "Incorrect password. Please try again.", type: "error" })
        setLoading(false)
        return
      }

      const userObj = {
        name: userData.name,
        email: userData.email,
        password: userData.password,
        publicKey: userData.publicKey,
        privateKey: userData.privateKey || "",
        addedAt: Date.now(),
      }

      localStorage.setItem("user", JSON.stringify(userObj))
      saveAccount(userObj)

      setLoginMessage({ text: `Welcome back, ${userData.name}!`, type: "success" })
      setLoading(false)
      setTimeout(() => router.push("/dashboard/inbox"), 1200)
    })
  }

  const resetPassword = () => {
    if (!resetEmail || !newPassword) {
      setResetMessage({ text: "Please fill in all fields.", type: "error" })
      return
    }
    setResetLoading(true)
    setResetMessage({ text: "Looking up your account...", type: "success" })

    db.getUser(resetEmail, (userData: any) => {
      if (!userData || !userData.email) {
        setResetMessage({ text: "Email not found. Please check your DMail address.", type: "error" })
        setResetLoading(false)
        return
      }

      // gun is now imported from @/utils/gun
      gun.get("securemail_users").get(resetEmail).put({ password: newPassword })
      saveAccount({ ...userData, password: newPassword, addedAt: Date.now() })

      setResetMessage({ text: "Password updated successfully. Please login.", type: "success" })
      setResetLoading(false)
      setTimeout(() => {
        setShowForgotModal(false)
        setResetEmail("")
        setNewPassword("")
        setStrength("")
        setResetMessage(null)
      }, 1500)
    })
  }

  return (
    <div className="page-center">
      <div className="auth-card">

        {/* Updated Header with ETHREX DMail Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Logo size={48} layout="horizontal" showText={true} />
          <div style={{ marginTop: "24px" }}>
            <h2 style={{ fontWeight: "600", fontSize: "24px", color: "var(--text-bright)" }}>
              {isAddAccount ? "Add another account" : "Sign In"}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px" }}>
              {isAddAccount
                ? "Sign in to add a second DMail account"
                : "Enter your decentralized identity credentials"}
            </p>
          </div>
        </div>

        {/* ── Saved accounts — ONLY shown in add-account mode ── */}
        {isAddAccount && savedAccounts.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{
              fontSize: "11px", fontWeight: "700", color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px",
            }}>
              Existing accounts
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {savedAccounts.map((account) => {
                const isActive = account.email === currentEmail
                return (
                  <div
                    key={account.email}
                    onClick={() => !isActive && handleQuickSwitch(account)}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "10px 12px", borderRadius: "10px",
                      cursor: isActive ? "default" : "pointer",
                      border: `1px solid ${isActive ? "var(--gold-mid)" : "var(--border-gold)"}`,
                      background: isActive ? "rgba(212,160,23,0.06)" : "none",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(212,160,23,0.04)"
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "none"
                    }}
                  >
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                      background: getAvatarColor(account.email),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "14px", fontWeight: "800", color: "#fff",
                    }}>
                      {(account.name || account.email).charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{
                        fontSize: "13px", fontWeight: "700",
                        color: isActive ? "var(--gold-mid)" : "var(--text-bright)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {account.name || account.email.split("@")[0]}
                      </div>
                      <div style={{
                        fontSize: "11px", color: "var(--text-muted)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {account.email}
                      </div>
                    </div>

                    {isActive ? (
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "8px",
                        background: "rgba(212,160,23,0.15)", color: "var(--gold-mid)",
                        border: "1px solid rgba(212,160,23,0.3)", flexShrink: 0,
                      }}>Active</span>
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>→</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "16px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border-gold)" }} />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>or sign in with another account</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border-gold)" }} />
            </div>
          </div>
        )}

        {/* Login message */}
        {loginMessage && (
          <div style={{
            padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
            fontSize: "14px", fontWeight: "500", textAlign: "center",
            background: loginMessage.type === "success" ? "rgba(76,175,110,0.12)" : "rgba(217,48,37,0.12)",
            color: loginMessage.type === "success" ? "#4caf6e" : "#e84234",
            border: `1px solid ${loginMessage.type === "success" ? "rgba(76,175,110,0.25)" : "rgba(217,48,37,0.25)"}`,
          }}>
            {loading && loginMessage.type === "success" && (
              <span style={{
                display: "inline-block", width: "12px", height: "12px",
                border: "2px solid rgba(76,175,110,0.3)", borderTop: "2px solid #4caf6e",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                marginRight: "8px", verticalAlign: "middle",
              }} />
            )}
            {loginMessage.text}
          </div>
        )}

        {/* Loading bar */}
        {loading && (
          <div style={{ height: "2px", borderRadius: "2px", background: "var(--border-color)", marginBottom: "16px", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: "40%",
              background: "linear-gradient(90deg, var(--gold-rich), var(--gold-light))",
              borderRadius: "2px", animation: "shimmer 1s linear infinite",
              backgroundSize: "200% auto",
            }} />
          </div>
        )}

        {/* Form */}
        <div className="auth-form">
          <input
            type="email" className="auth-input"
            placeholder="Email (e.g. name1234@dmail.com)"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setLoginMessage(null) }}
            onKeyDown={(e) => e.key === "Enter" && login()}
            disabled={loading}
          />

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              className="auth-input" placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLoginMessage(null) }}
              onKeyDown={(e) => e.key === "Enter" && login()}
              disabled={loading}
              style={{ paddingRight: "40px" }}
            />
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: "14px" }}
            >{showPassword ? "🙈" : "👁️"}</span>
          </div>

          <div style={{ textAlign: "right", marginTop: "6px" }}>
            <button
              onClick={() => { setResetEmail(""); setNewPassword(""); setStrength(""); setResetMessage(null); setShowForgotModal(true) }}
              style={{ background: "none", border: "none", color: "var(--gold-mid)", cursor: "pointer", fontSize: "13px", fontFamily: "Raleway, sans-serif" }}
            >Forgot Password?</button>
          </div>

          <div style={{ marginTop: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => router.push("/signup")}
              style={{ background: "none", border: "none", color: "var(--gold-mid)", fontWeight: "500", cursor: "pointer", fontFamily: "Raleway, sans-serif" }}
            >Create account</button>
            <button
              className="btn" onClick={login} disabled={loading}
              style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >{loading ? "Signing in..." : "Next"}</button>
          </div>
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgotModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔑</div>
            <h3>Reset Password</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Enter your DMail email and choose a new password.
            </p>

            {resetMessage && (
              <div style={{
                padding: "8px 12px", marginBottom: "12px", borderRadius: "8px",
                fontSize: "13px", textAlign: "center",
                background: resetMessage.type === "success" ? "rgba(76,175,110,0.12)" : "rgba(217,48,37,0.12)",
                color: resetMessage.type === "success" ? "#4caf6e" : "#e84234",
                border: `1px solid ${resetMessage.type === "success" ? "rgba(76,175,110,0.25)" : "rgba(217,48,37,0.25)"}`,
              }}>
                {resetLoading && (
                  <span style={{ display: "inline-block", width: "10px", height: "10px", border: "2px solid rgba(76,175,110,0.3)", borderTop: "2px solid #4caf6e", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: "8px", verticalAlign: "middle" }} />
                )}
                {resetMessage.text}
              </div>
            )}

            <input className="auth-input" placeholder="Your registered DMail email"
              value={resetEmail}
              onChange={(e) => { setResetEmail(e.target.value); setResetMessage(null) }}
              disabled={resetLoading}
            />

            <div style={{ position: "relative" }}>
              <input
                type={showResetPassword ? "text" : "password"}
                className="auth-input" placeholder="New password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); checkStrength(e.target.value) }}
                disabled={resetLoading}
                style={{ paddingRight: "40px" }}
              />
              <span
                onClick={() => setShowResetPassword(!showResetPassword)}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}
              >{showResetPassword ? "🙈" : "👁️"}</span>
            </div>

            {newPassword && (
              <div style={{ fontSize: "12px", marginTop: "6px", color: strength === "Weak" ? "#e84234" : strength === "Medium" ? "var(--gold-mid)" : "#4caf6e" }}>
                Password Strength: <strong>{strength}</strong>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="btn-secondary" onClick={() => { setShowForgotModal(false); setResetMessage(null) }} disabled={resetLoading}>
                Cancel
              </button>
              <button className="btn" onClick={resetPassword} disabled={resetLoading} style={{ opacity: resetLoading ? 0.7 : 1, cursor: resetLoading ? "not-allowed" : "pointer" }}>
                {resetLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="page-center">
        <div style={{ color: "var(--gold-mid)", fontFamily: "Ralway, sans-serif" }}>
          Initializing Secure Connection...
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
