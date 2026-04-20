"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { decryptMessage, encryptMessage, db } from "@/utils/gun"
import { Search, Star, Pin, Paperclip, MoreVertical, Archive, Trash2, Mail, Send, FileText, Clock, Reply, Forward, Download, Tag, Shield, Smile, Image, Link, Type, Bold, Italic, List, Lock, ChevronLeft } from "lucide-react"
import { checkPinStatus, exportMailFromIPFS, uploadFileToIPFS, getLocalNode } from "@/utils/ipfs"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import { getMails, subscribe, updateMailInStore, pinMailInStore } from "@/utils/mailStore"
import { getLabels, getMailLabels, getLabelMails, toggleMailLabel, subscribeLabelStore, type Label } from "@/utils/labelStore"
import { useLabel } from "@/context/LabelContext"
import PageHeader from "@/components/PageHeader"

type ComposeMode = "reply" | "forward" | null

export default function StarredPage() {
  const [mails, setMails]                      = useState<any[]>([])
  const [selectedMail, setSelectedMail]         = useState<any>(null)
  const [searchQuery, setSearchQuery]           = useState("")

  const [passInput, setPassInput]               = useState("")
  const [passError, setPassError]               = useState("")
  const [showPassModal, setShowPassModal]       = useState(false)
  const [decrypting, setDecrypting]             = useState(false)
  const [loadingMail, setLoadingMail]           = useState(false)
  const [userEmail, setUserEmail]               = useState("")
  
  // ── Labels ──
  const [labels, setLabels]                 = useState<Label[]>([])
  const [mailTags, setMailTags]             = useState<Record<string,string[]>>({})
  const { activeLabelId }                   = useLabel()

  // ── Reply / Forward state ──
  const [composeMode, setComposeMode]       = useState<ComposeMode>(null)
  const [replyTo, setReplyTo]               = useState("")
  const [replySubject, setReplySubject]     = useState("")
  const [replyBody, setReplyBody]           = useState("")
  const [forwardTo, setForwardTo]           = useState("")
  const [sendingReply, setSendingReply]     = useState(false)
  const [replyStatus, setReplyStatus]       = useState<"idle"|"success"|"error">("idle")
  const [replyStatusMsg, setReplyStatusMsg] = useState("")
  const [draftAttachments, setDraftAttachments] = useState<{name: string, cid: string}[]>([])
  const fileInputRef                             = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)

    const loadData = () => {
      const u = JSON.parse(localStorage.getItem("user") || "{}")
      if (u.email) {
        setLabels(getLabels(u.email))
        setMails(getMails("starred"))
        const tm: Record<string, string[]> = {}
        getMails("starred").forEach((m: any) => { tm[m.id] = getMailLabels(u.email, m.id) })
        setMailTags(tm)
      }
    }
    loadData();
    const unsub = subscribe(loadData)
    const unsubLabel = subscribeLabelStore(loadData)
    return () => { unsub(); unsubLabel(); }
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

  const hasValidCid = (mail: any) =>
    mail?.cid && (mail.cid.startsWith("Qm") || mail.cid.startsWith("bafy"))

  const openMail = async (mail: any) => {
    setLoadingMail(true)
    setPassInput("")
    setPassError("")
    try {
      const cached = await getCachedMail(mail.id)
      if (cached?.decryptedMessage) {
        setSelectedMail({ ...mail, message: cached.decryptedMessage, attachments: cached.attachments || [], isDecrypted: true })
        setLoadingMail(false); return
      }
      if (hasValidCid(mail)) {
        try {
          const { fetchFromIPFS } = await import("@/utils/ipfs")
          const parsed = await fetchFromIPFS(mail.cid)
          const msg = parsed.message || ""
          const encrypted = msg.includes("-----BEGIN PGP MESSAGE-----")
          setSelectedMail({ ...mail, message: msg, isDecrypted: !encrypted, isEncrypted: encrypted, attachments: parsed.attachments || [] })
          setLoadingMail(false); return
        } catch (e) {
          console.warn("Manual fetch fallback failed:", e)
        }
      }
      const backup = mail.message || cached?.message || ""
      setSelectedMail({ ...mail, message: backup, isDecrypted: !backup.includes("-----BEGIN PGP MESSAGE-----") })
    } catch { } finally { setLoadingMail(false) }
  }

  const decryptMail = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!selectedMail?.message) { setPassError("No message content."); return }
    const password = passInput || user.password
    if (!password) { setPassError("Password not found. Please enter your password."); return }

    setDecrypting(true)
    setPassError("")

    try {
      const decrypted = await decryptMessage(selectedMail.message, user.privateKey, password)
      const cleanedBody = decrypted.replace(/\[IPFS Attachment: [^\]]+\]/g, "").trim()
      const updated = { ...selectedMail, message: cleanedBody, isDecrypted: true }
      setSelectedMail(updated)
      await updateCachedMail(selectedMail.id, {
        decryptedMessage: cleanedBody,
        isDecrypted: true,
        message: selectedMail.message,
        attachments: selectedMail.attachments,
      })
      setShowPassModal(false)
      setPassInput("")
    } catch (err: any) {
      const errMsg = err?.message || ""
      if (errMsg.includes("session key") || errMsg.includes("decrypt")) {
        setPassError("This message was not encrypted for your keys.")
      } else if (errMsg.includes("passphrase") || errMsg.includes("password")) {
        setPassError("Incorrect password.")
      } else {
        setPassError(`Decryption failed: ${errMsg}`)
      }
    } finally {
      setDecrypting(false)
    }
  }

  const handleSendReply = async () => {
    const recipient = composeMode === "reply" ? replyTo : forwardTo
    if (!recipient || !replyBody.trim()) return
    setSendingReply(true)
    db.getUser(recipient, async (rData: any) => {
      // Fallback: try Nostr mesh if GunDB can't find the recipient
      if (!rData?.publicKey) {
        setReplyStatusMsg("🌐 Searching global mesh...")
        try {
          const { nostr } = await import("@/utils/nostr")
          const meshData = await nostr.find(recipient, true)
          if (meshData?.publicKey) rData = meshData
        } catch {}
      }

      // Proceed even without a key — encryptMessage handles unencrypted fallback
      const pubKey = rData?.publicKey || null
      const enc = await encryptMessage(replyBody, pubKey, recipient)
      await db.sendMail({ senderEmail: userEmail, receiverEmail: recipient, subject: replySubject, message: enc, time: new Date().toLocaleString(), status: "inbox", attachments: draftAttachments })
      setReplyStatus("success"); setReplyStatusMsg("Sent successfully.");
      setTimeout(() => { setComposeMode(null); setReplyBody(""); setDraftAttachments([]); }, 2000)
      setSendingReply(false)
    })
  }

  const filteredMails = mails.filter(m => {
    if (activeLabelId) return (mailTags[m.id] ?? []).includes(activeLabelId)
    const q = searchQuery.toLowerCase()
    return m.subject?.toLowerCase().includes(q) || m.senderEmail?.toLowerCase().includes(q)
  })

  const renderMailRow = (mail: any) => {
    const isUnread = !mail.isRead && mail.receiverEmail === userEmail
    const senderRaw = mail.senderEmail === userEmail ? "To: " + (mail.receiverEmail?.split("@")[0] || "Recipient") : (mail.senderEmail?.split("@")[0] || "Unknown")
    const senderName = senderRaw.charAt(0).toUpperCase() + senderRaw.slice(1)
    const colors = ["#d4a017", "#c9871a", "#9a6b0e", "#b8750a", "#8a5a08"]
    const avatarColor = colors[(senderName.charCodeAt(0) || 0) % colors.length]

    return (
      <div
        key={mail.id}
        onClick={() => openMail(mail)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 8px 0 4px",
          minHeight: "52px",
          cursor: "pointer",
          borderBottom: "1px solid rgba(212,160,23,0.07)",
          background: "transparent",
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

        {/* Star Area — fixed 56px */}
        <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: "56px", marginRight: "8px" }}>
          <button
            onClick={(e) => { e.stopPropagation(); updateMailInStore(mail.id, { isStarred: false }) }}
            className="chromeless-btn"
            style={{ padding: "2px" }}
          >
            <Star size={15} fill="var(--gold-mid)" color="var(--gold-mid)" />
          </button>
        </div>

        {/* Sender — fixed 160px */}
        <div className="mail-sender" style={{ width: "160px", flexShrink: 0, marginRight: "12px", border: "none", fontSize: "13px", fontWeight: isUnread ? "700" : "500", color: isUnread ? "var(--text-bright)" : "var(--text-muted)" }}>
          {senderName}
        </div>

        {/* Subject + Snippet */}
        <div className="mail-content" style={{ flex: 1, border: "none", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
          <span className="mail-subject" style={{ fontWeight: isUnread ? "700" : "500", color: isUnread ? "var(--text-bright)" : "var(--text-muted)", fontSize: "13px", flexShrink: 0, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {mail.subject || "(No subject)"}
          </span>
          <span style={{ color: "var(--text-muted)", opacity: 0.5, margin: "0 2px", fontSize: "12px" }}>—</span>
          <span className="mail-snippet" style={{ fontSize: "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
             {mail.isDecrypted ? mail.message?.slice(0, 100) : "🔒 Encrypted Content"}
          </span>
        </div>

        {/* Date */}
        <div style={{ flexShrink: 0, fontSize: "12px", marginLeft: "12px", width: "62px", textAlign: "right", color: "var(--text-dim)" }}>
          {formatMailDate(mail.time)}
        </div>
      </div>
    )
  }

  const renderReader = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px", background: "var(--bg-panel)" }}>
      {/* Back Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
         <button onClick={() => setSelectedMail(null)} className="chromeless-btn" style={{ padding: "8px 16px", fontSize: "12px", fontWeight: "800", color: "var(--gold-mid)" }}>
           <ChevronLeft size={16} /> ALL STARRED mail
         </button>
      </div>

      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "28px", fontFamily: "Cinzel, serif", color: "var(--text-bright)", marginBottom: "32px", letterSpacing: "1px" }}>{selectedMail.subject}</h1>
        
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--gold-mid)", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "18px" }}>
            {selectedMail.senderEmail?.[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px" }}>{selectedMail.senderEmail}</div>
            <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>to me • {selectedMail.time}</div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
             <button onClick={() => { setComposeMode("reply"); setReplyTo(selectedMail.senderEmail); setReplySubject(`Re: ${selectedMail.subject}`); setReplyBody(`\n\n---\nOn ${selectedMail.time}, ${selectedMail.senderEmail} wrote:\n${selectedMail.message}`); }} className="chromeless-btn"><Reply size={18} /></button>
             <button onClick={() => updateMailInStore(selectedMail.id, { status: "trash" })} className="chromeless-btn hover-error"><Trash2 size={18} /></button>
          </div>
        </div>

        <div style={{ minHeight: "400px" }}>
          {!selectedMail.isDecrypted ? (
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
                    This message is end-to-end encrypted. Enter your DMail password to unlock.
                  </p>
                  <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      background: "rgba(212,160,23,0.1)", padding: "8px 16px", borderRadius: "8px",
                      border: "1px solid var(--border-gold)", color: "var(--gold-mid)", fontSize: "12px", fontWeight: "700"
                    }}>
                      <Lock size={12} /> ECC Curve25519
                    </div>
                    <button
                      onClick={() => setShowPassModal(true)}
                      className="btn"
                      style={{ padding: "8px 24px", fontSize: "12px" }}
                    >
                      UNLOCK MESSAGE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ 
              whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "15px", 
              color: "var(--text-bright)", fontFamily: "Inter, sans-serif",
              maxWidth: "900px"
            }}>
              {selectedMail.message}
            </div>
          )}
        </div>

        {composeMode && (
          <div style={{ marginTop: "64px", border: "1px solid var(--border-gold)", borderRadius: "16px", background: "var(--bg-card)", overflow: "hidden" }}>
             <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(212,160,23,0.1)" }}>
                <span style={{ color: "var(--gold-mid)", fontWeight: "800", fontSize: "12px" }}>REPLYING SECURELY</span>
                <button onClick={() => setComposeMode(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>✕</button>
             </div>
             <textarea 
              value={replyBody} 
              onChange={e => setReplyBody(e.target.value)} 
              style={{ width: "100%", minHeight: "200px", background: "none", border: "none", padding: "24px", color: "var(--text-bright)", outline: "none", resize: "none", fontSize: "15px" }} 
              placeholder="Write your response..."
             />
             <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(212,160,23,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={handleSendReply} className="labeled-action-btn" style={{ padding: "12px 32px" }}>
                  {sendingReply ? "SENDING..." : "SEND SECURELY"}
                </button>
        {replyStatusMsg && <div style={{ fontSize: "12px", color: replyStatus === "error" ? "#e84234" : "var(--gold-mid)" }}>{replyStatusMsg}</div>}
             </div>
          </div>
        )}
      </div>
      {showPassModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ animation: "fadeUp 0.3s ease" }}>
            <h3 style={{ fontFamily: "Cinzel, serif", color: "var(--gold-mid)", marginBottom: "16px" }}>Verify Identity</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Enter your DMail account password to securely decrypt this message.
            </p>
            <input
              type="password"
              className="auth-input"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="Your password"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && decryptMail()}
              style={{ marginBottom: "10px" }}
            />
            {passError && <p style={{ color: "#e84234", fontSize: "12px", marginBottom: "20px", fontWeight: "600" }}>{passError}</p>}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={() => setShowPassModal(false)} className="chromeless-btn" style={{ padding: "10px 20px" }}>CANCEL</button>
              <button className="btn" onClick={decryptMail} disabled={decrypting}>
                {decrypting ? "UNLOCKING..." : "UNLOCK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {!selectedMail && (
        <PageHeader 
          title="Starred Messages" 
          count={filteredMails.length} 
          searchQuery={searchQuery} 
          onSearchChange={setSearchQuery} 
          placeholder="Search within favorites..."
        />
      )}

      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {loadingMail && <div style={{ position: "absolute", inset: 0, background: "var(--bg-card)", opacity: 0.8, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>Verifying Payload...</div>}
        
        {!selectedMail ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filteredMails.map(renderMailRow)}
            {filteredMails.length === 0 && (
              <div style={{ padding: "100px 40px", textAlign: "center", color: "var(--text-muted)" }}>
                 <Star size={48} style={{ opacity: 0.1, marginBottom: "20px" }} />
                 <div style={{ fontSize: "18px", fontWeight: "600" }}>Your favorite messages will appear here.</div>
                 <div style={{ fontSize: "13px", opacity: 0.6 }}>No starred decentralized data found.</div>
              </div>
            )}
          </div>
        ) : renderReader()}
      </div>
    </div>
  )
}