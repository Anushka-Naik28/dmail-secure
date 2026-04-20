"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PageHeader from "@/components/PageHeader"
import { Shield, Lock, ChevronLeft, Trash2, Edit3, CheckSquare, Square, MoreVertical, RefreshCw } from "lucide-react"

interface Draft {
  id: string
  to: string
  subject: string
  message: string
  savedAt: string
}

export default function DraftsPage() {
  const router = useRouter()
  const [drafts, setDrafts]           = useState<Draft[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadDrafts = () => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    const stored = localStorage.getItem(`drafts_${user.email}`)
    setDrafts(stored ? JSON.parse(stored) : [])
  }

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

  useEffect(() => {
    loadDrafts()
  }, [])

  const deleteDraft = (id: string) => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const updated = drafts.filter((d) => d.id !== id)
    localStorage.setItem(`drafts_${user.email}`, JSON.stringify(updated))
    setDrafts(updated)
    setShowDeleteModal(null)
    if (selectedDraft?.id === id) setSelectedDraft(null)
  }

  const deleteAllDrafts = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    localStorage.setItem(`drafts_${user.email}`, JSON.stringify([]))
    setDrafts([])
    setSelectedDraft(null)
    setShowDeleteModal(null)
  }

  const openInCompose = (draft: Draft) => {
    // Dispatch openCompose event with draft data pre-filled via URL params
    const params = new URLSearchParams()
    if (draft.to)      params.set("to",      draft.to)
    if (draft.subject) params.set("subject", draft.subject)
    if (draft.message) params.set("message", draft.message)

    // Delete the draft since it's being resumed
    deleteDraft(draft.id)

    router.push(`/dashboard/compose?${params.toString()}`)
  }

  const filteredDrafts = drafts.filter(
    (d) =>
      d.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.to?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.message?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <>
      <PageHeader 
        title="Drafts"
        count={drafts.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search drafts..."
        rightElement={
          drafts.length > 0 && (
            <button
              onClick={() => setShowDeleteModal("all")}
              style={{
                padding: "6px 14px",
                background: "rgba(217,48,37,0.08)",
                border: "1px solid rgba(217,48,37,0.3)",
                borderRadius: "8px", cursor: "pointer",
                fontSize: "11px", color: "#e84234",
                fontFamily: "Raleway, sans-serif", fontWeight: "600",
              }}
            >🗑️ Clear All</button>
          )
        }
      />

      <div style={{ padding: "0 20px" }}>
        {/* Info banner */}
        <div style={{
          background: "rgba(212,160,23,0.04)", border: "1px solid rgba(212,160,23,0.15)",
          borderRadius: "10px", padding: "10px 14px", marginBottom: "16px",
          marginTop: "16px",
          fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.6",
        }}>
          💾 Drafts are saved automatically every 30 seconds while composing, and when you click Save Draft.
          They are stored locally on your device.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {!selectedDraft ? (
          <div className="mail-list" style={{ display: "flex", flexDirection: "column" }}>
            <div className="folder-toolbar" style={{ borderTop: "none" }}>
              <button className="toolbar-btn" onClick={() => selectedIds.length === filteredDrafts.length ? setSelectedIds([]) : setSelectedIds(filteredDrafts.map(d => d.id))}>
                {selectedIds.length === filteredDrafts.length && filteredDrafts.length > 0 ? <CheckSquare size={18} color="var(--gold-mid)" /> : <Square size={18} />}
              </button>
              <button className="toolbar-btn" onClick={() => { setIsRefreshing(true); loadDrafts(); setTimeout(() => setIsRefreshing(false), 1000) }}>
                <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
              </button>
              <button className="toolbar-btn"><MoreVertical size={18} /></button>
            </div>

            {filteredDrafts.length === 0 ? (
              <div style={{ padding: "100px 40px", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "48px", marginBottom: "20px", opacity: 0.15 }}>📝</div>
                <div style={{ fontSize: "18px", fontWeight: "600" }}>{searchQuery ? "No results found." : "No drafts found."}</div>
                <div style={{ fontSize: "13px", opacity: 0.6, marginTop: "8px" }}>Start composing to save a draft locally.</div>
              </div>
            ) : (
              filteredDrafts.map((draft) => {
                const isActive = selectedDraft?.id === draft.id
                const isSelected = selectedIds.includes(draft.id)
                return (
                  <div
                    key={draft.id}
                    className={`mail-row ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedDraft(draft)}
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
                    {/* Draft Marker */}
                    <div style={{
                      flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%",
                      background: "rgba(232,66,52,0.1)", border: "1.5px solid rgba(232,66,52,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: "700", color: "#e84234", fontSize: "14px",
                      marginLeft: "4px", marginRight: "10px",
                    }}>
                      📝
                    </div>

                    {/* Checkbox Area — fixed 56px */}
                    <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: "56px", marginRight: "8px" }}>
                      <div
                        className={`mail-row-checkbox ${isSelected ? "checked" : ""}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedIds(prev => prev.includes(draft.id) ? prev.filter(i => i !== draft.id) : [...prev, draft.id]) }}
                        style={{ width: "16px", height: "16px", border: "1px solid var(--border-gold)", borderRadius: "3px" }}
                      >
                        {isSelected && <CheckSquare size={12} color="#000" />}
                      </div>
                    </div>

                    {/* Sender Label — fixed 160px */}
                    <div className="mail-sender" style={{ width: "160px", flexShrink: 0, marginRight: "12px", border: "none", fontSize: "13px", fontWeight: "700", color: "#e84234" }}>
                      Draft
                    </div>

                    {/* Subject + Snippet */}
                    <div className="mail-content" style={{ flex: 1, border: "none", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                      <span className="mail-subject" style={{ fontWeight: "600", color: "var(--text-bright)", fontSize: "13px", flexShrink: 0, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {draft.subject || "(No subject)"}
                      </span>
                      <span style={{ color: "var(--text-muted)", opacity: 0.5, margin: "0 2px", fontSize: "12px" }}>—</span>
                      <span className="mail-snippet" style={{ fontSize: "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {draft.message || "(No body content)"}
                      </span>
                    </div>

                    {/* Date — fixed 62px */}
                    <div style={{ flexShrink: 0, fontSize: "12px", marginLeft: "12px", width: "62px", textAlign: "right", color: "var(--text-dim)" }}>
                      {formatMailDate(draft.savedAt)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-panel)", animation: "fadeUp 0.3s ease both" }}>
            <div style={{ marginBottom: "28px" }}>
              <button
                onClick={() => setSelectedDraft(null)}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)", fontSize: "13px", fontWeight: "800", letterSpacing: "1px", padding: "8px 0" }}
              >
                <ChevronLeft size={16} /> DRAFTS
              </button>
            </div>

            <div style={{ maxWidth: "860px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
                <h1 style={{ fontSize: "26px", fontFamily: "Cinzel, serif", color: "var(--text-bright)", letterSpacing: "1px", lineHeight: 1.3, margin: 0 }}>
                  {selectedDraft.subject || "(No subject)"}
                </h1>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button 
                    onClick={() => setShowDeleteModal(selectedDraft.id)} 
                    className="chromeless-btn hover-error" 
                    style={{ padding: "8px", border: "1px solid rgba(232,66,52,0.2)", borderRadius: "8px" }}
                  >
                    <Trash2 size={18} color="#e84234" />
                  </button>
                  <button 
                    onClick={() => openInCompose(selectedDraft)} 
                    className="btn" 
                    style={{ padding: "8px 20px", fontSize: "12px" }}
                  >
                    RESUME DRAFT
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px", paddingBottom: "24px", borderBottom: "1px solid var(--border-gold)" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(232,66,52,0.1)", border: "1.5px solid rgba(232,66,52,0.3)", color: "#e84234", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "20px", flexShrink: 0 }}>
                  D
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "700", color: "#e84234", fontSize: "15px", marginBottom: "4px" }}>DRAFT MESSAGE</div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    To: <strong style={{ color: "var(--gold-mid)" }}>{selectedDraft.to || "(No recipient)"}</strong>
                    <span style={{ margin: "0 8px" }}>•</span>Last saved {selectedDraft.savedAt}
                  </div>
                </div>
              </div>

              <div style={{ minHeight: "300px" }}>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.9", fontSize: "15px", color: "var(--text-bright)", fontFamily: "Inter, Raleway, sans-serif", maxWidth: "760px" }}>
                  {selectedDraft.message || <em style={{ color: "var(--text-muted)" }}>(No message body)</em>}
                </div>
              </div>

              <div style={{ marginTop: "48px", padding: "24px", background: "rgba(232,66,52,0.03)", border: "1px solid rgba(232,66,52,0.15)", borderRadius: "12px", display: "flex", gap: "16px", alignItems: "center" }}>
                <Shield size={24} color="#e84234" />
                <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  This is a <strong>local draft</strong>. It remains on this device until sent or deleted. Encryption is performed only when the message is formally transmitted.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🗑️</div>
            <h3>{showDeleteModal === "all" ? "Clear All Drafts?" : "Delete Draft?"}</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {showDeleteModal === "all"
                ? `This will permanently delete all ${drafts.length} drafts.`
                : "This draft will be permanently deleted."}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(null)}>
                Cancel
              </button>
              <button
                onClick={() => showDeleteModal === "all" ? deleteAllDrafts() : deleteDraft(showDeleteModal)}
                style={{
                  padding: "10px 20px", borderRadius: "8px",
                  border: "1px solid rgba(217,48,37,0.3)",
                  background: "rgba(217,48,37,0.15)", color: "#e84234",
                  cursor: "pointer", fontWeight: "700",
                  fontFamily: "Raleway, sans-serif", fontSize: "13px",
                }}
              >
                {showDeleteModal === "all" ? "Clear All" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}