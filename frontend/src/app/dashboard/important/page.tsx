"use client"

import { useEffect, useState, useMemo } from "react"
import { getThreads, subscribe, updateMailInStore, type Thread } from "@/utils/mailStore"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import { decryptMessage, cleanMessage } from "@/utils/gun"
import { getLocalNode } from "@/utils/ipfs"
import PageHeader from "@/components/PageHeader"
import { 
  RefreshCw, MoreVertical, Archive, Trash2, CheckSquare, Square, 
  Star, ChevronLeft, Shield, Lock, Inbox, AlertTriangle, Mail
} from "lucide-react"

export default function ImportantPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedMail, setSelectedMail] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMail, setLoadingMail] = useState(false)

  // ── Decryption State ──
  const [passInput, setPassInput] = useState("")
  const [passError, setPassError] = useState("")
  const [showPassModal, setShowPassModal] = useState(false)
  const [decrypting, setDecrypting] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)
    
    const refresh = () => {
      const all = getThreads(["inbox", "sent", "archived"])
      const important = all.filter(t => t.lastMessage.isImportant || /urgent|important|action|security|boss/i.test(t.lastMessage.subject || ""))
      setThreads(important)
    }

    refresh()
    const unsub = subscribe(refresh)
    return () => { unsub() }
  }, [])

  const filteredThreads = useMemo(() => {
    return threads.filter((t) =>
      (t.lastMessage.subject?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (t.lastMessage.senderEmail?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    )
  }, [threads, searchQuery])

  const formatMailDate = (timeStr: string) => {
    if (!timeStr) return ""
    const d = new Date(timeStr)
    if (isNaN(d.getTime())) return timeStr.split(",")[0] || ""
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    const isThisYear = d.getFullYear() === now.getFullYear()
    if (isThisYear) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
  }

  const hasValidCid = (mail: any) =>
    mail?.cid && (mail.cid.startsWith("Qm") || mail.cid.startsWith("bafy"))

  const openMail = async (thread: Thread) => {
    const mail = thread.lastMessage
    if (selectedMail?.id === mail.id) return

    // 🚀 OPTIMISTIC OPEN
    setPassInput("")
    setPassError("")
    
    const initialState = {
      ...mail,
      fetchingBody: !mail.message,
      isDecrypted: !!mail.decryptedMessage
    }
    setSelectedMail(initialState)

    try {
      const cached = await getCachedMail(mail.id)
      if (cached?.decryptedMessage) {
        setSelectedMail(prev => prev?.id === mail.id ? {
          ...prev,
          message: cached.decryptedMessage,
          attachments: cached.attachments || mail.attachments || [],
          isDecrypted: true,
          fetchingBody: false
        } : prev)
        return
      }

      if (mail.message) {
        setSelectedMail(prev => prev?.id === mail.id ? { ...prev, fetchingBody: false } : prev)
        return
      }

      if (hasValidCid(mail)) {
        try {
          const { fetchFromIPFS } = await import("@/utils/ipfs")
          const parsed = await fetchFromIPFS(mail.cid)
          if (parsed && parsed.message) {
            setSelectedMail(prev => prev?.id === mail.id ? {
              ...prev,
              message: parsed.message,
              attachments: parsed.attachments || mail.attachments || [],
              isEncrypted: parsed.message.includes("-----BEGIN PGP MESSAGE-----"),
              fetchingBody: false
            } : prev)
            return
          }
        } catch (e) { console.warn("IPFS fetch failed:", e) }
      }

      setSelectedMail(prev => prev?.id === mail.id ? { ...prev, fetchingBody: false } : prev)
    } catch (err: any) {
      setSelectedMail(prev => prev?.id === mail.id ? { ...prev, fetchingBody: false } : prev)
    }
  }

  const decryptMail = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!selectedMail?.message) { setPassError("No message content."); return }
    const password = passInput || user.password
    if (!password) { setPassError("Password not found. Please enter your password."); return }

    setDecrypting(true)
    setPassError("")

    try {
      const decrypted = await decryptMessage(selectedMail.message, user.privateKey, password)
      const cleanedBody = cleanMessage(decrypted)
      const updated = { ...selectedMail, message: cleanedBody, isDecrypted: true }
      setSelectedMail(updated)
      await updateCachedMail(selectedMail.id, {
        decryptedMessage: cleanedBody,
        isDecrypted: true,
        message: selectedMail.message,
        attachments: selectedMail.attachments,
      })
      setShowPassModal(false)
      setPassInput("")
    } catch (err: any) {
      const errMsg = err?.message || ""
      if (errMsg.includes("session key") || errMsg.includes("decrypt")) {
        setPassError("This message was not encrypted for your keys.")
      } else if (errMsg.includes("passphrase") || errMsg.includes("password")) {
        setPassError("Incorrect password.")
      } else {
        setPassError(`Decryption failed: ${errMsg}`)
      }
    } finally {
      setDecrypting(false)
    }
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const renderReader = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-panel)", animation: "fadeUp 0.3s ease both" }}>
      <div style={{ marginBottom: "28px" }}>
        <button
          onClick={() => setSelectedMail(null)}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)", fontSize: "13px", fontWeight: "800", letterSpacing: "1px", padding: "8px 0", transition: "opacity 0.2s" }}
        >
          <ChevronLeft size={16} /> IMPORTANT
        </button>
      </div>

      <div style={{ maxWidth: "860px" }}>
        <h1 style={{ fontSize: "26px", fontFamily: "Cinzel, serif", color: "var(--text-bright)", marginBottom: "24px", letterSpacing: "1px", lineHeight: 1.3 }}>
          {selectedMail.subject || "(No subject)"}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px", paddingBottom: "24px", borderBottom: "1px solid var(--border-gold)" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "20px", flexShrink: 0 }}>
            {selectedMail.senderEmail?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px", marginBottom: "4px" }}>{selectedMail.senderEmail}</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              To: <strong style={{ color: "var(--gold-mid)" }}>{selectedMail.receiverEmail}</strong>
              <span style={{ margin: "0 8px" }}>•</span>{selectedMail.time}
            </div>
          </div>
        </div>

        <div style={{ minHeight: "300px" }}>
          {selectedMail.fetchingBody ? (
            <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ height: "20px", background: "rgba(212, 175, 55,0.05)", borderRadius: "4px", width: "80%", animation: "pulse 2s infinite" }} />
              <div style={{ height: "20px", background: "rgba(212, 175, 55,0.05)", borderRadius: "4px", width: "95%", animation: "pulse 2s infinite" }} />
              <div style={{ height: "20px", background: "rgba(212, 175, 55,0.05)", borderRadius: "4px", width: "60%", animation: "pulse 2s infinite" }} />
            </div>
          ) : !selectedMail.isDecrypted ? (
            <div style={{
              padding: "48px 40px", background: "var(--bg-vault)",
              border: "1px solid var(--border-gold)", borderRadius: "16px",
              maxWidth: "600px", boxShadow: "var(--shadow-deep)"
            }}>
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <Shield size={48} color="var(--gold-mid)" strokeWidth={1} />
                <div>
                  <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "18px", color: "var(--text-bright)", marginBottom: "8px" }}>ENCRYPTED CONTENT</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.7 }}>
                    This message is end-to-end encrypted. Enter your DMail password to unlock.
                  </p>
                  <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      background: "rgba(212, 175, 55,0.1)", padding: "8px 16px", borderRadius: "8px",
                      border: "1px solid var(--border-gold)", color: "var(--gold-mid)", fontSize: "12px", fontWeight: "700"
                    }}>
                      <Lock size={12} /> ECC Curve25519
                    </div>
                    <button
                      onClick={() => setShowPassModal(true)}
                      className="btn"
                      style={{ padding: "8px 24px", fontSize: "12px" }}
                    >
                      UNLOCK MESSAGE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.9", fontSize: "15px", color: "var(--text-bright)", fontFamily: "Inter, Raleway, sans-serif", maxWidth: "760px" }}>
              {cleanMessage(selectedMail.message)}
            </div>
          )}
        </div>
      </div>
      {showPassModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ animation: "fadeUp 0.3s ease" }}>
            <h3 style={{ fontFamily: "Cinzel, serif", color: "var(--gold-mid)", marginBottom: "16px" }}>Verify Identity</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Enter your DMail account password to securely decrypt this message.
            </p>
            <input
              type="password"
              className="auth-input"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="Your password"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && decryptMail()}
              style={{ marginBottom: "10px" }}
            />
            {passError && <p style={{ color: "#e84234", fontSize: "12px", marginBottom: "20px", fontWeight: "600" }}>{passError}</p>}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={() => setShowPassModal(false)} className="chromeless-btn" style={{ padding: "10px 20px" }}>CANCEL</button>
              <button className="btn" onClick={decryptMail} disabled={decrypting}>
                {decrypting ? "UNLOCKING..." : "UNLOCK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {!selectedMail && (
        <>
          <PageHeader
            title="Important"
            count={threads.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Search important messages..."
          />
          <div className="folder-toolbar">
            <button className="toolbar-btn" onClick={() => selectedIds.length === filteredThreads.length ? setSelectedIds([]) : setSelectedIds(filteredThreads.map(t => t.id))}>
              {selectedIds.length === filteredThreads.length && filteredThreads.length > 0 ? <CheckSquare size={18} color="var(--gold-mid)" /> : <Square size={18} />}
            </button>
            <button className="toolbar-btn" onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 1000) }}>
              <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button className="toolbar-btn"><MoreVertical size={18} /></button>
          </div>
        </>
      )}

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedMail ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {loadingMail && <div style={{ position: "absolute", inset: 0, background: "var(--bg-card)", opacity: 0.85, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}><div style={{ color: "var(--gold-mid)", fontWeight: "700" }}>Loading...</div></div>}
            {renderReader()}
          </div>
        ) : (
          <div className="mail-list" style={{ flex: 1, overflowY: "auto" }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: "100px 40px", textAlign: "center", color: "var(--text-muted)" }}>
                <Star size={48} style={{ opacity: 0.15, display: "block", margin: "0 auto 20px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600" }}>{searchQuery ? "No results found." : "No important messages."}</div>
                <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "8px" }}>Messages with auto-priority or manual markers appear here.</div>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const mail = thread.lastMessage
                const isSelected = selectedIds.includes(thread.id)
                const senderRaw = mail.senderEmail?.split("@")[0] || "Unknown"
                const senderName = senderRaw.charAt(0).toUpperCase() + senderRaw.slice(1)
                const colors = ["var(--gold-mid)", "var(--gold-mid)", "var(--gold-deep)", "var(--gold-mid)", "var(--gold-deep)"]
                const avatarColor = colors[(senderName.charCodeAt(0) || 0) % colors.length]

                return (
                  <div
                    key={thread.id}
                    className={`mail-row ${isSelected ? "selected" : ""}`}
                    onClick={() => openMail(thread)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0 8px 0 4px",
                      minHeight: "52px",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(212, 175, 55,0.07)",
                      background: isSelected ? "rgba(212, 175, 55,0.09)" : "transparent",
                      transition: "background 0.15s",
                      gap: 0,
                      position: "relative",
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%",
                      background: avatarColor, display: "flex", alignItems: "center",
                      justifyContent: "center", fontWeight: "700", color: "var(--bg-body)",
                      fontSize: "14px", marginLeft: "4px", marginRight: "10px",
                    }}>
                      {senderName.charAt(0)}
                    </div>

                    {/* Importance Marker + Checkbox */}
                    <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", width: "56px", marginRight: "8px" }}>
                      <div
                        className={`mail-row-checkbox ${isSelected ? "checked" : ""}`}
                        onClick={(e) => toggleSelect(e, thread.id)}
                        style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px" }}
                      >
                        {isSelected && <CheckSquare size={12} color="var(--bg-body)" />}
                      </div>
                      <span style={{ color: "var(--gold-mid)", fontWeight: "800", fontSize: "18px", marginLeft: "4px" }}>»</span>
                    </div>

                    {/* Sender — fixed 160px */}
                    <div className="mail-sender" style={{ width: "160px", flexShrink: 0, marginRight: "12px", border: "none", fontSize: "13px", fontWeight: !mail.isRead ? "700" : "500", color: !mail.isRead ? "var(--text-bright)" : "var(--text-muted)" }}>
                      {senderName}
                      {thread.count > 1 && (
                        <span style={{
                          fontSize: "10px", padding: "1px 5px", borderRadius: "10px",
                          background: "rgba(212, 175, 55,0.1)", color: "var(--gold-mid)",
                          fontWeight: "800", marginLeft: "6px", border: "1px solid rgba(212, 175, 55,0.2)"
                        }}>
                          {thread.count}
                        </span>
                      )}
                    </div>

                    {/* Subject + Snippet */}
                    <div className="mail-content" style={{ flex: 1, border: "none", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                      <span className="mail-subject" style={{ fontWeight: !mail.isRead ? "700" : "500", color: !mail.isRead ? "var(--text-bright)" : "var(--text-muted)", fontSize: "13px", flexShrink: 0, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {thread.subject || "(No subject)"}
                      </span>
                      <span style={{ color: "var(--text-muted)", opacity: 0.5, margin: "0 2px", fontSize: "12px" }}>—</span>
                      <span className="mail-snippet" style={{ fontSize: "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        🔒 {mail.message?.includes("-----BEGIN PGP MESSAGE-----") ? "Encrypted" : cleanMessage(mail.message).slice(0, 100)}
                      </span>
                    </div>

                    {/* Date */}
                    <div style={{ flexShrink: 0, fontSize: "12px", marginLeft: "12px", width: "62px", textAlign: "right", color: "var(--text-dim)" }}>
                      {formatMailDate(mail.time)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
