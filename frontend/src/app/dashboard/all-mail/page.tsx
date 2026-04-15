"use client"

import { useEffect, useState, useMemo } from "react"
import { getThreads, subscribe, updateMailInStore, type Thread } from "@/utils/mailStore"
import { exportMailFromIPFS, getLocalNode } from "@/utils/ipfs"
import { getCachedMail } from "@/utils/mailCache"
import PageHeader from "@/components/PageHeader"
import {
  RefreshCw, MoreVertical, Archive, Trash2, CheckSquare, Square,
  Star, ChevronLeft, Download, FileText, Paperclip, Shield, Lock,
  Inbox, Send, Mail
} from "lucide-react"

export default function AllMailPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedMail, setSelectedMail] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMail, setLoadingMail] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)

    const refresh = () => {
      setThreads(getThreads(["inbox", "sent", "archived", "spam", "request", "important"]))
    }

    refresh()
    const unsub = subscribe(refresh)
    return () => unsub()
  }, [])

  const filteredThreads = useMemo(() => {
    return threads.filter((t) =>
      t.messages.some(m =>
        [m.subject, m.senderEmail, m.receiverEmail].some(field =>
          field?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    )
  }, [threads, searchQuery])

  const hasValidCid = (mail: any) =>
    mail?.cid && (mail.cid.startsWith("Qm") || mail.cid.startsWith("bafy"))

  const openMail = async (thread: Thread) => {
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

    // Mark as read
    thread.messages.forEach(m => {
      if (m.receiverEmail === userEmail) updateMailInStore(m.id, { isRead: true })
    })
  }

  const handleDownload = async (cid: string, name: string) => {
    try {
      await exportMailFromIPFS(cid, name)
    } catch { alert("Download failed.") }
  }

  const getStatusBadge = (mail: any) => {
    const isSent = mail.senderEmail === userEmail
    if (isSent) return { label: "Sent", icon: <Send size={9} />, color: "var(--gold-rich)" }
    switch (mail.status) {
      case "inbox": return { label: "Inbox", icon: <Inbox size={9} />, color: "#4caf6e" }
      case "spam": return { label: "Spam", icon: null, color: "#e84234" }
      case "archived": return { label: "Archive", icon: <Archive size={9} />, color: "var(--gold-mid)" }
      default: return { label: mail.status || "Mail", icon: <Mail size={9} />, color: "var(--text-dim)" }
    }
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredThreads.length) setSelectedIds([])
    else setSelectedIds(filteredThreads.map(t => t.id))
  }

  // ── Inline Reader ──────────────────────────────────────────
  const renderReader = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-panel)", animation: "fadeUp 0.3s ease both" }}>
      {/* Back Navigation */}
      <div style={{ marginBottom: "28px" }}>
        <button
          onClick={() => setSelectedMail(null)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--gold-mid)", fontSize: "13px", fontWeight: "800",
            letterSpacing: "1px", padding: "8px 0", transition: "opacity 0.2s"
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.7")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          <ChevronLeft size={16} /> ALL MAIL
        </button>
      </div>

      <div style={{ maxWidth: "860px" }}>
        {/* Subject */}
        <h1 style={{
          fontSize: "26px", fontFamily: "Cinzel, serif",
          color: "var(--text-bright)", marginBottom: "24px",
          letterSpacing: "1px", lineHeight: 1.3
        }}>{selectedMail.subject || "(No subject)"}</h1>

        {/* Meta Row */}
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px" }}>
                {selectedMail.senderEmail === userEmail ? "You" : selectedMail.senderEmail}
              </span>
              {(() => {
                const badge = getStatusBadge(selectedMail)
                return (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    fontSize: "10px", background: "rgba(212,160,23,0.1)",
                    color: badge.color, border: `1px solid ${badge.color}30`,
                    padding: "2px 8px", borderRadius: "10px", fontWeight: "800", letterSpacing: "0.5px"
                  }}>
                    {badge.icon} {badge.label.toUpperCase()}
                  </span>
                )
              })()}
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span>To: <strong style={{ color: "var(--gold-mid)" }}>{selectedMail.receiverEmail}</strong></span>
              <span>•</span>
              <span>{selectedMail.time}</span>
              {selectedMail.cid && <><span>•</span><span style={{ color: "var(--gold-mid)", fontSize: "11px", fontWeight: "700" }}>📦 IPFS</span></>}
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => updateMailInStore(selectedMail.id, { isStarred: !selectedMail.isStarred })}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", borderRadius: "50%", transition: "background 0.2s" }}
              title="Star"
            >
              <Star size={18} fill={selectedMail.isStarred ? "var(--gold-mid)" : "none"} color="var(--gold-mid)" />
            </button>
            <button
              onClick={() => { updateMailInStore(selectedMail.id, { status: "archived" }); setSelectedMail(null) }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", borderRadius: "50%", transition: "background 0.2s" }}
              title="Archive"
            >
              <Archive size={18} color="var(--text-muted)" />
            </button>
            <button
              onClick={() => { updateMailInStore(selectedMail.id, { status: "trash" }); setSelectedMail(null) }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", borderRadius: "50%", transition: "background 0.2s" }}
              title="Delete"
            >
              <Trash2 size={18} color="var(--text-muted)" />
            </button>
          </div>
        </div>

        {/* Message Body */}
        <div style={{ minHeight: "300px" }}>
          {(selectedMail.isEncrypted && !selectedMail.isDecrypted) || selectedMail.message?.includes("-----BEGIN PGP MESSAGE-----") ? (
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
                    This message is end-to-end encrypted. Open from Inbox to decrypt with your passphrase.
                  </p>
                  <div style={{
                    marginTop: "16px", display: "inline-flex", alignItems: "center", gap: "6px",
                    background: "rgba(212,160,23,0.1)", padding: "8px 16px", borderRadius: "8px",
                    border: "1px solid var(--border-gold)", color: "var(--gold-mid)", fontSize: "12px", fontWeight: "700"
                  }}>
                    <Lock size={12} /> PGP / RSA-4096 Encrypted
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
              <Paperclip size={14} /> ATTACHMENTS
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
              {selectedMail.attachments.map((att: any, i: number) => (
                <div key={i} style={{
                  padding: "14px", border: "1px solid var(--border-gold)",
                  borderRadius: "12px", display: "flex", gap: "12px", alignItems: "center",
                  transition: "all 0.2s", background: "var(--bg-panel)"
                }}
                  onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--glow-subtle)" }}
                  onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none" }}>
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

        {/* Footer Metadata */}
        <div style={{
          marginTop: "40px", padding: "20px 24px",
          borderLeft: "3px solid var(--gold-mid)", background: "var(--bg-panel)",
          border: "1px solid var(--border-gold)", borderRadius: "12px", opacity: 0.85
        }}>
          <h4 style={{ fontSize: "10px", fontWeight: "800", color: "var(--gold-mid)", letterSpacing: "1.5px", marginBottom: "12px" }}>
            DECENTRALIZED MESSAGE INTEGRITY
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
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>Verification</div>
              <div style={{ fontSize: "11px", color: "#4caf6e", fontWeight: "700" }}>✓ VERIFIED AUTHENTIC</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Main List View ─────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {!selectedMail && (
        <>
          <PageHeader
            title="All Mail"
            count={threads.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Search in all mail..."
          />

          {/* Gmail-style Toolbar */}
          <div className="folder-toolbar">
            <button className="toolbar-btn" onClick={toggleSelectAll} title="Select all">
              {selectedIds.length === filteredThreads.length && filteredThreads.length > 0
                ? <CheckSquare size={18} color="var(--gold-mid)" />
                : <Square size={18} />}
            </button>
            <button
              className="toolbar-btn"
              onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 1000) }}
            >
              <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button className="toolbar-btn"><MoreVertical size={18} /></button>

            {selectedIds.length > 0 && (
              <>
                <div className="toolbar-divider" />
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--gold-mid)", padding: "0 4px" }}>
                  {selectedIds.length} selected
                </span>
                <button className="toolbar-btn" title="Archive selected"
                  onClick={() => { selectedIds.forEach(id => updateMailInStore(id, { status: "archived" })); setSelectedIds([]) }}>
                  <Archive size={18} />
                </button>
                <button className="toolbar-btn" title="Delete selected"
                  onClick={() => { selectedIds.forEach(id => updateMailInStore(id, { status: "trash" })); setSelectedIds([]) }}>
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedMail ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {loadingMail && (
              <div style={{
                position: "absolute", inset: 0, background: "var(--bg-card)",
                opacity: 0.85, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
              }}>
                <div style={{ color: "var(--gold-mid)", fontWeight: "700", fontSize: "14px" }}>Loading...</div>
              </div>
            )}
            {renderReader()}
          </div>
        ) : (
          <div className="mail-list" style={{ flex: 1, overflowY: "auto" }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: "100px 40px", textAlign: "center", color: "var(--text-muted)" }}>
                <Mail size={48} style={{ opacity: 0.15, display: "block", margin: "0 auto 20px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600" }}>
                  {searchQuery ? "No matching conversations." : "Your All Mail archive is empty."}
                </div>
                <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "8px" }}>All messages across every folder appear here.</div>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const mail = thread.lastMessage
                const isSelected = selectedIds.includes(thread.id)
                const isRead = thread.isRead
                const badge = getStatusBadge(mail)
                const isSent = mail.senderEmail === userEmail

                return (
                  <div
                    key={thread.id}
                    className={`mail-row ${!isRead ? 'unread' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => openMail(thread)}
                  >
                    {/* Checkbox + Star */}
                    <div
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", width: "72px", paddingLeft: "12px", position: "relative", zIndex: 1 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div
                        className={`mail-row-checkbox ${isSelected ? 'checked' : ''}`}
                        onClick={(e) => toggleSelect(e, thread.id)}
                        style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px", marginRight: "8px", flexShrink: 0 }}
                      >
                        {isSelected && <CheckSquare size={12} color="#000" />}
                      </div>
                      <Star
                        size={16}
                        className={`star-icon ${thread.isStarred ? 'starred' : ''}`}
                        onClick={e => { e.stopPropagation(); updateMailInStore(mail.id, { isStarred: !thread.isStarred }) }}
                        fill={thread.isStarred ? "var(--gold-mid)" : "none"}
                        color="var(--gold-mid)"
                      />
                    </div>

                    {/* Sender */}
                    <div className="mail-sender" style={{ width: "180px", flexShrink: 0 }}>
                      {isSent ? `To: ${mail.receiverEmail?.split("@")[0]}` : mail.senderEmail?.split("@")[0]}
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

                    {/* Subject + Snippet */}
                    <div className="mail-content">
                      <span className="mail-subject">{thread.subject || "(No subject)"}</span>
                      <span className="mail-snippet"> — 🔒 Encrypted Content</span>
                    </div>

                    {/* Status Badge */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", paddingRight: "12px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        fontSize: "9px", fontWeight: "800", textTransform: "uppercase",
                        padding: "2px 7px", borderRadius: "8px", letterSpacing: "0.5px",
                        background: "rgba(212,160,23,0.08)",
                        color: badge.color,
                        border: `1px solid ${badge.color}28`
                      }}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    {/* Hover Actions */}
                    <div className="row-hover-actions">
                      <button className="hover-icon-btn" title="Archive"
                        onClick={e => { e.stopPropagation(); updateMailInStore(mail.id, { status: "archived" }) }}>
                        <Archive size={16} />
                      </button>
                      <button className="hover-icon-btn delete" title="Delete"
                        onClick={e => { e.stopPropagation(); updateMailInStore(mail.id, { status: "trash" }) }}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Date */}
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