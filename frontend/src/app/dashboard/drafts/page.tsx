"use client"

import { useEffect, useState, useMemo, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cleanMessage } from "@/utils/gun"
import { Star, Trash2, Mail, Edit3, Lock, Search, ArrowLeft, Paperclip, Send, RefreshCw, Check } from "lucide-react"

interface Draft {
  id: string
  to: string
  subject: string
  message: string
  savedAt: string
}

function DraftsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get("search") || ""
  
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null)
  const [searchQuery, setSearchQuery] = useState(urlSearch)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (urlSearch) setSearchQuery(urlSearch)
  }, [urlSearch])

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
    if (selectedDraft?.id === id) setSelectedDraft(null)
  }

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return drafts
      .filter((d) =>
        (d.subject?.toLowerCase() || "").includes(q) ||
        (d.to?.toLowerCase() || "").includes(q) ||
        (d.message?.toLowerCase() || "").includes(q)
      )
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
  }, [drafts, searchQuery])

  const handleToggleSelectAll = () => {
    if (selectedIds.size > 0 && selectedIds.size === filteredDrafts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDrafts.map(d => d.id)))
    }
  }

  const isAllSelected = filteredDrafts.length > 0 && selectedIds.size === filteredDrafts.length

  const handleBulkTrash = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const updated = drafts.filter((d) => !selectedIds.has(d.id))
    localStorage.setItem(`drafts_${user.email}`, JSON.stringify(updated))
    setDrafts(updated)
    setSelectedIds(new Set())
    setSelectedDraft(null)
  }

  const openInCompose = (draft: Draft) => {
    const params = new URLSearchParams()
    if (draft.to)      params.set("to",      draft.to)
    if (draft.subject) params.set("subject", draft.subject)
    if (draft.message) params.set("message", draft.message)
    deleteDraft(draft.id)
    router.push(`/dashboard/compose?${params.toString()}`)
  }

  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const renderDraftRow = (draft: Draft) => {
    const isSelected = selectedDraft?.id === draft.id
    const isRowChecked = selectedIds.has(draft.id)
    const recipientName = draft.to?.split("@")[0] || "Draft"
    const senderInitial = "D"
    
    return (
      <div 
        key={draft.id}
        onClick={() => setSelectedDraft(draft)}
        style={{
          display: "flex", alignItems: "center", padding: "16px 20px",
          borderBottom: "1px solid #141414", cursor: "pointer",
          position: "relative", background: isSelected || isRowChecked ? "rgba(212, 175, 55, 0.05)" : "transparent",
          transition: "all 0.2s ease"
        }}
      >
        {isSelected && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", background: "var(--gold-mid)" }} />
        )}

        {/* Profile Avatar / Selection Trigger */}
        <div 
          onClick={(e) => {
            e.stopPropagation()
            toggleSelection(draft.id, e)
          }}
          style={{
            width: "40px", height: "40px", borderRadius: "50%", 
            background: isRowChecked ? "var(--gold-mid)" : "rgba(232, 66, 52, 0.1)", 
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: "700", 
            color: isRowChecked ? "var(--bg-body)" : "#e84234", 
            marginRight: "16px", flexShrink: 0,
            cursor: "pointer", position: "relative",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            border: isRowChecked ? "2px solid var(--gold-mid)" : "2px solid transparent"
          }}
        >
          {isRowChecked ? (
            <Check size={20} strokeWidth={3} />
          ) : (
            senderInitial
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ 
              fontSize: "14px", fontWeight: "700", 
              color: "#e84234",
              fontFamily: "Inter, sans-serif",
              display: "flex", alignItems: "center", gap: "6px"
            }}>
              Draft to: {recipientName}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              {draft.savedAt}
            </span>
          </div>
          <div style={{ 
            fontSize: "13px", fontWeight: "600", 
            color: "var(--text-bright)", overflow: "hidden", 
            textOverflow: "ellipsis", whiteSpace: "nowrap" 
          }}>
            {draft.subject || "(No subject)"}
          </div>
          <div style={{ 
            fontSize: "12px", color: "var(--text-dim)", marginTop: "2px", 
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" 
          }}>
            {cleanMessage(draft.message || "").slice(0, 60)}
          </div>
        </div>
      </div>
    )
  }

  const renderDetailView = () => {
    if (!selectedDraft) return null

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-body)", padding: "40px", borderLeft: "1px solid #141414", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
          <button 
            onClick={() => setSelectedDraft(null)}
            style={{ 
              background: "var(--mail-row-border)", border: "1px solid #1F1F1F", borderRadius: "50%", 
              width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--gold-mid)"
            }}
          >
            <ArrowLeft size={18} /> 
          </button>
          
          <h1 style={{ 
            fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", 
            margin: 0, fontFamily: "Inter, sans-serif", flex: 1
          }}>
            {selectedDraft.subject || "(No subject)"}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginBottom: "24px" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%", 
            background: "rgba(232, 66, 52, 0.1)", border: "1px solid rgba(232, 66, 52, 0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", fontWeight: "800", color: "#e84234", marginRight: "16px"
          }}>
            D
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: "700", color: "#e84234" }}>Local Draft</span>
              <span style={{ fontSize: "14px", color: "var(--text-dim)" }}>
                Last saved: {selectedDraft.savedAt}
              </span>
            </div>
            <div style={{ fontSize: "14px", color: "var(--text-dim)", marginTop: "2px" }}>
              To: {selectedDraft.to || "(No recipient)"}
            </div>
          </div>
        </div>

        <div style={{
          background: "rgba(232, 66, 52, 0.05)", border: "1px solid rgba(232, 66, 52, 0.15)",
          borderRadius: "8px", padding: "12px 20px", display: "flex", alignItems: "center", gap: "12px",
          marginBottom: "32px"
        }}>
          <Lock size={14} color="#e84234" />
          <span style={{ fontSize: "12px", color: "#e84234", fontWeight: "600" }}>
            Unencrypted Local Draft
          </span>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: 0, flex: 1, textAlign: "right" }}>
            Resuming will prepare the message for PGP encryption.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "40px" }}>
          <button 
            onClick={() => openInCompose(selectedDraft)}
            style={{ 
              background: "var(--gold-mid)", color: "var(--bg-body)", border: "none", borderRadius: "8px",
              padding: "10px 24px", fontSize: "13px", fontWeight: "700", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "8px"
            }}
          >
            <Edit3 size={16} /> Resume Draft
          </button>
          <button 
            onClick={() => deleteDraft(selectedDraft.id)}
            style={{ 
              background: "var(--mail-row-border)", color: "var(--text-bright)", border: "1px solid #1F1F1F", borderRadius: "8px",
              padding: "10px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer"
            }}
          >
            <Trash2 size={16} /> Discard
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ 
            color: "var(--text-bright)", fontSize: "15px", lineHeight: "1.6", 
            whiteSpace: "pre-wrap", fontFamily: "Inter, sans-serif",
            marginBottom: "40px"
          }}>
            {selectedDraft.message || "(No body content)"}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-body)", overflow: "hidden" }}>
      <div style={{ 
        width: selectedDraft ? "360px" : "100%", 
        display: "flex", flexDirection: "column", flexShrink: 0,
        transition: "width 0.3s ease",
        maxWidth: selectedDraft ? "360px" : "1200px",
        margin: selectedDraft ? "0" : "0 auto"
      }}>
        <div style={{ padding: "24px 24px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0, fontFamily: "Inter, sans-serif" }}>Drafts</h2>
            <button 
              onClick={() => { setIsRefreshing(true); loadDrafts(); setTimeout(() => setIsRefreshing(false), 800) }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
            >
              <RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
          
          <div style={{ position: "relative", marginBottom: "16px" }}>
            <Search size={16} color="var(--text-dim)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input 
              type="text" 
              placeholder="Search drafts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", background: "var(--bg-card)", border: "1px solid #141414", borderRadius: "10px",
                padding: "10px 12px 10px 40px", color: "var(--text-bright)", fontSize: "13px", outline: "none"
              }}
            />
          </div>

          <div style={{ 
            background: "rgba(212, 160, 89, 0.05)", border: "1px solid rgba(212, 160, 89, 0.1)",
            padding: "8px 12px", borderRadius: "8px", fontSize: "11px", color: "var(--text-muted)"
          }}>
            Drafts are saved locally on this device.
          </div>
        </div>

        <div style={{ 
          display: "flex", alignItems: "center", gap: "16px",
          padding: "12px 24px", borderBottom: "1px solid #141414",
          background: "rgba(255,255,255,0.02)"
        }}>
          <button 
            onClick={handleToggleSelectAll}
            style={{ 
              display: "flex", alignItems: "center", gap: "10px", 
              background: "none", border: "none", color: isAllSelected ? "var(--gold-mid)" : "var(--text-dim)",
              fontSize: "13px", fontWeight: "600", cursor: "pointer", padding: "4px 8px",
              borderRadius: "6px", transition: "all 0.2s"
            }}
          >
            <div style={{ 
              width: "18px", height: "18px", borderRadius: "4px", 
              border: `2px solid ${isAllSelected ? "var(--gold-mid)" : "var(--text-dim)"}`,
              background: isAllSelected ? "var(--gold-mid)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {isAllSelected && <Check size={12} color="var(--bg-body)" strokeWidth={4} />}
            </div>
            <span>Select All</span>
          </button>

          {selectedIds.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
              <span style={{ fontSize: "12px", color: "var(--gold-mid)", fontWeight: "600" }}>{selectedIds.size} selected</span>
              <button onClick={handleBulkTrash} style={{ background: "rgba(232, 66, 52, 0.1)", color: "#e84234", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                <Trash2 size={14} /> Discard All
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredDrafts.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" }}>
              No drafts found
            </div>
          ) : (
            filteredDrafts.map(renderDraftRow)
          )}
        </div>
      </div>
      {renderDetailView()}
    </div>
  )
}


export default function DraftsPage() {
  return (
    <Suspense fallback={null}>
      <DraftsPageContent />
    </Suspense>
  );
}
