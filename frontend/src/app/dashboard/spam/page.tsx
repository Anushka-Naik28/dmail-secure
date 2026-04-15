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
              return (
                <div
                  key={thread.id}
                  className={`mail-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => openThread(thread)}
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

                  <div className="mail-sender">
                    {mail.senderName || mail.senderEmail?.split("@")[0]}
                  </div>

                  <div className="mail-content">
                    <span className="mail-subject">
                      <span style={{ 
                        color: activeTab === "spam" ? "#e84234" : "var(--gold-mid)", 
                        fontSize: "9px", fontWeight: "800", marginRight: "8px",
                        padding: "1px 6px", borderRadius: "4px",
                        background: activeTab === "spam" ? "rgba(232,66,52,0.1)" : "rgba(212,160,23,0.1)",
                        border: `1px solid ${activeTab === "spam" ? "rgba(232,66,52,0.2)" : "rgba(212,160,23,0.2)"}`
                      }}>
                        {activeTab.toUpperCase()}
                      </span>
                      {mail.subject}
                    </span>
                    <span className="mail-snippet">
                      {mail.isDecrypted ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ 
                            color: "var(--gold-mid)", fontWeight: "800", fontSize: "9px", 
                            textTransform: "uppercase", padding: "1px 4px", borderRadius: "3px",
                            background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.15)"
                          }}>
                            🔓 Decrypted
                          </span>
                          <span>{mail.message?.replace(/-----BEGIN PGP MESSAGE-----[\s\S]*-----END PGP MESSAGE-----/g, "").slice(0, 80).trim()}</span>
                        </span>
                      ) : mail.message?.includes("-----BEGIN PGP MESSAGE-----") || mail.isEncrypted ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ 
                            color: "var(--text-dim)", fontWeight: "800", fontSize: "9px", 
                            textTransform: "uppercase", padding: "1px 4px", borderRadius: "3px",
                            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)"
                          }}>
                            🔒 Encrypted
                          </span>
                          <span style={{ color: "var(--text-dim)", fontSize: "11px", fontStyle: "italic" }}>Secure message...</span>
                        </span>
                      ) : (
                        mail.message?.slice(0, 80)
                      )}
                    </span>
                  </div>

                  {/* Hover Actions */}
                  <div className="row-hover-actions">
                    <button className="hover-icon-btn delete" title="Delete Forever" onClick={(e) => { e.stopPropagation(); setShowDeleteModal(thread.id) }}>
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