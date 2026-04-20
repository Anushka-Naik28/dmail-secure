"use client"

import { useEffect, useState } from "react"
import { getThreads, subscribe, updateMailInStore, type Thread } from "@/utils/mailStore"
import { trustSender } from "@/utils/spamFilter"
import { 
  ShieldAlert, Inbox, RefreshCw, MoreVertical, Archive, 
  Trash2, CheckSquare, Square, Star, CheckCircle, XCircle 
} from "lucide-react"
import PageHeader from "@/components/PageHeader"
import ConversationView from "@/components/ConversationView"

type Tab = "spam" | "request"

export default function SpamPage() {
  const [activeTab, setActiveTab]       = useState<Tab>("spam")
  const [spamThreads, setSpamThreads]       = useState<Thread[]>([])
  const [requestThreads, setRequestThreads] = useState<Thread[]>([])
  const [searchQuery, setSearchQuery]       = useState("")
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [selectedIds, setSelectedIds]       = useState<string[]>([])
  const [isRefreshing, setIsRefreshing]     = useState(false)
  
  const [showEmptyModal, setShowEmptyModal]   = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => {
      setSpamThreads(getThreads("spam"))
      setRequestThreads(getThreads("request"))
    }
    refresh()
    const unsub = subscribe(refresh)
    return () => unsub()
  }, [])

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

  const getUser = () => JSON.parse(localStorage.getItem("user") || "{}")

  const restoreToInbox = (mailId: string, senderEmail: string) => {
    trustSender(senderEmail, getUser().email)
    updateMailInStore(mailId, { status: "inbox", flaggedReason: "", spamScore: 0 })
    if (selectedThread?.id === mailId) setSelectedThread(null)
  }

  const deleteForever = (mailId: string) => {
    updateMailInStore(mailId, { status: "purged", purgedAt: Date.now() })
    setShowDeleteModal(null)
    if (selectedThread?.id === mailId) setSelectedThread(null)
  }

  const acceptRequest = (mailId: string, senderEmail: string) => {
    trustSender(senderEmail, getUser().email)
    updateMailInStore(mailId, { status: "inbox", flaggedReason: "", spamScore: 0 })
    if (selectedThread?.id === mailId) setSelectedThread(null)
  }

  const rejectRequest = (mailId: string) => {
    updateMailInStore(mailId, { status: "purged", purgedAt: Date.now() })
    setShowRejectModal(null)
    if (selectedThread?.id === mailId) setSelectedThread(null)
  }

  const emptySpam = () => {
    spamThreads.forEach((t) =>
      t.messages.forEach(m => updateMailInStore(m.id, { status: "purged", purgedAt: Date.now() }))
    )
    setShowEmptyModal(false)
    setSelectedThread(null)
    setSelectedIds([])
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const openThread = async (thread: Thread) => {
    if (selectedThread?.id === thread.id) return
    setSelectedThread(thread)

    // Check if we need to fetch bodies for any messages in the thread
    const needsFetch = thread.messages.some(m => !m.message && m.cid)
    if (!needsFetch) return

    try {
      const { fetchFromIPFS } = await import("@/utils/ipfs")
      const updatedMessages = await Promise.all(thread.messages.map(async (m) => {
        if (!m.message && m.cid) {
          try {
            const data = await fetchFromIPFS(m.cid)
            const updated = { ...m, ...data }
            updateMailInStore(m.id, updated) // Cache it
            return updated
          } catch (e) {
            console.warn("Failed to fetch body for", m.id, e)
            return m
          }
        }
        return m
      }))

      setSelectedThread({ ...thread, messages: updatedMessages, lastMessage: updatedMessages[updatedMessages.length - 1] })
    } catch (err) {
      console.error("Thread fetch error:", err)
    }
  }

  const activeThreads = activeTab === "spam" ? spamThreads : requestThreads

  const filteredThreads = activeThreads.filter(
    (t) =>
      t.messages.some(m => 
        m.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.senderEmail?.toLowerCase().includes(searchQuery.toLowerCase())
      )
  )

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredThreads.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredThreads.map(t => t.id))
    }
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const scoreColor = (score: number) =>
    score >= 40 ? "#e84234" : score >= 20 ? "var(--gold-mid)" : "var(--text-muted)"

  // ── Split view ───────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* LEFT — list */}
      <div style={{
        width: selectedThread ? "350px" : "100%",
        minWidth: selectedThread ? "320px" : undefined,
        flexShrink: 0,
        borderRight: selectedThread ? "1px solid var(--border-gold)" : "none",
        display: "flex", flexDirection: "column",
        overflow: "hidden", transition: "width 0.2s ease",
      }}>

        <PageHeader 
          title={activeTab === "spam" ? "Spam" : "Requests"}
          count={activeThreads.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder={activeTab === "spam" ? "Search spam..." : "Search requests..."}
        />

        {/* Gmail-style Horizontal Tabs */}
        <div className="folder-tabs-container">
          <div 
            className={`folder-tab-item spam ${activeTab === 'spam' ? 'active' : ''}`}
            onClick={() => { setActiveTab("spam"); setSelectedThread(null); setSelectedIds([]) }}
          >
            <ShieldAlert size={18} className="tab-icon" />
            <span>Spam</span>
            {spamThreads.length > 0 && <span className="tab-count">{spamThreads.length}</span>}
          </div>
          <div 
            className={`folder-tab-item request ${activeTab === 'request' ? 'active' : ''}`}
            onClick={() => { setActiveTab("request"); setSelectedThread(null); setSelectedIds([]) }}
          >
            <Inbox size={18} className="tab-icon" />
            <span>Requests</span>
            {requestThreads.length > 0 && <span className="tab-count">{requestThreads.length}</span>}
          </div>
        </div>

        {/* Gmail-style Toolbar */}
        <div className="folder-toolbar">
          <button className="toolbar-btn" onClick={toggleSelectAll}>
            {selectedIds.length === filteredThreads.length && filteredThreads.length > 0 ? (
              <CheckSquare size={18} color={activeTab === 'spam' ? "#e84234" : "var(--gold-mid)"} />
            ) : (
              <Square size={18} />
            )}
          </button>
          <button 
            className="toolbar-btn" 
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
              <button className="toolbar-btn" title="Delete Forever" onClick={() => {
                selectedIds.forEach(id => deleteForever(id))
                setSelectedIds([])
              }}>
                <Trash2 size={18} />
              </button>
              {activeTab === "spam" ? (
                <button className="toolbar-btn" title="Not Spam" onClick={() => {
                  selectedIds.forEach(id => {
                    const t = filteredThreads.find(t => t.id === id)
                    if (t) restoreToInbox(id, t.lastMessage.senderEmail)
                  })
                  setSelectedIds([])
                }}>
                  <CheckCircle size={18} color="#4caf6e" />
                </button>
              ) : (
                <button className="toolbar-btn" title="Accept Requests" onClick={() => {
                  selectedIds.forEach(id => {
                    const t = filteredThreads.find(t => t.id === id)
                    if (t) acceptRequest(id, t.lastMessage.senderEmail)
                  })
                  setSelectedIds([])
                }}>
                  <CheckCircle size={18} color="var(--gold-mid)" />
                </button>
              )}
            </>
          )}

          <div style={{ marginLeft: "auto" }}>
            {activeTab === "spam" && spamThreads.length > 0 && (
              <button
                onClick={() => setShowEmptyModal(true)}
                style={{
                  padding: "5px 12px", borderRadius: "16px", cursor: "pointer",
                  background: "rgba(217,48,37,0.08)",
                  border: "1px solid rgba(217,48,37,0.3)",
                  color: "#e84234", fontSize: "11px",
                  fontFamily: "Raleway, sans-serif", fontWeight: "600",
                }}
              >Empty Spam</button>
            )}
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          margin: "10px 16px",
          background: activeTab === "spam" ? "rgba(217,48,37,0.04)" : "rgba(212,160,23,0.04)",
          border: `1px solid ${activeTab === "spam" ? "rgba(217,48,37,0.15)" : "rgba(212,160,23,0.15)"}`,
          borderRadius: "8px", padding: "10px 16px",
          fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.5",
          flexShrink: 0,
        }}>
          {activeTab === "spam"
            ? "⚠️ Automatically filtered based on content analysis. Messages will be purged after 30 days."
            : "📬 Messages from unknown senders. Accept to move to your Inbox."}
        </div>

        {/* Mail list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredThreads.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 16px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.2 }}>
                {activeTab === "spam" ? <ShieldAlert size={48} /> : <Inbox size={48} />}
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                {searchQuery
                  ? "No results found."
                  : activeTab === "spam"
                  ? "Hooray, no spam here!"
                  : "No pending requests."}
              </p>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const mail = thread.lastMessage
              const isSelected = selectedIds.includes(thread.id)
              const senderRaw = mail.senderName || mail.senderEmail?.split("@")[0] || "Unknown"
              const senderName = senderRaw.charAt(0).toUpperCase() + senderRaw.slice(1)
              const colors = ["#d4a017", "#c9871a", "#9a6b0e", "#b8750a", "#8a5a08"]
              const avatarColor = colors[(senderName.charCodeAt(0) || 0) % colors.length]

              return (
                <div
                  key={thread.id}
                  className={`mail-row ${isSelected ? "selected" : ""} ${!thread.isRead ? "unread" : ""}`}
                  onClick={() => openThread(thread)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px 0 4px",
                    minHeight: "52px",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(212,160,23,0.07)",
                    background: isSelected ? "rgba(212,160,23,0.09)" : "transparent",
                    transition: "background 0.15s",
                    gap: 0,
                    position: "relative",
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%",
                    background: avatarColor, display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: "700", color: "#000",
                    fontSize: "14px", marginLeft: "4px", marginRight: "10px",
                  }}>
                    {senderName.charAt(0)}
                  </div>

                  {/* Star & Checkbox Area — fixed 56px */}
                  <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", width: "56px", marginRight: "8px" }}>
                    <div
                      className={`mail-row-checkbox ${isSelected ? "checked" : ""}`}
                      onClick={(e) => toggleSelect(e, thread.id)}
                      style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px" }}
                    >
                      {isSelected && <CheckSquare size={12} color="#000" />}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateMailInStore(mail.id, { isStarred: !mail.isStarred }) }}
                      className="chromeless-btn"
                      style={{ padding: "2px", opacity: mail.isStarred ? 1 : 0.35 }}
                    >
                      <Star size={15} fill={mail.isStarred ? "var(--gold-mid)" : "none"} color="var(--gold-mid)" />
                    </button>
                  </div>

                  {/* Sender — fixed 160px */}
                  <div className="mail-sender" style={{ width: "160px", flexShrink: 0, marginRight: "12px", border: "none", fontSize: "13px", fontWeight: !thread.isRead ? "700" : "500", color: !thread.isRead ? "var(--text-bright)" : "var(--text-muted)" }}>
                    {senderName}
                  </div>

                  {/* Subject + Snippet */}
                  <div className="mail-content" style={{ flex: 1, border: "none", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                    <span style={{ 
                      color: activeTab === "spam" ? "#e84234" : "var(--gold-mid)", 
                      fontSize: "9px", fontWeight: "800", flexShrink: 0,
                      padding: "1px 6px", borderRadius: "4px",
                      background: activeTab === "spam" ? "rgba(232,66,52,0.1)" : "rgba(212,160,23,0.1)",
                      border: `1px solid ${activeTab === "spam" ? "rgba(232,66,52,0.2)" : "rgba(212,160,23,0.2)"}`
                    }}>
                      {activeTab.toUpperCase()}
                    </span>
                    <span className="mail-subject" style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: !thread.isRead ? "700" : "500", flexShrink: 0, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mail.subject || "(No subject)"}
                    </span>
                    <span style={{ color: "var(--text-muted)", opacity: 0.5, margin: "0 2px", fontSize: "12px" }}>—</span>
                    <span className="mail-snippet" style={{ fontSize: "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mail.isDecrypted ? mail.message?.replace(/-----BEGIN PGP MESSAGE-----[\s\S]*-----END PGP MESSAGE-----/g, "").trim() : "🔒 Encrypted Content"}
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
      </div>

      {/* RIGHT — detail */}
      {selectedThread && (
        <div style={{
          flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
          background: "var(--bg-panel)",
        }}>
          {/* Top bar */}
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid var(--border-gold)",
            display: "flex", alignItems: "center", flexShrink: 0,
            background: "var(--bg-card)"
          }}>
            <button
              onClick={() => setSelectedThread(null)}
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: "12px", color: "var(--gold-mid)", borderColor: "var(--border-gold)" }}
            >← Back to list</button>

            {/* Folder Actions */}
            <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
              {activeTab === "spam" ? (
                 <>
                   <button 
                     className="btn-secondary" style={{ color: "var(--text-bright)", borderColor: "var(--border-gold)", background: "var(--bg-card)" }}
                     onClick={() => selectedThread.messages.forEach(m => restoreToInbox(m.id, m.senderEmail))}
                   >Not Spam</button>
                   <button 
                     className="btn-secondary" style={{ color: "var(--gold-mid)", borderColor: "var(--border-gold)", background: "var(--bg-card)" }}
                     onClick={() => setShowDeleteModal(selectedThread.id)}
                   >Delete Forever</button>
                 </>
              ) : (
                 <>
                   <button 
                     className="btn-secondary" style={{ background: "var(--gold-rich)", color: "#ffffff", border: "none" }}
                     onClick={() => selectedThread.messages.forEach(m => acceptRequest(m.id, m.senderEmail))}
                   >Accept All</button>
                   <button 
                     className="btn-secondary" style={{ color: "var(--gold-mid)", borderColor: "var(--border-gold)", background: "var(--bg-card)" }}
                     onClick={() => setShowRejectModal(selectedThread.id)}
                   >Reject</button>
                 </>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
             {/* Gmail-style Spam Banner */}
             {activeTab === "spam" && (
                <div style={{
                   margin: "16px 24px 0",
                   padding: "16px",
                   background: "var(--bg-card)",
                   border: "1px solid var(--border-gold)",
                   borderRadius: "8px",
                   display: "flex",
                   alignItems: "flex-start",
                   gap: "16px"
                }}>
                   <ShieldAlert size={28} color="var(--gold-mid)" style={{ flexShrink: 0 }} />
                   <div style={{ flex: 1 }}>
                     <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-bright)", marginBottom: "4px" }}>
                       Why is this message in spam?
                     </div>
                     <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                       It is similar to messages that were identified as spam in the past. 
                       If you know the sender, you can mark it as not spam to train your decentralized filters.
                     </div>
                   </div>
                   <button 
                     onClick={() => selectedThread.messages.forEach(m => restoreToInbox(m.id, m.senderEmail))}
                     style={{
                       background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                       color: "#fff",
                       border: "none",
                       borderRadius: "16px",
                       padding: "8px 16px",
                       fontSize: "12px",
                       fontWeight: "700",
                       cursor: "pointer",
                       whiteSpace: "nowrap"
                     }}
                   >
                     Report not spam
                   </button>
                </div>
             )}
             <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
               <ConversationView
                 thread={selectedThread}
                 user={getUser()}
                 onSendReply={async () => alert("Replies are disabled in Spam/Requests.")}
                 onUpdateStatus={(id, updates) => updateMailInStore(id, updates)}
                 onClose={() => setSelectedThread(null)}
               />
             </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showEmptyModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <ShieldAlert size={48} color="#e84234" style={{ marginBottom: "16px" }} />
            <h3>Empty Spam Folder?</h3>
            <p>This will permanently delete all {spamThreads.length} spam threads. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowEmptyModal(false)}>Cancel</button>
              <button
                className="btn"
                onClick={emptySpam}
                style={{ background: "#e84234" }}
              >Empty Spam</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <Trash2 size={48} color="#e84234" style={{ marginBottom: "16px" }} />
            <h3>Delete Forever?</h3>
            <p>This thread will be permanently deleted and cannot be recovered.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button
                className="btn"
                onClick={() => deleteForever(showDeleteModal)}
                style={{ background: "#e84234" }}
              >Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <XCircle size={48} color="#e84234" style={{ marginBottom: "16px" }} />
            <h3>Reject Request?</h3>
            <p>This request will be permanently deleted.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowRejectModal(null)}>Cancel</button>
              <button
                className="btn"
                onClick={() => rejectRequest(showRejectModal)}
                style={{ background: "#e84234" }}
              >Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}