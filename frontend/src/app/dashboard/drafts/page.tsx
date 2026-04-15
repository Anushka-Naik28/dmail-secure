"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PageHeader from "@/components/PageHeader"

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

  const loadDrafts = () => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    const stored = localStorage.getItem(`drafts_${user.email}`)
    setDrafts(stored ? JSON.parse(stored) : [])
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

      {/* Split view */}
      <div style={{ display: "flex", height: "calc(100% - 160px)", gap: "0", overflow: "hidden" }}>

        {/* Left — draft list */}
        <div style={{
          width: selectedDraft ? "320px" : "100%",
          flexShrink: 0,
          borderRight: selectedDraft ? "1px solid var(--border-gold)" : "none",
          overflowY: "auto",
          transition: "width 0.2s ease",
        }}>
          {filteredDrafts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.3 }}>📝</div>
              <p className="empty-state">
                {searchQuery ? "No drafts found." : "No drafts yet. Start composing to save a draft."}
              </p>
            </div>
          ) : (
            filteredDrafts.map((draft) => {
              const isActive = selectedDraft?.id === draft.id
              return (
                <div
                  key={draft.id}
                  onClick={() => setSelectedDraft(isActive ? null : draft)}
                  className={`mail-row ${isActive ? 'selected' : ''}`}
                >
                  <div className="mail-icons">
                    <span style={{ fontSize: "16px" }}>📝</span>
                  </div>

                  <div className="mail-sender">
                    {draft.to ? `To: ${draft.to.split('@')[0]}` : "No recipient"}
                  </div>

                  <div className="mail-content">
                    <span className="mail-subject">
                      {draft.subject || "(No subject)"}
                    </span>
                    <span className="mail-snippet">
                      {" — "}
                      {draft.message?.slice(0, 60) || "(No message)"}
                    </span>
                  </div>

                  <div className="mail-row-actions">
                    <button
                      title="Delete Draft"
                      onClick={(e) => { e.stopPropagation(); setShowDeleteModal(draft.id) }}
                    >🗑️</button>
                  </div>

                  <div className="mail-date">
                    {draft.savedAt?.split(",")[0]}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right — draft preview */}
        {selectedDraft && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            overflow: "hidden", background: "var(--bg-panel)",
          }}>
            {/* Top bar */}
            <div style={{
              padding: "10px 16px", borderBottom: "1px solid var(--border-gold)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <button
                onClick={() => setSelectedDraft(null)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", fontSize: "12px",
                  fontFamily: "Raleway, sans-serif", padding: "4px 8px", borderRadius: "6px",
                }}
              >← Close</button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setShowDeleteModal(selectedDraft.id)}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                    background: "rgba(217,48,37,0.08)",
                    border: "1px solid rgba(217,48,37,0.25)",
                    color: "#e84234", fontSize: "11px",
                    fontFamily: "Raleway, sans-serif", fontWeight: "600",
                  }}
                >🗑️ Delete</button>

                <button
                  onClick={() => openInCompose(selectedDraft)}
                  style={{
                    padding: "6px 16px", borderRadius: "8px", cursor: "pointer",
                    background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                    border: "none", color: "#000", fontSize: "11px",
                    fontFamily: "Raleway, sans-serif", fontWeight: "700",
                  }}
                >✏️ Resume Draft</button>
              </div>
            </div>

            {/* Draft content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {/* Subject */}
              <h2 className="mail-detail-subject">
                {selectedDraft.subject || "(No subject)"}
              </h2>

              {/* Meta */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 12px", background: "var(--bg-card)",
                  borderRadius: "8px", border: "1px solid var(--border-gold)",
                }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", width: "60px" }}>To</span>
                  <span style={{ fontSize: "12px", color: selectedDraft.to ? "var(--text-bright)" : "var(--text-muted)" }}>
                    {selectedDraft.to || "No recipient"}
                  </span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 12px", background: "var(--bg-card)",
                  borderRadius: "8px", border: "1px solid var(--border-gold)",
                }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", width: "60px" }}>Saved</span>
                  <span style={{ fontSize: "12px", color: "var(--text-bright)" }}>{selectedDraft.savedAt}</span>
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-gold)", marginBottom: "20px" }} />

              {/* Body */}
              <p style={{
                fontSize: "14px", color: selectedDraft.message ? "var(--text-bright)" : "var(--text-muted)",
                lineHeight: "1.8", whiteSpace: "pre-wrap", fontFamily: "Georgia, serif",
                fontStyle: selectedDraft.message ? "normal" : "italic",
              }}>
                {selectedDraft.message || "(No message body)"}
              </p>

              {/* Draft notice */}
              <div style={{
                marginTop: "24px", padding: "10px 14px", borderRadius: "8px",
                background: "rgba(212,160,23,0.06)", border: "1px solid rgba(212,160,23,0.15)",
                fontSize: "11px", color: "var(--text-muted)",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span>📝</span>
                This is a draft — it has not been sent. Click Resume Draft to continue editing.
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