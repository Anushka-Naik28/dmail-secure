"use client"

import { useEffect, useState } from "react"
import { getThreads, subscribe, updateMailInStore, type Thread } from "@/utils/mailStore"
import { getCachedMail } from "@/utils/mailCache"
import { getLocalNode } from "@/utils/ipfs"
import PageHeader from "@/components/PageHeader"
import {
  RefreshCw, MoreVertical, Trash2, CheckSquare, Square,
  Star, ChevronLeft, Shield, Lock, Inbox, AlertTriangle
} from "lucide-react"

export default function TrashPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedMail, setSelectedMail] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMail, setLoadingMail] = useState(false)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)
    setThreads(getThreads("trash"))
    const unsub = subscribe(() => setThreads(getThreads("trash")))
    return () => { unsub() }
  }, [])

  const filteredThreads = threads.filter((t) =>
    t.messages.some(m =>
      (m.subject?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (m.senderEmail?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    )
  )

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
  }

  const restoreMail    = (id: string) => { updateMailInStore(id, { status: "inbox" }); setSelectedMail(null) }
  const deletePermanent = (id: string) => { updateMailInStore(id, { status: "purged", purgedAt: Date.now() }); setShowConfirm(null); setSelectedMail(null) }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // ── Inline Reader ──────────────────────────────────────────
  const renderReader = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-panel)", animation: "fadeUp 0.3s ease both" }}>
      <div style={{ marginBottom: "28px" }}>
        <button
          onClick={() => setSelectedMail(null)}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)", fontSize: "13px", fontWeight: "800", letterSpacing: "1px", padding: "8px 0", transition: "opacity 0.2s" }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.7")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          <ChevronLeft size={16} /> TRASH
        </button>
      </div>

      <div style={{ maxWidth: "860px" }}>
        {/* Warning Banner */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: "rgba(232,66,52,0.06)", border: "1px solid rgba(232,66,52,0.2)", borderRadius: "10px", marginBottom: "24px" }}>
          <AlertTriangle size={14} color="#e84234" />
          <span style={{ fontSize: "12px", color: "#e84234", fontWeight: "600" }}>This message is in Trash — it has not been permanently deleted yet.</span>
        </div>

        <h1 style={{ fontSize: "26px", fontFamily: "Cinzel, serif", color: "var(--text-bright)", marginBottom: "24px", letterSpacing: "1px", lineHeight: 1.3, opacity: 0.7 }}>
          {selectedMail.subject || "(No subject)"}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px", paddingBottom: "24px", borderBottom: "1px solid var(--border-gold)" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "20px", flexShrink: 0, opacity: 0.7 }}>
            {selectedMail.senderEmail?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px", marginBottom: "4px" }}>{selectedMail.senderEmail}</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              To: <strong style={{ color: "var(--gold-mid)" }}>{selectedMail.receiverEmail}</strong>
              <span style={{ margin: "0 8px" }}>•</span>{selectedMail.time}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => restoreMail(selectedMail.id)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", color: "#4caf6e", fontSize: "12px", fontWeight: "700" }}>
              <Inbox size={13} /> Restore
            </button>
            <button onClick={() => setShowConfirm(selectedMail.id)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(232,66,52,0.08)", border: "1px solid rgba(232,66,52,0.3)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", color: "#e84234", fontSize: "12px", fontWeight: "700" }}>
              <Trash2 size={13} /> Delete Forever
            </button>
          </div>
        </div>

        <div style={{ minHeight: "300px" }}>
          {selectedMail.isEncrypted && !selectedMail.isDecrypted ? (
            <div style={{ padding: "48px 40px", background: "var(--bg-vault)", border: "1px solid var(--border-gold)", borderRadius: "16px", maxWidth: "600px" }}>
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <Shield size={48} color="var(--gold-mid)" strokeWidth={1} />
                <div>
                  <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "18px", color: "var(--text-bright)", marginBottom: "8px" }}>ENCRYPTED CONTENT</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.7 }}>Open from Inbox to decrypt.</p>
                  <div style={{ marginTop: "16px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(212,160,23,0.1)", padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-gold)", color: "var(--gold-mid)", fontSize: "12px", fontWeight: "700" }}>
                    <Lock size={12} /> PGP Encrypted
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.9", fontSize: "15px", color: "var(--text-bright)", fontFamily: "Inter, Raleway, sans-serif", maxWidth: "760px", opacity: 0.8 }}>
              {selectedMail.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {!selectedMail && (
        <>
          <PageHeader
            title="Trash"
            count={threads.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Search trash..."
            rightElement={
              threads.length > 0 && (
                <button onClick={() => setShowConfirm("all")} style={{ padding: "6px 14px", background: "rgba(217,48,37,0.07)", border: "1px solid rgba(217,48,37,0.22)", borderRadius: "8px", cursor: "pointer", fontSize: "12px", color: "#e84234", fontFamily: "Raleway, sans-serif", fontWeight: "700" }}>
                  Empty Trash
                </button>
              )
            }
          />
          <div className="folder-toolbar">
            <button className="toolbar-btn" onClick={() => selectedIds.length === filteredThreads.length ? setSelectedIds([]) : setSelectedIds(filteredThreads.map(t => t.id))}>
              {selectedIds.length === filteredThreads.length && filteredThreads.length > 0 ? <CheckSquare size={18} color="var(--gold-mid)" /> : <Square size={18} />}
            </button>
            <button className="toolbar-btn" onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 1000) }}>
              <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button className="toolbar-btn"><MoreVertical size={18} /></button>
            {selectedIds.length > 0 && (
              <>
                <div className="toolbar-divider" />
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--gold-mid)" }}>{selectedIds.length} selected</span>
                <button className="toolbar-btn" title="Restore selected" onClick={() => { selectedIds.forEach(id => restoreMail(id)); setSelectedIds([]) }}><Inbox size={18} /></button>
                <button className="toolbar-btn" title="Delete forever" onClick={() => setShowConfirm("bulk")}><Trash2 size={18} /></button>
              </>
            )}
          </div>
          {filteredThreads.length > 0 && (
            <div style={{ margin: "8px 16px", padding: "8px 12px", background: "rgba(232,66,52,0.05)", border: "1px solid rgba(232,66,52,0.2)", borderRadius: "8px", fontSize: "11px", color: "#e84234" }}>
              🗑️ Messages in Trash are not automatically deleted.
            </div>
          )}
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
                <Trash2 size={48} style={{ opacity: 0.15, display: "block", margin: "0 auto 20px" }} />
                <div style={{ fontSize: "18px", fontWeight: "600" }}>{searchQuery ? "No results found." : "Trash is empty."}</div>
                <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "8px" }}>Deleted messages will appear here.</div>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const mail = thread.lastMessage
                const isSelected = selectedIds.includes(thread.id)
                return (
                  <div key={thread.id} className={`mail-row ${isSelected ? 'selected' : ''}`} style={{ opacity: 0.8 }} onClick={() => openMail(thread)}>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", width: "72px", paddingLeft: "12px", position: "relative", zIndex: 1 }} onClick={e => e.stopPropagation()}>
                      <div className={`mail-row-checkbox ${isSelected ? 'checked' : ''}`} onClick={(e) => toggleSelect(e, thread.id)} style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px", marginRight: "8px" }}>
                        {isSelected && <CheckSquare size={12} color="#000" />}
                      </div>
                      <Star size={16} fill="none" color="var(--text-dim)" />
                    </div>
                    <div className="mail-sender" style={{ width: "180px", flexShrink: 0, opacity: 0.7 }}>
                      {mail.senderEmail?.split("@")[0]}
                      {thread.count > 1 && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "10px", background: "rgba(217,48,37,0.1)", color: "#e84234", fontWeight: "800", marginLeft: "6px", border: "1px solid rgba(217,48,37,0.2)" }}>{thread.count}</span>}
                    </div>
                    <div className="mail-content">
                      <span className="mail-subject" style={{ opacity: 0.6 }}>{thread.subject || "(No subject)"}</span>
                      <span className="mail-snippet"> — 🔒 Encrypted</span>
                    </div>
                    <div className="row-hover-actions">
                      <button className="hover-icon-btn" title="Restore to Inbox" onClick={e => { e.stopPropagation(); restoreMail(mail.id) }}><Inbox size={16} /></button>
                      <button className="hover-icon-btn delete" title="Delete Forever" onClick={e => { e.stopPropagation(); setShowConfirm(mail.id) }}><Trash2 size={16} /></button>
                    </div>
                    <div className="mail-date" style={{ width: "100px", textAlign: "right", paddingRight: "16px", opacity: 0.6 }}>{mail.time?.split(",")[0]}</div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
            <h3>{showConfirm === "all" || showConfirm === "bulk" ? "Delete Forever?" : "Delete Forever?"}</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px", lineHeight: 1.6 }}>
              {showConfirm === "all"
                ? `This will permanently delete all ${threads.length} messages in Trash.`
                : showConfirm === "bulk"
                  ? `This will permanently delete ${selectedIds.length} selected messages.`
                  : "This action cannot be undone."}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(null)}>Cancel</button>
              <button
                className="btn"
                style={{ background: "linear-gradient(135deg, #8b1a1a, #c0392b)" }}
                onClick={() => {
                  if (showConfirm === "all") {
                    threads.forEach(t => t.messages.forEach(m => updateMailInStore(m.id, { status: "purged", purgedAt: Date.now() })))
                  } else if (showConfirm === "bulk") {
                    selectedIds.forEach(id => updateMailInStore(id, { status: "purged", purgedAt: Date.now() }))
                    setSelectedIds([])
                  } else {
                    deletePermanent(showConfirm)
                  }
                  setShowConfirm(null)
                }}
              >
                {showConfirm === "all" ? "Empty Trash" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}