"use client"

import { useEffect, useState, useMemo, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { decryptMessage, db, cleanMessage } from "@/utils/gun"
import { Star, Trash2, Mail, Lock, Search, ArrowLeft, RefreshCw, Inbox, AlertTriangle, Check } from "lucide-react"
import { subscribe, updateMailInStore, getMails, initMailStore } from "@/utils/mailStore"
import MailRow from "@/components/MailRow"

function TrashPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get("search") || ""
  
  const [mails, setMails] = useState<any[]>([])
  const [selectedMail, setSelectedMail] = useState<any>(null)
  const [userEmail, setUserEmail] = useState("")
  const [vaultPassword, setVaultPassword] = useState("")
  const [decrypting, setDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState("")
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(urlSearch)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [inboxLayout, setInboxLayout] = useState("comfortable")
  const [emailPreview, setEmailPreview] = useState("2lines")

  useEffect(() => {
    if (urlSearch) setSearchQuery(urlSearch)
  }, [urlSearch])

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) {
      setUserEmail(user.email)
      initMailStore(user.email)
    }

    setInboxLayout(localStorage.getItem("settings_inboxLayout") || "comfortable")
    setEmailPreview(localStorage.getItem("settings_emailPreview") || "2lines")

    const updateMails = () => {
      setMails(getMails("trash"))
    }
    updateMails()
    const unsub = subscribe(updateMails)
    
    return unsub
  }, [])

  const currentSelectedMail = useMemo(() => {
    if (!selectedMail) return null
    return mails.find(m => m.id === selectedMail.id) || selectedMail
  }, [mails, selectedMail])

  const filteredMails = useMemo(() => {
    return mails
      .filter(m => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          return (
            m.subject?.toLowerCase().includes(q) ||
            m.senderEmail?.toLowerCase().includes(q) ||
            m.message?.toLowerCase().includes(q) ||
            m.id?.toLowerCase().includes(q) ||
            m.time?.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        const getTime = (m: any) => m.time ? new Date(m.time).getTime() : 0
        return getTime(b) - getTime(a)
      })
  }, [mails, searchQuery])

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

  const handleBulkPurge = () => {
    selectedIds.forEach(id => {
      updateMailInStore(id, { status: "purged", purgedAt: Date.now() })
    })
    setSelectedIds(new Set())
    setSelectedMail(null)
  }

  const handleBulkRestore = () => {
    selectedIds.forEach(id => {
      updateMailInStore(id, { status: "inbox" })
    })
    setSelectedIds(new Set())
    setSelectedMail(null)
  }

  const openMail = (mail: any) => {
    setSelectedMail(mail)
    setDecryptedContent(null)
    setDecryptError("")
    setVaultPassword("")
  }

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const mail = mails.find(m => m.id === id)
    if (mail) {
      updateMailInStore(id, { isStarred: !mail.isStarred })
    }
  }

  const handleDecrypt = async () => {
    if (!vaultPassword || !currentSelectedMail) return
    setDecrypting(true)
    setDecryptError("")
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      if (currentSelectedMail.message?.includes("-----BEGIN PGP MESSAGE-----")) {
        const decrypted = await decryptMessage(currentSelectedMail.message, user.privateKey, vaultPassword)
        setDecryptedContent(decrypted)
      } else {
        const { signData } = await import("@/utils/gun")
        await signData("unlock", user.privateKey, vaultPassword)
        setDecryptedContent(currentSelectedMail.message)
      }
      setVaultPassword("")
    } catch (err) {
      setDecryptError("Incorrect Vault Passphrase")
    } finally {
      setDecrypting(false)
    }
  }

  const renderDetailView = () => {
    const mail = currentSelectedMail
    if (!mail) return null

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-body)", padding: "40px", borderLeft: "1px solid #141414", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
          <button onClick={() => setSelectedMail(null)} style={{ background: "var(--mail-row-border)", border: "1px solid #1F1F1F", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-dim)" }}><ArrowLeft size={18} /></button>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0, opacity: 0.7 }}>{mail.subject || "(No subject)"}</h1>
        </div>

        <div style={{ background: "rgba(232, 66, 52, 0.05)", border: "1px solid rgba(232, 66, 52, 0.15)", borderRadius: "8px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <AlertTriangle size={24} color="#e84234" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", color: "#e84234", fontWeight: "700" }}>Message in Trash</div>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: 0 }}>Manual purge required for permanent removal.</p>
          </div>
          <button onClick={() => { updateMailInStore(mail.id, { status: "inbox" }); setSelectedMail(null); }} style={{ background: "var(--bg-input)", color: "#4caf6e", border: "1px solid rgba(76, 175, 110, 0.3)", borderRadius: "8px", padding: "8px 16px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Restore to Inbox</button>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "40px" }}>
          <button onClick={() => { updateMailInStore(mail.id, { status: "purged", purgedAt: Date.now() }); setSelectedMail(null); }} style={{ background: "rgba(232, 66, 52, 0.1)", color: "#e84234", border: "1px solid rgba(232, 66, 52, 0.3)", borderRadius: "8px", padding: "10px 24px", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}><Trash2 size={16} /> Delete Forever</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", opacity: 0.5 }}>
          {!decryptedContent ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid #1F1F1F", borderRadius: "16px", padding: "40px", textAlign: "center", maxWidth: "480px", margin: "0 auto" }}>
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>🗑️</div>
              <h3 style={{ color: "var(--text-bright)", marginBottom: "12px" }}>Secure Vault</h3>
              <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "24px" }}>Decrypt discarded content for analysis.</p>
              <input type="password" placeholder="Vault Passphrase" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)} style={{ width: "100%", background: "var(--mail-row-border)", border: "1px solid #1F1F1F", borderRadius: "8px", padding: "12px 16px", color: "var(--text-bright)", fontSize: "14px", outline: "none", textAlign: "center", marginBottom: "16px" }} onKeyDown={(e) => e.key === "Enter" && handleDecrypt()} />
              {decryptError && <p style={{ color: "#E84234", fontSize: "12px", marginBottom: "16px" }}>{decryptError}</p>}
              <button onClick={handleDecrypt} disabled={decrypting} style={{ width: "100%", background: "var(--border-color)", color: "var(--text-dim)", border: "none", borderRadius: "8px", padding: "12px", fontWeight: "700", cursor: "pointer", opacity: decrypting ? 0.6 : 1 }}>Unlock Trash Content</button>
            </div>
          ) : (
            <div style={{ color: "var(--text-bright)", fontSize: "15px", lineHeight: "1.6", whiteSpace: "pre-wrap", marginBottom: "40px" }}>{decryptedContent || mail.message}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-body)", overflow: "hidden" }}>
      <div style={{ width: selectedMail ? "360px" : "100%", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.3s ease", maxWidth: selectedMail ? "360px" : "1200px", margin: selectedMail ? "0" : "0 auto" }}>
        <div style={{ padding: "24px 24px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0 }}>Trash</h2>
            <button onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 800) }} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}><RefreshCw size={18} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} /></button>
          </div>
          <div style={{ position: "relative", marginBottom: "16px" }}>
            <Search size={16} color="var(--text-dim)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input type="text" placeholder="Search trash..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", background: "var(--bg-card)", border: "1px solid #141414", borderRadius: "10px", padding: "10px 12px 10px 40px", color: "var(--text-bright)", fontSize: "13px", outline: "none" }} />
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
              background: "none", border: "none", color: isAllSelected ? "#e84234" : "var(--text-dim)",
              fontSize: "13px", fontWeight: "600", cursor: "pointer", padding: "4px 8px",
              borderRadius: "6px", transition: "all 0.2s"
            }}
          >
            <div style={{ 
              width: "18px", height: "18px", borderRadius: "4px", 
              border: `2px solid ${isAllSelected ? "#e84234" : "var(--text-dim)"}`,
              background: isAllSelected ? "#e84234" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {isAllSelected && <Check size={12} color="var(--bg-body)" strokeWidth={4} />}
            </div>
            <span>Select All</span>
          </button>

          {selectedIds.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
              <span style={{ fontSize: "12px", color: "#e84234", fontWeight: "600" }}>{selectedIds.size} selected</span>
              <button onClick={handleBulkRestore} style={{ background: "rgba(76, 175, 110, 0.1)", color: "#4caf6e", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Restore</button>
              <button onClick={handleBulkPurge} style={{ background: "rgba(232, 66, 52, 0.1)", color: "#e84234", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Delete Forever</button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredMails.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-dim)" }}>Trash is empty</div>
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
                layout={inboxLayout}
                preview={emailPreview}
              />
            ))
          )}
        </div>
      </div>
      {renderDetailView()}
    </div>
  )
}


export default function TrashPage() {
  return (
    <Suspense fallback={null}>
      <TrashPageContent />
    </Suspense>
  );
}
