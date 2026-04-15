"use client"

import { useEffect, useState } from "react"
import { getMails, subscribe, updateMailInStore } from "@/utils/mailStore"
import { db, decryptMessage } from "@/utils/gun"
import { exportMailFromIPFS, getLocalNode } from "@/utils/ipfs"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import {
  RefreshCw, MoreVertical, Archive, Trash2, CheckSquare, Square,
  Star, ChevronLeft, Send, Download, FileText, Paperclip, Shield, Lock
} from "lucide-react"
import PageHeader from "@/components/PageHeader"

// ── Deduplicate mails by id ───────────────────────────────────
const dedup = (arr: any[]) =>
  arr.filter((m, i, self) => i === self.findIndex((x) => x.id === m.id))

// ── Group mails into threads by subject ──────────────────────
const groupThreads = (mails: any[]) => {
  const map = new Map<string, any[]>()
  mails.forEach((m) => {
    const key = (m.subject || "").replace(/^(Re:|Fwd:)\s*/i, "").trim().toLowerCase()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  })
  return Array.from(map.entries()).map(([, messages]) => {
    const sorted = messages.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    )
    return {
      id: sorted[0].id,
      subject: sorted[0].subject,
      lastMessage: sorted[0],
      messages: sorted,
      count: sorted.length,
    }
  }).sort(
    (a, b) =>
      new Date(b.lastMessage.time).getTime() - new Date(a.lastMessage.time).getTime()
  )
}

export default function SentPage() {
  const [mails, setMails] = useState<any[]>([])
  const [selectedMail, setSelectedMail] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMail, setLoadingMail] = useState(false)
  const [passInput, setPassInput] = useState("")
  const [passError, setPassError] = useState("")
  const [decrypting, setDecrypting] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    const loadFromStore = () => {
      const all = getMails("sent")
      const bySender = all.filter(
        (m: any) => m.senderEmail === user.email
      )
      setMails((prev) => dedup([...prev, ...bySender]))
    }

    loadFromStore()
    const unsub = subscribe(() => loadFromStore())

    db.listenSentMails(user.email, (mail: any) => {
      if (!mail?.id) return
      setMails((prev) => dedup([...prev, mail]))
      updateMailInStore(mail.id, mail)
    })

    return () => { unsub() }
  }, [])

  const decryptMail = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (passInput !== user.password) { setPassError("Incorrect password."); return }
    if (!selectedMail?.message) { setPassError("No message content."); return }
    if (!selectedMail.message.includes("-----BEGIN PGP MESSAGE-----")) {
      setSelectedMail({ ...selectedMail, isDecrypted: true })
      setPassInput("")
      return
    }

    setDecrypting(true)
    setPassError("")

    try {
      const decrypted = await decryptMessage(selectedMail.message, user.privateKey, passInput)
      const cleanedBody = decrypted.replace(/\[IPFS Attachment: [^\]]+\]/g, "").trim()
      const updated = { ...selectedMail, message: cleanedBody, isDecrypted: true }
      setSelectedMail(updated)
      await updateCachedMail(selectedMail.id, {
        decryptedMessage: cleanedBody,
        isDecrypted: true,
        message: selectedMail.message,
        attachments: selectedMail.attachments,
      })
      setPassInput("")
    } catch (err: any) {
      setPassError(`Decryption failed: ${err?.message || "Unknown error"}`)
    } finally {
      setDecrypting(false)
    }
  }

  const sentMails = mails.filter(
    (m) => m.senderStatus === "sent" || m.status === "sent" || m.status === "queued"
  )

  const threads = groupThreads(
    sentMails.filter((m) => {
      const q = searchQuery.toLowerCase()
      if (!q) return true
      return (
        m.subject?.toLowerCase().includes(q) ||
        m.receiverEmail?.toLowerCase().includes(q)
      )
    })
  )

  const hasValidCid = (mail: any) =>
    mail?.cid && (mail.cid.startsWith("Qm") || mail.cid.startsWith("bafy"))

  const openMail = async (thread: any) => {
    const mail = thread.lastMessage
    setLoadingMail(true)
    try {
      const cached = await getCachedMail(mail.id)
      if (cached?.decryptedMessage) {
        setSelectedMail({ ...mail, message: cached.decryptedMessage, attachments: cached.attachments || [], isDecrypted: true })
        setLoadingMail(false); return
      }
      if (hasValidCid(mail)) {
        const res = await fetch(`${getLocalNode(8080)}/ipfs/${mail.cid}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
        if (res && res.ok) {
          const parsed = await res.json()
          const msg = parsed.message
          const encrypted = msg.includes("-----BEGIN PGP MESSAGE-----")
          setSelectedMail({ ...mail, message: msg, isDecrypted: !encrypted, isEncrypted: encrypted, attachments: parsed.attachments || [] })
          setLoadingMail(false); return
        }
      }
      const backup = mail.message || cached?.message || ""
      setSelectedMail({ ...mail, message: backup, isDecrypted: !backup.includes("-----BEGIN PGP MESSAGE-----"), attachments: mail.attachments || [] })
    } catch { } finally { setLoadingMail(false) }
  }

  const handleDownload = async (cid: string, name: string) => {
    try {
      await exportMailFromIPFS(cid, name)
    } catch { alert("Download failed.") }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === threads.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(threads.map(t => t.id))
    }
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    updateMailInStore(id, { status: "trash", senderStatus: "deleted" })
  }

  // ── Gmail-style Inline Reader ──────────────────────────────
  const renderReader = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-panel)", animation: "fadeUp 0.3s ease both" }}>
      {/* Back Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <button
          onClick={() => setSelectedMail(null)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--gold-mid)", fontSize: "13px", fontWeight: "800",
            letterSpacing: "1px", padding: "8px 0",
            transition: "opacity 0.2s"
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.7")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          <ChevronLeft size={16} /> ALL SENT MAIL
        </button>
      </div>

      <div style={{ maxWidth: "860px" }}>
        {/* Subject */}
        <h1 style={{
          fontSize: "26px", fontFamily: "Cinzel, serif",
          color: "var(--text-bright)", marginBottom: "24px", letterSpacing: "1px", lineHeight: 1.3
        }}>{selectedMail.subject}</h1>

        {/* Sender Meta Row */}
        <div style={{
          display: "flex", alignItems: "center", gap: "16px",
          marginBottom: "32px", paddingBottom: "24px",
          borderBottom: "1px solid var(--border-gold)"
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
            color: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: "900", fontSize: "20px",
            flexShrink: 0, boxShadow: "var(--glow-subtle)"
          }}>
            {selectedMail.senderEmail?.[0]?.toUpperCase()}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px" }}>
                {selectedMail.senderEmail}
              </span>
              <span style={{
                fontSize: "11px", background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                color: "#fff", padding: "2px 10px", borderRadius: "10px", fontWeight: "800", letterSpacing: "0.5px"
              }}>
                SENT
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span>To: <strong style={{ color: "var(--gold-mid)" }}>{selectedMail.receiverEmail}</strong></span>
              <span>•</span>
              <span>{selectedMail.time}</span>
              {selectedMail.cid && (
                <>
                  <span>•</span>
                  <span style={{ color: "var(--gold-mid)", fontSize: "11px", fontWeight: "700" }}>📦 IPFS</span>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => updateMailInStore(selectedMail.id, { isStarred: !selectedMail.isStarred })}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", borderRadius: "50%", transition: "background 0.2s" }}
              title="Star"
            >
              <Star size={18} fill={selectedMail.isStarred ? "var(--gold-mid)" : "none"} color="var(--gold-mid)" />
            </button>
            <button
              onClick={() => updateMailInStore(selectedMail.id, { status: "trash", senderStatus: "deleted" })}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", borderRadius: "50%", transition: "background 0.2s" }}
              title="Delete"
            >
              <Trash2 size={18} color="var(--text-muted)" />
            </button>
          </div>
        </div>

        {/* Message Body */}
        <div style={{ minHeight: "300px" }}>
          {selectedMail.isEncrypted && !selectedMail.isDecrypted ? (
            <div style={{ 
              padding: "48px 56px", background: "var(--bg-vault)", 
              backdropFilter: "blur(20px)", border: "1px solid var(--border-gold)", 
              borderRadius: "28px", maxWidth: "860px", 
              boxShadow: "0 30px 80px rgba(0,0,0,0.2), var(--glow-gold-subtle)",
              animation: "slideRight 0.6s cubic-bezier(0.23, 1, 0.32, 1) both",
              position: "relative", overflow: "hidden"
            }}>
              {/* Subtle Decorative Background Scan Lines */}
              <div style={{ position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none", background: "repeating-linear-gradient(0deg, transparent, transparent 2px, var(--gold-mid) 3px)" }} />
              
              <div style={{ display: "flex", gap: "48px", alignItems: "flex-start", position: "relative" }}>
                <div style={{ flexShrink: 0, marginTop: "8px" }}>
                   <div style={{ position: "relative", width: "80px", height: "80px" }}>
                      <div style={{ position: "absolute", inset: -15, background: "var(--gold-mid)", opacity: 0.08, borderRadius: "50%", animation: "pulse 3s infinite" }} />
                      <Shield size={80} color="var(--gold-mid)" strokeWidth={1} style={{ position: "relative", opacity: 0.9 }} />
                      <div style={{ position: "absolute", bottom: "-2px", right: "-2px", background: "var(--gold-rich)", borderRadius: "50%", padding: "6px", boxShadow: "var(--shadow-deep)" }}>
                        <Lock size={18} color="#000" />
                      </div>
                   </div>
                   <div style={{ marginTop: "24px", textAlign: "center" }}>
                      <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--gold-mid)", opacity: 0.6, letterSpacing: "2px" }}>PGP-2048</div>
                      <div style={{ fontSize: "8px", fontWeight: "700", color: "var(--gold-mid)", opacity: 0.4, marginTop: "4px" }}>RSA/AES-256</div>
                   </div>
                </div>

                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "24px", color: "var(--text-bright)", marginBottom: "12px", letterSpacing: "2px" }}>SECURE IDENTITY VAULT</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px", lineHeight: "1.7", maxWidth: "500px" }}>
                    This communication is end-to-end encrypted. Please authenticate with your private passphrase to decrypt the decentralized IPFS payload.
                  </p>

                  <div style={{ position: "relative", maxWidth: "440px" }}>
                    <input 
                      type="password" 
                      placeholder="Enter Vault Passphrase..." 
                      value={passInput}
                      onChange={(e) => setPassInput(e.target.value)}
                      style={{ 
                        width: "100%", background: "var(--bg-vault-input)", 
                        border: "1px solid rgba(212,160,23,0.2)", borderRadius: "14px", 
                        padding: "18px 24px", color: "var(--gold-mid)", outline: "none",
                        fontSize: "15px", fontFamily: "monospace", letterSpacing: "3px",
                        boxShadow: "inset 0 4px 10px rgba(0,0,0,0.3)",
                        transition: "all 0.3s"
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = "var(--gold-mid)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "rgba(212,160,23,0.2)")}
                    />
                    {passError && <div style={{ color: "#e84234", fontSize: "11px", fontWeight: "600", marginTop: "8px", paddingLeft: "4px" }}>{passError}</div>}
                    
                    <button 
                      onClick={decryptMail}
                      disabled={decrypting || !passInput}
                      style={{
                        marginTop: "24px", width: "100%",
                        background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                        border: "none", borderRadius: "14px", padding: "18px",
                        color: "#000", fontWeight: "900", fontSize: "14px",
                        cursor: decrypting || !passInput ? "not-allowed" : "pointer", 
                        boxShadow: "var(--glow-gold)", transition: "all 0.3s",
                        textTransform: "uppercase", letterSpacing: "2px",
                        opacity: decrypting ? 0.7 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "12px"
                      }}
                      onMouseOver={e => { if(!decrypting) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 15px 40px rgba(212,160,23,0.4)"; }}}
                      onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--glow-gold)"; }}
                    >
                      {decrypting ? "AUTHENTICATING..." : <><Lock size={16} strokeWidth={3} /> UNLOCK PAYLOAD</>}
                    </button>
                  </div>

                  <div style={{ marginTop: "32px", display: "flex", gap: "16px", opacity: 0.5 }}>
                     <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50" }} /> SYSTEM READY
                     </div>
                     <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50" }} /> GUN DATA SYNCED
                     </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              whiteSpace: "pre-wrap", lineHeight: "1.9", fontSize: "15px",
              color: "var(--text-bright)", fontFamily: "Inter, Raleway, sans-serif",
              maxWidth: "760px"
            }}>
              {selectedMail.message}
            </div>
          )}
        </div>

        {/* Attachments */}
        {selectedMail.attachments && selectedMail.attachments.length > 0 && (
          <div style={{ marginTop: "48px", padding: "28px", background: "var(--bg-card)", borderRadius: "16px", border: "1px solid var(--border-gold)" }}>
            <h3 style={{ fontFamily: "Cinzel, serif", fontSize: "13px", color: "var(--gold-mid)", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Paperclip size={14} /> SENT ATTACHMENTS
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
              {selectedMail.attachments.map((att: any, i: number) => (
                <div key={i} style={{
                  padding: "14px", border: "1px solid var(--border-gold)",
                  borderRadius: "12px", display: "flex", gap: "12px", alignItems: "center",
                  transition: "all 0.2s", background: "var(--bg-panel)"
                }}
                  onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--glow-subtle)"; }}
                  onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ background: "rgba(212,160,23,0.1)", padding: "8px", borderRadius: "8px", color: "var(--gold-mid)" }}>
                    <FileText size={18} />
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>IPFS FILE</div>
                  </div>
                  <button
                    onClick={() => handleDownload(att.cid, att.name)}
                    style={{
                      background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                      border: "none", borderRadius: "50%", width: "30px", height: "30px",
                      color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                    <Download size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivery Metadata Footer */}
        <div style={{
          marginTop: "40px", padding: "20px 24px",
          background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
          borderRadius: "12px", borderLeft: "3px solid var(--gold-mid)",
          opacity: 0.85
        }}>
          <h4 style={{ fontSize: "10px", fontWeight: "800", color: "var(--gold-mid)", letterSpacing: "1.5px", marginBottom: "12px" }}>
            DELIVERY INTEGRITY
          </h4>
          <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>IPFS Content ID</div>
              <div style={{ fontSize: "11px", color: "var(--text-bright)", fontFamily: "monospace" }}>{selectedMail.cid || "Local Content"}</div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>Protocol</div>
              <div style={{ fontSize: "11px", color: "var(--text-bright)" }}>PGP / RSA-4096 (E2E)</div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>Status</div>
              <div style={{ fontSize: "11px", color: "#4caf6e", fontWeight: "700" }}>✓ DELIVERED</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Main Layout ──────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {!selectedMail && (
        <>
          <PageHeader
            title="Sent"
            count={sentMails.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Search sent mail..."
          />

          {/* Gmail-style Toolbar */}
          <div className="folder-toolbar">
            <button className="toolbar-btn" onClick={toggleSelectAll}>
              {selectedIds.length === threads.length && threads.length > 0 ? (
                <CheckSquare size={18} color="var(--gold-mid)" />
              ) : (
                <Square size={18} />
              )}
            </button>
            <button
              className={`toolbar-btn ${isRefreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
            >
              <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button className="toolbar-btn">
              <MoreVertical size={18} />
            </button>

            {selectedIds.length > 0 && (
              <>
                <div className="toolbar-divider" />
                <button className="toolbar-btn" title="Archive Selected">
                  <Archive size={18} />
                </button>
                <button className="toolbar-btn" title="Delete Selected" onClick={() => {
                  selectedIds.forEach(id => updateMailInStore(id, { status: "trash", senderStatus: "deleted" }))
                  setSelectedIds([])
                }}>
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* List + Reader */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedMail ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {loadingMail && (
              <div style={{
                position: "absolute", inset: 0, background: "var(--bg-card)",
                opacity: 0.8, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
              }}>
                <div style={{ color: "var(--gold-mid)", fontWeight: "700", fontSize: "14px" }}>Loading...</div>
              </div>
            )}
            {renderReader()}
          </div>
        ) : (
          <div className="mail-list" style={{ flex: 1, overflowY: "auto" }}>
            {threads.length === 0 ? (
              <div style={{ padding: "100px 40px", textAlign: "center", color: "var(--text-muted)" }}>
                <Send size={48} style={{ opacity: 0.15, marginBottom: "20px", display: "block", margin: "0 auto 20px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600" }}>
                  {searchQuery ? "No results found." : "You haven't sent any mail yet."}
                </div>
                <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "8px" }}>Sent messages will appear here.</div>
              </div>
            ) : (
              threads.map((thread) => {
                const mail = thread.lastMessage
                const isSelected = selectedIds.includes(thread.id)
                return (
                  <div
                    key={thread.id}
                    className={`mail-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => openMail(thread)}
                  >
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", width: "70px", paddingLeft: "12px", position: "relative", zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                      <div
                        className={`mail-row-checkbox ${isSelected ? 'checked' : ''}`}
                        onClick={(e) => toggleSelect(e, thread.id)}
                        style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px", marginRight: "8px" }}
                      >
                        {isSelected && <CheckSquare size={12} color="#000" />}
                      </div>
                      <Star
                        size={16}
                        className={`star-icon ${mail.isStarred ? 'starred' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateMailInStore(mail.id, { isStarred: !mail.isStarred })
                        }}
                        fill={mail.isStarred ? "var(--gold-mid)" : "none"}
                        color="var(--gold-mid)"
                      />
                    </div>

                    <div className="mail-sender" style={{ width: "180px", flexShrink: 0 }}>
                      To: {mail.receiverEmail?.split("@")[0]}
                      {thread.count > 1 && (
                        <span style={{
                          fontSize: "10px", padding: "1px 5px", borderRadius: "10px",
                          background: "rgba(212,160,23,0.1)", color: "var(--gold-mid)",
                          fontWeight: "800", marginLeft: "6px", border: "1px solid rgba(212,160,23,0.2)"
                        }}>
                          {thread.count}
                        </span>
                      )}
                    </div>

                    <div className="mail-content">
                      <span className="mail-subject">{thread.subject}</span>
                      <span className="mail-snippet">
                        {mail.status === "queued"
                          ? "📴 Queued"
                          : mail.cid
                            ? "📦 Sent via IPFS"
                            : "🔒 Encrypted"}
                        {thread.messages.some((m: any) => m.attachmentCount > 0)
                          ? " · 📎 Attachments"
                          : ""}
                      </span>
                    </div>

                    {/* Hover Actions */}
                    <div className="row-hover-actions">
                      <button className="hover-icon-btn" title="Archive">
                        <Archive size={16} />
                      </button>
                      <button
                        className="hover-icon-btn delete"
                        title="Delete"
                        onClick={(e) => handleDelete(e, mail.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mail-date" style={{ width: "100px", textAlign: "right", paddingRight: "16px" }}>
                      {mail.time?.split(",")[0]}
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
