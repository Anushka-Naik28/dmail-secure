"use client"

import { useEffect, useRef, useState } from "react"
import { generateKeyPair, checkGunServer } from "@/utils/gun"
import { 
  Settings, Lock, Link as LinkIcon, Tag, Globe, 
  Moon, Sun, CheckCircle, Edit2, PlusCircle, 
  Trash2, Key, Eye, EyeOff, Shield, 
  Download, Folder, FolderOpen, RefreshCw, 
  CheckCircle2, XCircle, AlertCircle, Sparkles,
  ArrowRight, Mail, Database, Palette, Layout, Wallet, Search
} from "lucide-react"
import BlockchainVerify from "@/components/BlockchainVerify"
import { getLabels, saveLabel, deleteLabel, createId, PRESET_COLORS, type Label } from "@/utils/labelStore"
import { copyToClipboard } from "@/utils/clipboard"
import { isPinataConfigured } from "@/utils/ipfs"


type Section = "general" | "security" | "blockchain" | "labels" | "network" | "storage"

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("general")

  // ── General ──
  const [theme, setTheme] = useState("dark")
  const [inboxLayout, setInboxLayout] = useState("comfortable")
  const [emailPreview, setEmailPreview] = useState("2lines")
  const [generalSaved, setGeneralSaved] = useState(false)

  // ── Security ──
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [showRegenModal, setShowRegenModal] = useState(false)
  const [regenPassword, setRegenPassword] = useState("")
  const [regenConfirm, setRegenConfirm] = useState("")
  const [regenError, setRegenError] = useState("")
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenSuccess, setRegenSuccess] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [user, setUser] = useState<any>({})
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeySuccess, setPasskeySuccess] = useState(false)

  // ── Labels ──
  const [labels, setLabels] = useState<Label[]>([])
  const [newLabelName, setNewLabelName] = useState("")
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0])
  const [newLabelEmoji, setNewLabelEmoji] = useState("")
  const [editingLabel, setEditingLabel] = useState<Label | null>(null)
  const labelSectionRef = useRef<HTMLDivElement>(null)

  // ── Network & Storage ──
  const [pinataStatus, setPinataStatus] = useState<"idle" | "testing" | "ok" | "fail">("testing")

  // Removed network and storage states
  const [importKeyText, setImportKeyText] = useState("")
  const [importKeyError, setImportKeyError] = useState("")
  const [importKeySuccess, setImportKeySuccess] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const u = JSON.parse(localStorage.getItem("user") || "{}")
    setUser(u)

    setTheme(localStorage.getItem("theme") || "dark")
    setInboxLayout(localStorage.getItem("settings_inboxLayout") || "comfortable")
    setEmailPreview(localStorage.getItem("settings_emailPreview") || "2lines")
    setLabels(getLabels(u.email || ""))
    // Check if the backend relay proxy has Pinata configured
    isPinataConfigured().then(isReady => {
      setPinataStatus(isReady ? "ok" : "fail")
    })

    if (window.location.hash === "#labels") {
      setActiveSection("labels")
      setTimeout(() => labelSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 300)
    }
    if (window.location.hash === "#network") {
      setActiveSection("network")
    }
    
    // Load passkeys from user object
    if (u.passkeys) setPasskeys(u.passkeys)
  }, [])

  // Removed checkStorage and handleConnectStorage

  // ── General ──────────────────────────────────────────────────
  const saveGeneralSettings = () => {
    localStorage.setItem("theme", theme)
    localStorage.setItem("settings_inboxLayout", inboxLayout)
    localStorage.setItem("settings_emailPreview", emailPreview)
    document.documentElement.setAttribute("data-theme", theme)
    window.dispatchEvent(new Event("storage"))
    setGeneralSaved(true)
    setTimeout(() => setGeneralSaved(false), 3000)
  }

  const handleThemeChange = (val: string) => {
    setTheme(val)
    document.documentElement.setAttribute("data-theme", val)
    localStorage.setItem("theme", val)
  }

  // ── Security ─────────────────────────────────────────────────
  const handleExportPrivateKey = () => {
    if (!user.privateKey) return
    const blob = new Blob([user.privateKey], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `securemail_private_key_${user.email}.asc`
    a.click()
    URL.revokeObjectURL(url)
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 3000)
  }

  const handleCopyPrivateKey = () => {
    if (!user.privateKey) return
    copyToClipboard(user.privateKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleRegenKeys = async () => {
    if (!regenPassword) { setRegenError("Enter your new password."); return }
    if (regenPassword !== regenConfirm) { setRegenError("Passwords do not match."); return }
    if (regenPassword.length < 8) { setRegenError("Password must be at least 8 characters."); return }
    if (regenPassword === user.password) { setRegenError("New password must be different."); return }

    setRegenLoading(true)
    setRegenError("")
    try {
      const { publicKey, privateKey } = await generateKeyPair(
        user.name || user.email, user.email, regenPassword
      )
      const updatedUser = { ...user, publicKey, privateKey, password: regenPassword }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)
      const { db } = await import("@/utils/gun")
      db.registerUser(updatedUser)
      setRegenSuccess(true)
      setShowRegenModal(false)
      setRegenPassword("")
      setRegenConfirm("")
      setTimeout(() => setRegenSuccess(false), 5000)
    } catch {
      setRegenError("Key generation failed. Please try again.")
    } finally {
      setRegenLoading(false)
    }
  }

  // ── Import private key from .asc text ────────────────────────
  const handleImportKey = () => {
    setImportKeyError("")
    setImportKeySuccess(false)
    if (!importKeyText.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) {
      setImportKeyError("Invalid key — must be a PGP private key block.")
      return
    }
    const updated = { ...user, privateKey: importKeyText.trim() }
    localStorage.setItem("user", JSON.stringify(updated))
    setUser(updated)
    setImportKeySuccess(true)
    setImportKeyText("")
    setTimeout(() => setImportKeySuccess(false), 3000)
  }

  // ── Passkeys (WebAuthn) ──────────────────────────────────────
  const handleRegisterPasskey = async () => {
    if (!window.PublicKeyCredential) {
      alert("Passkeys are not supported in this browser.")
      return
    }
    setPasskeyLoading(true)
    try {
      // In a real decentralized implementation, we generate a challenge
      const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge)
      const userId = new Uint8Array(16); window.crypto.getRandomValues(userId)
      
      const options: CredentialCreationOptions = {
        publicKey: {
          challenge,
          rp: { name: "SecureMail Decentralized", id: window.location.hostname },
          user: { id: userId, name: user.email, displayName: user.name || user.email },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          timeout: 60000,
          attestation: "none"
        }
      }
      
      const credential = await navigator.credentials.create(options) as any
      if (credential) {
        const newPasskey = {
          id: credential.id,
          name: `${navigator.platform} - ${new Date().toLocaleDateString()}`,
          addedAt: new Date().toISOString(),
          type: "WebAuthn / Passkey"
        }
        const updatedPasskeys = [...passkeys, newPasskey]
        const updatedUser = { ...user, passkeys: updatedPasskeys }
        localStorage.setItem("user", JSON.stringify(updatedUser))
        setUser(updatedUser)
        setPasskeys(updatedPasskeys)
        
        // Sync to mesh
        const { db } = await import("@/utils/gun")
        db.registerUser(updatedUser)
        
        setPasskeySuccess(true)
        setTimeout(() => setPasskeySuccess(false), 3000)
      }
    } catch (err) {
      console.error("Passkey registration failed:", err)
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleRemovePasskey = (id: string) => {
    const updated = passkeys.filter(p => p.id !== id)
    const updatedUser = { ...user, passkeys: updated }
    localStorage.setItem("user", JSON.stringify(updatedUser))
    setUser(updatedUser)
    setPasskeys(updated)
    import("@/utils/gun").then(({ db }) => db.registerUser(updatedUser))
  }

  // Removed handleCheckServer, handleSavePeer, handleResetPeer, handleCopyPeer
  // ── Shared styles ─────────────────────────────────────────────
  const sectionBtn = (s: Section) => ({
    width: "100%", textAlign: "left" as const,
    padding: "10px 16px", border: "none", cursor: "pointer",
    borderRadius: "8px", fontFamily: "Raleway, sans-serif",
    fontSize: "13px", fontWeight: activeSection === s ? "700" : "500",
    background: activeSection === s
      ? "linear-gradient(90deg, rgba(212, 175, 55,0.15), rgba(212, 175, 55,0.05))"
      : "none",
    borderLeft: activeSection === s ? "3px solid var(--gold-mid)" : "3px solid transparent",
    color: activeSection === s ? "var(--gold-mid)" : "var(--text-bright)",
    transition: "all 0.15s ease",
  })

  const card = {
    background: "var(--bg-card)", border: "1px solid var(--border-gold)",
    borderRadius: "14px", padding: "24px", marginBottom: "16px",
  }

  const labelStyle = {
    fontSize: "12px", fontWeight: "700" as const,
    color: "var(--text-muted)", textTransform: "uppercase" as const,
    letterSpacing: "0.8px", marginBottom: "10px", display: "block",
  }

  const selectStyle = {
    width: "100%", padding: "10px 14px",
    background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
    borderRadius: "8px", color: "var(--text-bright)",
    fontFamily: "Raleway, sans-serif", fontSize: "13px",
    cursor: "pointer", outline: "none",
  }

  const radioGroup = (
    options: { value: string; label: string; desc?: string }[],
    current: string,
    onChange: (v: string) => void
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {options.map((opt) => (
        <label key={opt.value} style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "10px 14px", borderRadius: "10px", cursor: "pointer",
          border: `1px solid ${current === opt.value ? "var(--gold-mid)" : "var(--border-gold)"}`,
          background: current === opt.value ? "rgba(212, 175, 55,0.06)" : "none",
          transition: "all 0.15s ease",
        }}>
          <input
            type="radio" value={opt.value}
            checked={current === opt.value}
            onChange={() => onChange(opt.value)}
            style={{ marginTop: "2px", accentColor: "var(--gold-mid)" }}
          />
          <div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-bright)" }}>
              {opt.label}
            </div>
            {opt.desc && (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                {opt.desc}
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  )

  // ── Helpers ──

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left nav ── */}
      <div style={{
        width: "200px", flexShrink: 0, padding: "20px 12px",
        borderRight: "1px solid var(--border-gold)", overflowY: "auto",
      }}>
        <div style={{
          fontSize: "9px", fontWeight: "800", color: "var(--text-muted)",
          letterSpacing: "1.5px", textTransform: "uppercase",
          padding: "0 4px", marginBottom: "8px",
        }}>Settings</div>

        {([
          { key: "general",    icon: <Settings size={14} />,  label: "General" },
          { key: "security",   icon: <Lock size={14} />,      label: "Security" },
          { key: "blockchain", icon: <LinkIcon size={14} />,  label: "Blockchain" },
          { key: "labels",     icon: <Tag size={14} />,       label: "Labels" },
          { key: "network",    icon: <Globe size={14} />,     label: "Network" },
        ] as { key: Section; icon: React.ReactNode; label: string }[]).map((s) => (
          <button key={s.key} style={sectionBtn(s.key)} onClick={() => setActiveSection(s.key)}>
            <span style={{ marginRight: "10px", display: "inline-flex", alignItems: "center" }}>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

        {/* ══ GENERAL ══════════════════════════════════════════ */}
        {activeSection === "general" && (
          <>
            <h2 className="mail-detail-subject" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Settings size={22} color="var(--gold-mid)" /> General Settings
            </h2>

            {generalSaved && (
              <div style={{
                position: "fixed", top: "24px", right: "24px", zIndex: 1000,
                background: "rgba(76,175,110,1)", borderRadius: "12px",
                padding: "12px 24px", fontSize: "14px", color: "#fff",
                fontWeight: "700", boxShadow: "var(--shadow-deep)",
                animation: "fadeUp 0.3s ease both",
              }}>                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle size={16} /> Settings applied successfully!
                </div></div>
            )}

            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Palette size={16} color="var(--gold-mid)" /> Theme
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Choose your preferred color scheme</div>
              </div>
              {radioGroup([
                { value: "dark", label: "Dark Mode", desc: "Easy on the eyes — recommended for night use" },
                { value: "light", label: "Light Mode", desc: "Clean and bright for daytime use" },
              ], theme, handleThemeChange)}
            </div>

            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Layout size={16} color="var(--gold-mid)" /> Inbox Layout
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Control how mail rows appear</div>
              </div>
              {radioGroup([
                { value: "comfortable", label: "Comfortable", desc: "More padding, easier to read" },
                { value: "compact", label: "Compact", desc: "Denser rows, see more mails at once" },
              ], inboxLayout, setInboxLayout)}
            </div>

            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Eye size={16} color="var(--gold-mid)" /> Email Preview
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>How much of the message to show in the list</div>
              </div>
              {radioGroup([
                { value: "none", label: "No preview", desc: "Show subject only" },
                { value: "1line", label: "1 line", desc: "Show one line of preview text" },
                { value: "2lines", label: "2 lines", desc: "Show two lines of preview text" },
              ], emailPreview, setEmailPreview)}
            </div>

            <button onClick={saveGeneralSettings} style={{
              padding: "12px 28px",
              background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
              border: "none", borderRadius: "10px", cursor: "pointer",
              fontSize: "13px", fontWeight: "700", color: "var(--bg-body)",
              fontFamily: "Raleway, sans-serif",
              boxShadow: "0 2px 12px rgba(212, 175, 55,0.3)",
            }}>Save Changes</button>
          </>
        )}

        {/* ══ SECURITY ════════════════════════════════════════ */}
        {activeSection === "security" && (
          <>
            <h2 className="mail-detail-subject" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Lock size={22} color="var(--gold-mid)" /> Security Settings
            </h2>

            {regenSuccess && (
              <div style={{
                background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)",
                borderRadius: "8px", padding: "10px 16px", marginBottom: "16px",
                fontSize: "12px", color: "#4caf6e", display: "flex", alignItems: "center", gap: "8px"
              }}><CheckCircle size={14} /> New PGP keys generated and saved. Old keys are no longer valid.</div>
            )}

            {/* PGP keys */}
            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Key size={16} color="var(--gold-mid)" /> Your PGP Keys
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>ECC Curve25519 key pair — generated on account creation</div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <span style={labelStyle}>Public Key</span>
                <div style={{
                  background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
                  borderRadius: "8px", padding: "10px 12px",
                  fontFamily: "Courier New, monospace", fontSize: "10px",
                  color: "var(--gold-light)", wordBreak: "break-all",
                  maxHeight: "80px", overflowY: "auto", lineHeight: "1.6",
                }}>
                  {user.publicKey ? user.publicKey.slice(0, 200) + "..." : "No public key found"}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <span style={labelStyle}>Private Key</span>
                <div style={{
                  background: "var(--bg-panel)", border: "1px solid rgba(217,48,37,0.3)",
                  borderRadius: "8px", padding: "10px 12px",
                  fontFamily: "Courier New, monospace", fontSize: "10px",
                  color: showPrivateKey ? "var(--gold-light)" : "var(--text-muted)",
                  wordBreak: "break-all", maxHeight: "80px", overflowY: "auto", lineHeight: "1.6",
                  filter: showPrivateKey ? "none" : "blur(4px)",
                  transition: "filter 0.2s ease",
                  userSelect: showPrivateKey ? "text" : "none",
                }}>
                  {user.privateKey ? user.privateKey.slice(0, 200) + "..." : "No private key found in localStorage"}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={() => setShowPrivateKey(!showPrivateKey)} style={{
                    padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                    background: "none", border: "1px solid var(--border-gold)",
                    color: "var(--text-bright)", fontSize: "11px", fontFamily: "Raleway, sans-serif",
                    display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    {showPrivateKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPrivateKey ? "Hide" : "Reveal"}
                  </button>
                  <button onClick={handleCopyPrivateKey} style={{
                    padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                    background: "none", border: "1px solid var(--border-gold)",
                    color: copiedKey ? "#4caf6e" : "var(--text-bright)",
                    fontSize: "11px", fontFamily: "Raleway, sans-serif",
                    display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    {copiedKey ? <CheckCircle size={14} /> : <Tag size={14} />}
                    {copiedKey ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div style={{
                background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
                borderRadius: "8px", padding: "10px 14px",
                display: "flex", alignItems: "center", gap: "10px",
              }}>
                <Shield size={18} color="#4caf6e" />
                <div>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#4caf6e" }}>ECC Curve25519 · OpenPGP.js</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Your messages are end-to-end encrypted. Nobody can read them without your private key.
                  </div>
                </div>
              </div>
            </div>

            {/* Export */}
            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                  <Download size={16} style={{ marginRight: "8px", verticalAlign: "middle" }} /> Export Private Key
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Download your private key as a .asc file. Keep it safe — anyone with this file can decrypt your messages.
                </div>
              </div>
              {exportSuccess && (
                <div style={{
                  background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)",
                  borderRadius: "8px", padding: "8px 12px", marginBottom: "12px",
                  fontSize: "12px", color: "#4caf6e",
                }}>                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle size={14} /> Private key exported — store it somewhere safe!
                </div></div>
              )}
              <button onClick={handleExportPrivateKey} style={{
                padding: "10px 20px", borderRadius: "8px", cursor: "pointer",
                background: "rgba(212, 175, 55,0.08)", border: "1px solid rgba(212, 175, 55,0.3)",
                color: "var(--gold-mid)", fontSize: "13px",
                fontFamily: "Raleway, sans-serif", fontWeight: "600",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
                <Download size={16} /> Download Private Key (.asc)
              </button>
            </div>

            {/* Passkeys (WebAuthn) */}
            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Shield size={16} color="var(--gold-mid)" /> Passkeys & Biometrics
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Use your device's biometrics (TouchID, FaceID) to securely unlock your vault across devices.
                </div>
              </div>

              {passkeys.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  {passkeys.map(pk => (
                    <div key={pk.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 16px", background: "var(--bg-panel)",
                      borderRadius: "10px", border: "1px solid var(--border-gold)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <CheckCircle2 size={18} color="#4caf6e" />
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-bright)" }}>{pk.name}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Added {new Date(pk.addedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <button onClick={() => handleRemovePasskey(pk.id)} style={{
                        background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer"
                      }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {passkeySuccess && (
                <div style={{
                  background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)",
                  borderRadius: "8px", padding: "10px 16px", marginBottom: "16px",
                  fontSize: "12px", color: "#4caf6e", display: "flex", alignItems: "center", gap: "8px"
                }}><CheckCircle size={14} /> Passkey linked to your decentralized identity.</div>
              )}

              <button 
                onClick={handleRegisterPasskey}
                disabled={passkeyLoading}
                style={{
                  padding: "12px 24px", borderRadius: "10px", cursor: "pointer",
                  background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                  border: "none", color: "var(--bg-body)", fontSize: "13px",
                  fontFamily: "Raleway, sans-serif", fontWeight: "800",
                  display: "flex", alignItems: "center", gap: "10px",
                  opacity: passkeyLoading ? 0.6 : 1
                }}
              >
                {passkeyLoading ? <RefreshCw size={16} className="spin" /> : <PlusCircle size={16} />}
                Add New Passkey
              </button>

              <div style={{
                marginTop: "20px", padding: "14px", borderRadius: "10px",
                background: "rgba(212, 175, 55,0.05)", border: "1px dashed var(--gold-mid)",
              }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--gold-mid)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Database size={14} /> Tech Stack: Decentralized Passkeys
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.6" }}>
                  <li><b>WebAuthn (FIDO2)</b>: Standard browser API for hardware-backed biometrics.</li>
                  <li><b>Cross-Device Sync</b>: Passkeys registered here are announced to your GunDB identity mesh.</li>
                  <li><b>Roaming Authenticators</b>: Use physical security keys (Yubikey) for hardware-bound sovereignty.</li>
                  <li><b>Platform Sync</b>: Modern OSes (iCloud/Google) sync these passkeys across your logged-in devices automatically.</li>
                </ul>
              </div>
            </div>

            {/* Import private key */}
            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                  <FolderOpen size={16} style={{ marginRight: "8px", verticalAlign: "middle" }} /> Import Private Key
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  If you cleared your browser data or switched devices, paste your private key here to restore access to your messages.
                </div>
              </div>
              {importKeyError && (
                <div style={{
                  background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.2)",
                  borderRadius: "8px", padding: "8px 12px", marginBottom: "10px",
                  fontSize: "12px", color: "#e84234",
                }}> {importKeyError}</div>
              )}
              {importKeySuccess && (
                <div style={{
                  background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)",
                  borderRadius: "8px", padding: "8px 12px", marginBottom: "10px",
                  fontSize: "12px", color: "#4caf6e",
                }}>                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle size={14} /> Private key imported successfully!
                </div></div>
              )}
              <textarea
                value={importKeyText}
                onChange={(e) => { setImportKeyText(e.target.value); setImportKeyError("") }}
                placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...paste your private key here..."
                style={{
                  width: "100%", minHeight: "120px", boxSizing: "border-box",
                  background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
                  borderRadius: "8px", padding: "12px",
                  fontFamily: "Courier New, monospace", fontSize: "11px",
                  color: "var(--text-bright)", resize: "vertical", outline: "none",
                  lineHeight: "1.6", marginBottom: "12px",
                }}
              />
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button onClick={handleImportKey} style={{
                  padding: "10px 20px", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(212, 175, 55,0.08)", border: "1px solid rgba(212, 175, 55,0.3)",
                  color: "var(--gold-mid)", fontSize: "13px",
                  fontFamily: "Raleway, sans-serif", fontWeight: "600",
                  display: "flex", alignItems: "center", gap: "8px"
                }}>
                  <FolderOpen size={16} /> Import Key
                </button>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Or upload a .asc file:
                </span>
                <label style={{
                  padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                  background: "none", border: "1px solid var(--border-gold)",
                  color: "var(--text-muted)", fontSize: "12px", fontFamily: "Raleway, sans-serif",
                  display: "flex", alignItems: "center", gap: "6px"
                }}>
                  <Folder size={14} /> Browse
                  <input type="file" accept=".asc,.txt" style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const text = await file.text()
                      setImportKeyText(text.trim())
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Login security info */}
            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                  <Shield size={16} style={{ marginRight: "8px", verticalAlign: "middle" }} /> Account Info
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Account Email", value: user.email || "—" },
                  { label: "Encryption", value: "ECC Curve25519 (OpenPGP)" },
                  { label: "Storage", value: "GunDB + IPFS (Kubo)" },
                  { label: "Key Protection", value: "Passphrase-protected" },
                ].map((row) => (
                  <div key={row.label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "var(--bg-panel)",
                    borderRadius: "8px", border: "1px solid var(--border-gold)",
                  }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.label}</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-bright)" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div style={{ ...card, border: "1px solid rgba(217,48,37,0.3)", background: "rgba(217,48,37,0.03)" }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#e84234", marginBottom: "4px" }}>
                  <AlertCircle size={16} style={{ marginRight: "8px", verticalAlign: "middle" }} /> Regenerate Encryption Keys
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Generates a brand new PGP key pair. You will not be able to decrypt old messages after this.
                </div>
              </div>
              <div style={{
                background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.2)",
                borderRadius: "8px", padding: "10px 14px", marginBottom: "14px",
                fontSize: "11px", color: "#e84234", display: "flex", gap: "8px",
              }}>
                <AlertCircle size={14} style={{ marginTop: "2px" }} />
                <span>Old encrypted messages will be permanently unreadable. Export important messages first.</span>
              </div>
              <button onClick={() => setShowRegenModal(true)} style={{
                padding: "10px 20px", borderRadius: "8px", cursor: "pointer",
                background: "rgba(217,48,37,0.1)", border: "1px solid rgba(217,48,37,0.35)",
                color: "#e84234", fontSize: "13px", fontFamily: "Raleway, sans-serif", fontWeight: "600",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
                <RefreshCw size={16} /> Regenerate Keys
              </button>
            </div>
          </>
        )}

        {/* ══ BLOCKCHAIN ══════════════════════════════════════ */}
        {activeSection === "blockchain" && (
          <>
            <h2 className="mail-detail-subject" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <LinkIcon size={22} color="var(--gold-mid)" /> Blockchain Identity
            </h2>

            <div style={{
              background: "rgba(212, 175, 55,0.04)", border: "1px solid rgba(212, 175, 55,0.15)",
              borderRadius: "12px", padding: "16px", marginBottom: "20px",
              fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.7",
            }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <LinkIcon size={16} /> What is Blockchain Verification?
              </div>
              Linking your Ethereum wallet to your SecureMail identity proves that you control
              a real crypto wallet. No transaction is sent and no gas is spent — only a cryptographic signature.
              <div style={{ marginTop: "10px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {[
                  { icon: <Sparkles size={12} />, label: "Free — no gas fees" },
                  { icon: <Lock size={12} />, label: "No private key exposed" },
                  { icon: <Globe size={12} />, label: "Publicly verifiable on-chain" },
                  { icon: <CheckCircle size={12} />, label: "Works with MetaMask, Coinbase, Rainbow" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-bright)" }}>
                    {item.icon}<span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={card}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Wallet size={16} color="var(--gold-mid)" /> Connect Ethereum Wallet
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Sign a message with your wallet to verify your identity.
                </div>
              </div>
              <BlockchainVerify />
            </div>

            <div style={card}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Search size={16} color="var(--gold-mid)" /> How It Works
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { step: "1", title: "Connect Wallet", desc: "MetaMask opens and asks permission to connect" },
                  { step: "2", title: "Sign Message", desc: "You sign a human-readable message — no ETH sent, no gas" },
                  { step: "3", title: "Store on GunDB", desc: "Your wallet address + signature stored on the P2P network" },
                  { step: "4", title: "Public Proof", desc: "Anyone can verify your wallet on Etherscan by your email" },
                ].map((item) => (
                  <div key={item.step} style={{
                    display: "flex", alignItems: "flex-start", gap: "12px",
                    padding: "10px 14px", background: "var(--bg-panel)",
                    borderRadius: "8px", border: "1px solid var(--border-gold)",
                  }}>
                    <div style={{
                      width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: "800", color: "var(--bg-body)",
                    }}>{item.step}</div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)" }}>{item.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ LABELS ═══════════════════════════════════════════ */}
        {activeSection === "labels" && (
          <>
            <h2 className="mail-detail-subject" ref={labelSectionRef} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Tag size={22} color="var(--gold-mid)" /> Manage Labels
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Create custom labels to organize your inbox.
            </p>

            <div style={{ ...card }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                {editingLabel ? <Edit2 size={16} /> : <PlusCircle size={16} />}
                {editingLabel ? "Edit Label" : "Create New Label"}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
                <input className="auth-input" style={{ flex: 1, minWidth: "160px" }}
                  placeholder="Label name (e.g. Work)"
                  value={editingLabel ? editingLabel.name : newLabelName}
                  onChange={(e) => editingLabel
                    ? setEditingLabel({ ...editingLabel, name: e.target.value })
                    : setNewLabelName(e.target.value)
                  }
                />
                <input className="auth-input" style={{ width: "80px" }}
                  placeholder="Emoji"
                  value={editingLabel ? (editingLabel.emoji || "") : newLabelEmoji}
                  onChange={(e) => editingLabel
                    ? setEditingLabel({ ...editingLabel, emoji: e.target.value })
                    : setNewLabelEmoji(e.target.value)
                  }
                />
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                {PRESET_COLORS.map((c) => {
                  const active = editingLabel ? editingLabel.color === c : newLabelColor === c
                  return (
                    <button key={c}
                      onClick={() => editingLabel ? setEditingLabel({ ...editingLabel, color: c }) : setNewLabelColor(c)}
                      style={{
                        width: "24px", height: "24px", borderRadius: "50%",
                        background: c, border: active ? "3px solid #fff" : "3px solid transparent",
                        outline: active ? `2px solid ${c}` : "none",
                        cursor: "pointer", transition: "transform 0.15s",
                        transform: active ? "scale(1.2)" : "scale(1)",
                      }}
                    />
                  )
                })}
              </div>

              <div style={{ marginBottom: "14px" }}>
                <span className="label-pill" style={{
                  background: `${editingLabel ? editingLabel.color : newLabelColor}22`,
                  color: editingLabel ? editingLabel.color : newLabelColor,
                  border: `1px solid ${editingLabel ? editingLabel.color : newLabelColor}44`,
                }}>
                  <span className="label-dot" style={{ background: editingLabel ? editingLabel.color : newLabelColor }} />
                  {editingLabel
                    ? `${editingLabel.emoji || ""}${editingLabel.name || "Preview"}`
                    : `${newLabelEmoji}${newLabelName || "Preview"}`}
                </span>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn" onClick={() => {
                  const email = user.email || ""
                  if (editingLabel) {
                    saveLabel(email, editingLabel)
                    setLabels(getLabels(email))
                    setEditingLabel(null)
                  } else {
                    if (!newLabelName.trim()) return
                    const newLabel: Label = {
                      id: createId(), name: newLabelName.trim(),
                      color: newLabelColor, emoji: newLabelEmoji || undefined,
                    }
                    saveLabel(email, newLabel)
                    setLabels(getLabels(email))
                    setNewLabelName("")
                    setNewLabelEmoji("")
                    setNewLabelColor(PRESET_COLORS[0])
                  }
                  setGeneralSaved(true)
                  setTimeout(() => setGeneralSaved(false), 2000)
                  window.dispatchEvent(new Event("storage"))
                }}>
                  {editingLabel ? "Save Changes" : "Create Label"}
                </button>
                {editingLabel && (
                  <button className="btn-secondary" onClick={() => setEditingLabel(null)}>Cancel</button>
                )}
              </div>
            </div>

            {labels.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Tag size={16} /> Your Labels ({labels.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {labels.map((lbl) => (
                    <div key={lbl.id} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 14px", background: "var(--bg-panel)",
                      borderRadius: "10px", border: "1px solid var(--border-gold)",
                    }}>
                      <span className="label-pill" style={{
                        background: `${lbl.color}22`, color: lbl.color,
                        border: `1px solid ${lbl.color}44`, flex: "0 0 auto",
                      }}>
                        <span className="label-dot" style={{ background: lbl.color }} />
                        {lbl.emoji ? `${lbl.emoji} ` : ""}{lbl.name}
                      </span>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => setEditingLabel({ ...lbl })} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-muted)", fontSize: "12px",
                        padding: "4px 10px", borderRadius: "6px", fontFamily: "Raleway, sans-serif",
                        display: "flex", alignItems: "center", gap: "4px"
                      }}><Edit2 size={12} /> Edit</button>
                      <button onClick={() => {
                        const email = user.email || ""
                        deleteLabel(email, lbl.id)
                        setLabels(getLabels(email))
                        window.dispatchEvent(new Event("storage"))
                      }} style={{
                        background: "rgba(217,48,37,0.1)", border: "1px solid rgba(217,48,37,0.2)",
                        cursor: "pointer", color: "#e84234", fontSize: "12px",
                        padding: "4px 10px", borderRadius: "6px", fontFamily: "Raleway, sans-serif",
                        display: "flex", alignItems: "center", gap: "4px"
                      }}><Trash2 size={12} /> Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ NETWORK & STORAGE ════════════════════════════════ */}
        {activeSection === "network" && (
          <>
            <h2 className="mail-detail-subject" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Globe size={22} color="var(--gold-mid)" /> Network & Global Storage
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "20px", lineHeight: "1.7" }}>
              DMail uses <strong style={{ color: "var(--text-bright)" }}>Pinata</strong> to pin mail content to the global IPFS network.
              Without this, your emails are only stored locally and cannot be read on other devices.
            </p>

            {/* Status banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 18px", borderRadius: "12px", marginBottom: "20px",
              background: pinataStatus === "ok"
                ? "rgba(76,175,110,0.1)" : pinataStatus === "fail"
                ? "rgba(217,48,37,0.08)" : "rgba(212, 175, 55,0.06)",
              border: `1px solid ${pinataStatus === "ok"
                ? "rgba(76,175,110,0.3)" : pinataStatus === "fail"
                ? "rgba(217,48,37,0.25)" : "rgba(212, 175, 55,0.2)"}`,
            }}>
              <span style={{ display: "flex", alignItems: "center" }}>
                {pinataStatus === "ok" ? <CheckCircle2 size={22} color="#4caf6e" /> 
                : pinataStatus === "fail" ? <XCircle size={22} color="#e84234" /> 
                : <RefreshCw size={22} color="var(--gold-mid)" className="spin" />}
              </span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)" }}>
                  {pinataStatus === "ok" ? "Global Communication Active"
                    : pinataStatus === "fail" ? "Connection Failed"
                    : "Global Communication Inactive"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {pinataStatus === "ok"
                    ? "Mail content is pinned globally — any device can receive your emails."
                    : pinataStatus === "fail" ? "Relay proxy is offline or pinning is unconfigured."
                    : "Checking global backend proxy status..."}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div style={card}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                <RefreshCw size={16} /> How Global Mail Works
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { step: "1", title: "You send a mail", desc: "The encrypted body is uploaded to Pinata (public IPFS network)" },
                  { step: "2", title: "Pinata pins it globally", desc: "The content gets a CID (like QmXyz...) — accessible from any device on earth" },
                  { step: "3", title: "GunDB broadcasts the index", desc: "A lightweight mail index { sender, subject, CID } is sent to global GunDB relays" },
                  { step: "4", title: "Recipient's device receives", desc: "Their app sees the index via GunDB, fetches the content from IPFS, decrypts it" },
                ].map((item) => (
                  <div key={item.step} style={{
                    display: "flex", alignItems: "flex-start", gap: "12px",
                    padding: "10px 14px", background: "var(--bg-panel)",
                    borderRadius: "8px", border: "1px solid var(--border-gold)",
                  }}>
                    <div style={{
                      width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: "800", color: "var(--bg-body)",
                    }}>{item.step}</div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)" }}>{item.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanation card */}
            <div style={card}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Key size={16} /> Developer Pre-Configured
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.6" }}>
                Global pinning is handled securely by the backend relay server. You do not need to configure any API keys or accounts. 
                All cross-device syncing happens automatically in the background.
              </div>
            </div>

            {/* GunDB relay info */}
            <div style={card}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Database size={16} /> GunDB Global Relays
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                These public relays carry your mail index globally. They are always active.
              </div>
              {[
                "https://gun-manhattan.herokuapp.com/gun",
                "https://gun-usa.herokuapp.com/gun",
                "https://gun-eu.herokuapp.com/gun",
                "https://dmail-relay.onrender.com/gun",
              ].map(relay => (
                <div key={relay} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 12px", marginBottom: "6px",
                  background: "var(--bg-panel)", borderRadius: "8px",
                  border: "1px solid var(--border-gold)",
                }}>
                  <span style={{ color: "#4caf6e", fontSize: "10px" }}>●</span>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "var(--text-muted)" }}>{relay}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Regen keys modal ── */}
      {showRegenModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}>
              <RefreshCw size={32} color="var(--gold-mid)" />
            </div>
            <h3>Regenerate PGP Keys</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Enter a new password for your key pair. This will replace your current keys.
            </p>
            <div style={{
              background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.2)",
              borderRadius: "8px", padding: "10px 14px", marginBottom: "14px",
              fontSize: "11px", color: "#e84234",
            }}>
              ⚠️ You will lose access to all previously received encrypted messages.
            </div>
            {regenError && (
              <div style={{
                padding: "8px 12px", borderRadius: "8px", marginBottom: "10px",
                fontSize: "13px", background: "rgba(217,48,37,0.1)", color: "#e84234",
                border: "1px solid rgba(217,48,37,0.25)",
              }}>⚠️ {regenError}</div>
            )}
            <input type="password" className="auth-input"
              placeholder="New password (min 8 characters)"
              value={regenPassword}
              onChange={(e) => { setRegenPassword(e.target.value); setRegenError("") }}
              disabled={regenLoading}
            />
            <input type="password" className="auth-input"
              placeholder="Confirm new password"
              value={regenConfirm}
              style={{ marginTop: "10px" }}
              onChange={(e) => { setRegenConfirm(e.target.value); setRegenError("") }}
              onKeyDown={(e) => e.key === "Enter" && !regenLoading && handleRegenKeys()}
              disabled={regenLoading}
            />
            <div className="modal-actions">
              <button className="btn-secondary"
                onClick={() => { setShowRegenModal(false); setRegenPassword(""); setRegenConfirm(""); setRegenError("") }}
                disabled={regenLoading}
              >Cancel</button>
              <button onClick={handleRegenKeys} disabled={regenLoading} style={{
                padding: "10px 20px", borderRadius: "8px",
                border: "1px solid rgba(217,48,37,0.3)",
                background: "rgba(217,48,37,0.15)", color: "#e84234",
                cursor: regenLoading ? "not-allowed" : "pointer",
                fontWeight: "700", fontFamily: "Raleway, sans-serif",
                fontSize: "13px", opacity: regenLoading ? 0.7 : 1,
              }}>
                {regenLoading ? (
                  <>
                    <span style={{
                      display: "inline-block", width: "12px", height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #e84234", borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      marginRight: "8px", verticalAlign: "middle",
                    }} />Generating...
                  </>
                ) : "Regenerate Keys"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
