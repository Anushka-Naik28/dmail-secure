
"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { db, gun, derivePGPPassphrase, decryptVaultKey, validatePGPHeader, getOpenPGP } from "@/utils/gun"
import CryptoJS from "crypto-js"
import Logo from "@/components/Logo"
import { Eye, EyeOff, Key, Shield, User, ArrowLeft, ArrowRight } from "lucide-react"
import {
  saveAccount,
  getSavedAccounts,
  switchAccount,
  getAvatarColor,
  type SavedAccount,
} from "@/utils/accounts"
import { loginWithPasskey } from "@/utils/webauthn"

function LoginForm() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const searchParams = useSearchParams()

  useEffect(() => {
    const emailParam = searchParams?.get("email")
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])
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
    const accounts = getSavedAccounts()
    setSavedAccounts(accounts)
    let user: any = {}
    try {
      const rawUser = localStorage.getItem("user")
      if (rawUser) {
        user = JSON.parse(rawUser)
      }
    } catch (e) {
      console.warn("Corrupted user localStorage found, resetting...")
      if (typeof window !== "undefined") {
        localStorage.removeItem("user")
      }
    }
    setCurrentEmail(user?.email || "")
  }, [])

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

  const handlePasskeyLogin = async () => {
    if (!email) {
      setLoginMessage({ text: "Please enter your email to use Passkey.", type: "error" })
      return
    }
    setLoading(true)
    setLoginMessage({ text: "Authenticating with Passkey...", type: "success" })

    try {
      const userData = await loginWithPasskey(email)
      if (userData) {
        // Success! Passkey verified.
        // If we have the password in mesh, we use it. 
        // If not, we might need it for PGP decryption unless we have a passkey-encrypted vault key.
        const userObj = {
          ...userData,
          addedAt: Date.now()
        }
        localStorage.setItem("user", JSON.stringify(userObj))
        saveAccount(userObj)
        
        setLoginMessage({ text: "Passkey Verified! Accessing Inbox...", type: "success" })
        setLoading(false)
        setTimeout(() => { window.location.href = "/dashboard/inbox" }, 1000)
      }
    } catch (err: any) {
      console.error("Passkey Login Error:", err)
      setLoginMessage({ text: err.message || "Passkey authentication failed.", type: "error" })
      setLoading(false)
    }
  }

  const login = async () => {
    if (!email || !password) {
      setLoginMessage({ text: "Please enter your email and password.", type: "error" })
      return
    }
    setLoading(true)
    setLoginMessage({ text: "Calculating cryptographic identity...", type: "success" })

    try {
      const cleanEmail = email.trim().toLowerCase()
      const pPass = derivePGPPassphrase(password)

      // ─── PRIORITY 1: Check for locally saved keys on this device ───
      setLoginMessage({ text: "Checking local identity vault...", type: "success" })
      const savedAccounts = getSavedAccounts()
      const localAccount = savedAccounts.find(a => a.email?.toLowerCase() === cleanEmail)

      let userObj: any = {
        name: email.split("@")[0],
        email: cleanEmail,
        password: password,
        isDeterministic: true,
        addedAt: Date.now(),
      }

      let localKeyValid = false
      if (localAccount && localAccount.privateKey && localAccount.publicKey) {
        setLoginMessage({ text: "Validating passphrase against local identity...", type: "success" })
        
        try {
          const openpgp = await getOpenPGP()
          const decryptedArmored = decryptVaultKey(localAccount.privateKey, password)
          if (validatePGPHeader(decryptedArmored)) {
            const passphraseCandidates = [pPass, password]
            let decryptedLocal = false
            for (const passCandidate of passphraseCandidates) {
              try {
                await openpgp.decryptKey({
                  privateKey: await openpgp.readPrivateKey({ armoredKey: decryptedArmored }),
                  passphrase: passCandidate,
                })
                decryptedLocal = true
                break
              } catch (e) {
                // Try next candidate
              }
            }
            if (decryptedLocal) {
              localKeyValid = true
              userObj.publicKey = localAccount.publicKey
              userObj.privateKey = localAccount.privateKey
              userObj.fastPublicKey = localAccount.fastPublicKey || ""
              userObj.fastPrivateKey = localAccount.fastPrivateKey || ""
              if (localAccount.name) userObj.name = localAccount.name
            }
          }
        } catch {
          // Fallback to mesh if local fails (maybe password changed elsewhere)
        }
      }

      let meshKeyValid = false
      if (!localKeyValid) {
        // ─── PRIORITY 2: Check the mesh for an existing identity ───
        setLoginMessage({ text: "Searching global mesh for existing identity...", type: "success" })
        
        // Use a more aggressive lookup for the password node specifically
        let cloudData = await new Promise<any>(res => {
          const timeout = setTimeout(() => res(null), 12000)
          db.getUser(email, (data) => {
            if (data && data.publicKey) {
              clearTimeout(timeout)
              res(data)
            }
          }, true)
        })

        if (cloudData && (cloudData.publicKey || cloudData.vaultCID)) {
          setLoginMessage({ text: "Identity found on mesh. Verifying passphrase...", type: "success" })
          
          if (cloudData.vaultCID) {
            try {
              const { fetchVault } = await import("@/utils/ipfs")
              const encryptedVault = await fetchVault(cloudData.vaultCID)
              const CryptoJS = await import("crypto-js")
              const bytes = CryptoJS.AES.decrypt(encryptedVault, password)
              const decryptedVault = JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
              
              if (decryptedVault && decryptedVault.privateKey) {
                cloudData = { ...cloudData, ...decryptedVault }
                meshKeyValid = true
              }
            } catch (e) {
              console.warn("⚠️ Cloud Vault recovery failed.")
            }
          }

          if (!meshKeyValid && cloudData.privateKey) {
            try {
              const openpgp = await getOpenPGP()
              const decryptedArmored = decryptVaultKey(cloudData.privateKey, password)
              if (validatePGPHeader(decryptedArmored)) {
                const passphraseCandidates = [pPass, password]
                let decryptedMesh = false
                for (const passCandidate of passphraseCandidates) {
                  try {
                    await openpgp.decryptKey({
                      privateKey: await openpgp.readPrivateKey({ armoredKey: decryptedArmored }),
                      passphrase: passCandidate,
                    })
                    decryptedMesh = true
                    break
                  } catch (e) {
                    // Try next candidate
                  }
                }
                if (decryptedMesh) {
                  meshKeyValid = true
                }
              }
            } catch (decryptErr) {
               // If decrypt fails but password matches stored (legacy/migration)
               if (cloudData.password === password) meshKeyValid = true
            }
          }

          if (meshKeyValid) {
            userObj.publicKey = cloudData.publicKey
            userObj.privateKey = cloudData.privateKey
            userObj.fastPublicKey = cloudData.fastPublicKey || ""
            userObj.fastPrivateKey = cloudData.fastPrivateKey || ""
            if (cloudData.name) userObj.name = cloudData.name
          }
        }
      }

      if (!localKeyValid && !meshKeyValid) {
        setLoginMessage({ text: "Searching mesh failed. Attempting Sovereign Recovery...", type: "success" })
        
        try {
          const { generateSovereignIdentity } = await import("@/utils/identity")
          const identity = await generateSovereignIdentity(email, password)
          
          if (identity && identity.publicKey) {
            userObj.publicKey = identity.publicKey
            userObj.privateKey = identity.privateKey
            userObj.fastPublicKey = identity.fastPublicKey || ""
            userObj.fastPrivateKey = identity.fastPrivateKey || ""
            if (identity.name) userObj.name = identity.name
            meshKeyValid = true
          }
        } catch (recoveryErr) {
          console.error("Sovereign Fallback Failed:", recoveryErr)
          setLoginMessage({ text: "Identity not found and recovery failed. Check your password.", type: "error" })
          setLoading(false)
          return
        }
      }

      // 📡 [Restore Session] Ensure keys are announced and saved locally
      localStorage.setItem("user", JSON.stringify(userObj))
      saveAccount(userObj)

      // 📡 Initialise Nostr Mesh
      const { nostr } = await import("@/utils/nostr")
      await nostr.initUserKeys(userObj.email, userObj.password)
      nostr.announce({
        email: userObj.email,
        publicKey: userObj.publicKey,
        did: userObj.did || "",
        timestamp: Date.now(),
      })

      setLoginMessage({ text: "Identity Verified. Accessing Inbox...", type: "success" })
      setLoading(false)
      setTimeout(() => { window.location.href = "/dashboard/inbox" }, 1000)
    } catch (err: any) {
      console.error("Login Error:", err)
      setLoginMessage({ text: "Authentication failed. Please check your network connection.", type: "error" })
      setLoading(false)
    }
  }

  const restoreIdentity = async () => {
    if (!email || !password) {
      setLoginMessage({ text: "Enter email and password to restore identity.", type: "error" })
      return
    }
    setLoading(true)
    setLoginMessage({ text: "Sovereign Restoration: Re-calculating keys...", type: "success" })

    try {
      const { generateSovereignIdentity } = await import("@/utils/identity")
      const identity = await generateSovereignIdentity(email, password)
      
      const userObj = {
        name: email.split("@")[0],
        email: email.trim().toLowerCase(),
        password: password,
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        fastPublicKey: identity.fastPublicKey,
        fastPrivateKey: identity.fastPrivateKey,
        did: identity.did,
        isDeterministic: true,
        addedAt: Date.now()
      }

      localStorage.setItem("user", JSON.stringify(userObj))
      saveAccount(userObj)
      
      setLoginMessage({ text: "Identity Restored! Connecting to mesh...", type: "success" })
      setLoading(false)
      setTimeout(() => { window.location.href = "/dashboard/inbox" }, 1000)
    } catch (err) {
      setLoginMessage({ text: "Restoration failed. Verify credentials.", type: "error" })
      setLoading(false)
    }
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
    }, true)
  }

  return (
    <div className="page-center">
      <div className="auth-card">

        {/* Updated Header with EtherX DMail Logo */}
        <div className="auth-header">
          <Logo size={48} layout="horizontal" showText={true} />
          <div className="auth-header-content">
            <h2 className="auth-title">Sign In</h2>
            <p className="auth-subtitle">Enter your decentralized identity credentials</p>
          </div>
        </div>

        {/* ── Saved Accounts Panel ── */}
        {savedAccounts.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
              Saved Accounts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {savedAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => handleQuickSwitch(acc)}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    padding: "12px 16px", borderRadius: "14px",
                    background: acc.email === currentEmail ? "rgba(212, 175, 55, 0.08)" : "var(--bg-card)",
                    border: acc.email === currentEmail ? "1px solid rgba(212, 175, 55, 0.35)" : "1px solid var(--border-color)",
                    cursor: "pointer", transition: "all 0.2s ease", textAlign: "left", width: "100%"
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "rgba(212, 175, 55, 0.1)"; e.currentTarget.style.borderColor = "rgba(212, 175, 55, 0.4)" }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = acc.email === currentEmail ? "rgba(212, 175, 55, 0.08)" : "var(--bg-card)"
                    e.currentTarget.style.borderColor = acc.email === currentEmail ? "rgba(212, 175, 55, 0.35)" : "var(--border-color)"
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                    background: getAvatarColor(acc.email),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "16px", fontWeight: "800", color: "var(--bg-body)"
                  }}>
                    {(acc.name || acc.email).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {acc.name || acc.email.split("@")[0]}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {acc.email}
                    </div>
                  </div>
                  {/* Active badge or arrow */}
                  {acc.email === currentEmail ? (
                    <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "20px", background: "rgba(212, 175, 55, 0.15)", color: "var(--gold-mid)", fontWeight: "800", letterSpacing: "0.5px", flexShrink: 0 }}>ACTIVE</span>
                  ) : (
                    <ArrowRight size={16} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0 0" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600", letterSpacing: "0.5px" }}>OR SIGN IN WITH DIFFERENT ACCOUNT</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
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
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </span>
          </div>

          <div style={{ textAlign: "right", marginTop: "6px" }}>
            <button
              onClick={() => { setResetEmail(""); setNewPassword(""); setStrength(""); setResetMessage(null); setShowForgotModal(true) }}
              style={{ background: "none", border: "none", color: "var(--gold-mid)", cursor: "pointer", fontSize: "13px", fontFamily: "Raleway, sans-serif" }}
            >Forgot Password?</button>
          </div>

          <div className="auth-button-row" style={{ marginTop: "24px", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <button
                onClick={() => router.push("/signup")}
                style={{ background: "none", border: "none", color: "var(--text-dim)", fontWeight: "500", cursor: "pointer", fontSize: "13px" }}
              >Create account</button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={restoreIdentity} disabled={loading}
                  style={{ 
                    background: "rgba(212, 175, 55, 0.1)", color: "var(--gold-mid)", border: "1px solid rgba(212, 175, 55, 0.2)",
                    borderRadius: "8px", padding: "10px 16px", fontSize: "13px", fontWeight: "600", cursor: "pointer",
                    opacity: loading ? 0.6 : 1
                  }}
                >Restore</button>
                <button
                  className="btn" onClick={login} disabled={loading}
                  style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
                >{loading ? "Signing in..." : "Sign In"}</button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgotModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ color: "var(--gold-mid)", marginBottom: "16px", display: "flex", justifyContent: "center" }}>
              <Key size={40} />
            </div>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "22px", color: "var(--gold-mid)", marginBottom: "12px" }}>Reset Password</h3>
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
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
              >
                {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </span>
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
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
