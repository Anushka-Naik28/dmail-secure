"use client"

import { useEffect, useState, useMemo, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { decryptMessage, db, cleanMessage } from "@/utils/gun"
import { Star, Trash2, Mail, Reply, Forward, Lock, Search, ArrowLeft, Paperclip, Send, RefreshCw, Check, Tag } from "lucide-react"
import { subscribe, updateMailInStore, getMails } from "@/utils/mailStore"
import { getLabels, getMailLabels, toggleMailLabel, subscribeLabelStore, type Label } from "@/utils/labelStore"
import { useLabel } from "@/context/LabelContext"
import MailRow from "@/components/MailRow"

function AllMailPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get("search") || ""
  const { activeLabelId, setActiveLabelId } = useLabel()
  
  const [mails, setMails] = useState<any[]>([])
  const [selectedMail, setSelectedMail] = useState<any>(null)
  const [userEmail, setUserEmail] = useState("")
  const [searchQuery, setSearchQuery] = useState(urlSearch)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [userLabels, setUserLabels] = useState<Label[]>([])
  const [showLabelMenu, setShowLabelMenu] = useState(false)

  useEffect(() => {
    if (urlSearch) setSearchQuery(urlSearch)
  }, [urlSearch])

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)

    const updateMails = () => {
      setMails(getMails("all").filter(m => m.status !== "trash"))
      setUserLabels(getLabels(user.email))
    }
    updateMails()
    const unsub = subscribe(updateMails)
    const unsubLabels = subscribeLabelStore(updateMails)
    
    return () => {
      unsub()
      unsubLabels()
    }
  }, [])

  const currentSelectedMail = useMemo(() => {
    if (!selectedMail) return null
    return mails.find(m => m.id === selectedMail.id) || selectedMail
  }, [mails, selectedMail])

  const filteredMails = useMemo(() => {
    return mails
      .filter(m => {
        if (activeLabelId && !getMailLabels(userEmail, m.id).includes(activeLabelId)) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          return (
            m.subject?.toLowerCase().includes(q) ||
            m.senderEmail?.toLowerCase().includes(q) ||
            m.receiverEmail?.toLowerCase().includes(q) ||
            m.message?.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        const getTime = (m: any) => m.time ? new Date(m.time).getTime() : 0
        return getTime(b) - getTime(a)
      })
  }, [mails, searchQuery, activeLabelId, userEmail])

  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.size > 0 && selectedIds.size === filteredMails.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredMails.map(m => m.id)))
    }
  }

  const isAllSelected = filteredMails.length > 0 && selectedIds.size === filteredMails.length

  const handleBulkTrash = () => {
    selectedIds.forEach(id => {
      updateMailInStore(id, { status: "trash" })
    })
    setSelectedIds(new Set())
    setSelectedMail(null)
  }

  const openMail = (mail: any) => {
    setSelectedMail(mail)
  }

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const mail = mails.find(m => m.id === id)
    if (mail) {
      updateMailInStore(id, { isStarred: !mail.isStarred })
    }
  }

  const renderDetailView = () => {
    const mail = currentSelectedMail
    if (!mail) return null

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-body)", padding: "40px", borderLeft: "1px solid #141414", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
          <button onClick={() => setSelectedMail(null)} style={{ background: "var(--mail-row-border)", border: "1px solid #1F1F1F", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--gold-mid)" }}>
            <ArrowLeft size={18} /> 
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0, flex: 1 }}>{mail.subject || "(No subject)"}</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", color: "var(--gold-mid)", marginRight: "16px" }}>
            {(mail.senderName || mail.senderEmail || "U").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-bright)" }}>{mail.senderName || mail.senderEmail}</span>
              <span style={{ fontSize: "14px", color: "var(--text-dim)" }}>{mail.time}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
              {userLabels.filter(l => getMailLabels(userEmail, mail.id).includes(l.id)).map(lbl => (
                <span key={lbl.id} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: `${lbl.color}22`, color: lbl.color, border: `1px solid ${lbl.color}44`, display: "flex", alignItems: "center", gap: "4px" }}>
                  {lbl.emoji && <span>{lbl.emoji}</span>}
                  {lbl.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "40px", position: "relative" }}>
           <div style={{ position: "relative" }}>
            <button onClick={() => setShowLabelMenu(!showLabelMenu)} style={{ background: "var(--mail-row-border)", color: "var(--text-bright)", border: "1px solid #1F1F1F", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              <Tag size={16} /> Label
            </button>
            {showLabelMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "12px", background: "var(--bg-card)", border: "1px solid #1F1F1F", borderRadius: "14px", padding: "10px", width: "240px", zIndex: 1000, boxShadow: "0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(212, 175, 55, 0.15)", animation: "dropdownFadeIn 0.2s ease-out" }}>
                <style>{`@keyframes dropdownFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                <div style={{ fontSize: "10px", color: "var(--text-dim)", padding: "8px 12px 12px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: "8px" }}>Assign Label</div>
                <div style={{ maxHeight: "240px", overflowY: "auto", paddingRight: "4px" }}>
                  {userLabels.map(lbl => {
                    const isTagged = getMailLabels(userEmail, mail.id).includes(lbl.id)
                    return (
                      <button key={lbl.id} onClick={() => { toggleMailLabel(userEmail, mail.id, lbl.id); setShowLabelMenu(false); }} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: isTagged ? "rgba(212, 175, 55, 0.12)" : "transparent", border: "none", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", transition: "all 0.2s ease", marginBottom: "2px" }}>
                        <div style={{ width: "14px", height: "14px", borderRadius: "4px", background: lbl.color, border: `1px solid ${lbl.color}60`, boxShadow: `0 0 10px ${lbl.color}30` }} />
                        <span style={{ fontSize: "13px", fontWeight: isTagged ? "600" : "500", color: isTagged ? "var(--gold-mid)" : "var(--text-bright)", flex: 1 }}>{lbl.name}</span>
                        {isTagged && <Check size={16} color="var(--gold-mid)" strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => updateMailInStore(mail.id, { isStarred: !mail.isStarred })} style={{ background: "var(--mail-row-border)", color: "var(--text-bright)", border: "1px solid #1F1F1F", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}><Star size={16} fill={mail.isStarred ? "var(--gold-mid)" : "none"} color={mail.isStarred ? "var(--gold-mid)" : "var(--text-bright)"} /></button>
          <button onClick={() => { updateMailInStore(mail.id, { status: "trash" }); setSelectedMail(null); }} style={{ background: "var(--mail-row-border)", color: "var(--text-bright)", border: "1px solid #1F1F1F", borderRadius: "8px", padding: "10px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}><Trash2 size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ color: "var(--text-bright)", fontSize: "15px", lineHeight: "1.6", whiteSpace: "pre-wrap", fontFamily: "Inter, sans-serif" }}>{mail.message}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-body)", overflow: "hidden" }}>
      <div style={{ width: selectedMail ? "360px" : "100%", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.3s ease", maxWidth: selectedMail ? "360px" : "1200px", margin: selectedMail ? "0" : "0 auto" }}>
        <div style={{ padding: "24px 24px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0 }}>All Mail</h2>
            {activeLabelId && (
              <button onClick={() => { setActiveLabelId(null); router.push("/dashboard/all-mail"); }} style={{ background: "rgba(212, 175, 55, 0.1)", color: "var(--gold-mid)", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>Clear Filter</button>
            )}
          </div>
          
          <div style={{ position: "relative", marginBottom: "16px" }}>
            <Search size={16} color="var(--text-dim)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input type="text" placeholder="Search all mail..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", background: "var(--bg-card)", border: "1px solid #141414", borderRadius: "10px", padding: "10px 12px 10px 40px", color: "var(--text-bright)", fontSize: "13px", outline: "none" }} />
          </div>
        </div>

        <div style={{ 
          display: "flex", alignItems: "center", gap: "16px",
          padding: "12px 24px", borderBottom: "1px solid #141414",
          background: "rgba(255,255,255,0.02)"
        }}>
          <button onClick={handleToggleSelectAll} style={{ display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", color: isAllSelected ? "var(--gold-mid)" : "var(--text-dim)", fontSize: "13px", fontWeight: "600", cursor: "pointer", padding: "4px 8px", borderRadius: "6px", transition: "all 0.2s" }}>
            <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${isAllSelected ? "var(--gold-mid)" : "var(--text-dim)"}`, background: isAllSelected ? "var(--gold-mid)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isAllSelected && <Check size={12} color="var(--bg-body)" strokeWidth={4} />}
            </div>
            <span>Select All</span>
          </button>
          {selectedIds.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
              <span style={{ fontSize: "12px", color: "var(--gold-mid)", fontWeight: "600" }}>{selectedIds.size} selected</span>
              <button onClick={handleBulkTrash} style={{ background: "rgba(232, 66, 52, 0.1)", color: "#e84234", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredMails.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-dim)" }}>No messages</div>
          ) : (
            filteredMails.map(mail => (
              <MailRow 
                key={mail.id}
                mail={mail}
                isSelected={selectedMail?.id === mail.id}
                onOpen={openMail}
                onToggleSelection={toggleSelection}
                isSelectedInBulk={selectedIds.has(mail.id)}
                onToggleStar={handleToggleStar}
                activeLabels={userLabels.filter(l => getMailLabels(userEmail, mail.id).includes(l.id))}
              />
            ))
          )}
        </div>
      </div>
      {renderDetailView()}
    </div>
  )
}


export default function AllMailPage() {
  return (
    <Suspense fallback={null}>
      <AllMailPageContent />
    </Suspense>
  );
}
