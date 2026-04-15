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
        const res = await fetch(`${getLocalNode(8080)}/ipfs/${mail.cid}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
        if (res && res.ok) {
          const parsed = await res.json()
          let msg = parsed.message
          let encrypted = msg.includes("-----BEGIN PGP MESSAGE-----")
          setSelectedMail({ ...mail, message: msg, isDecrypted: !encrypted, isEncrypted: encrypted, attachments: parsed.attachments || [] })
          setLoadingMail(false); return
        }
      }
      const backup = mail.message || cached?.message || ""
      setSelectedMail({ ...mail, message: backup, isDecrypted: !backup.includes("-----BEGIN PGP MESSAGE-----") })
    } catch { } finally { setLoadingMail(false) }
  }

  const decryptMail = async () => {
    const u = JSON.parse(localStorage.getItem("user") || "{}")
    if (passInput !== u.password) { setPassError("Incorrect password."); return }
    setDecrypting(true)
    try {
      const dec = await decryptMessage(selectedMail.message, u.privateKey, passInput)
      setSelectedMail({ ...selectedMail, message: dec, isDecrypted: true })
      setPassInput("")
    } catch { setPassError("Decryption failed.") }
    finally { setDecrypting(false) }
  }

  const handleSendReply = async () => {
    const recipient = composeMode === "reply" ? replyTo : forwardTo
    if (!recipient || !replyBody.trim()) return
    setSendingReply(true)
    db.getUser(recipient, async (rData: any) => {
      if (!rData?.publicKey) { setReplyStatus("error"); setReplyStatusMsg("Recipient not found."); setSendingReply(false); return; }
      const enc = await encryptMessage(replyBody, rData.publicKey)
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
    return (
      <div 
        key={mail.id} 
        onClick={() => openMail(mail)}
        className={`mail-row-full ${isUnread ? 'unread' : ''}`}
        style={{ 
          display: "flex", alignItems: "center", padding: "12px 24px", 
          borderBottom: "1px solid rgba(212,160,23,0.1)", cursor: "pointer",
          gap: "24px", background: "var(--bg-card)", transition: "all 0.2s"
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexShrink: 0 }}>
           <button onClick={e => { e.stopPropagation(); updateMailInStore(mail.id, { isStarred: false }) }} style={{ background: "none", border: "none", cursor: "pointer" }}>
             <Star size={18} fill="var(--gold-mid)" color="var(--gold-mid)" />
           </button>
           <div style={{ width: "160px", fontSize: "14px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
             {mail.senderEmail?.split("@")[0]}
           </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
           <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-bright)", whiteSpace: "nowrap" }}>{mail.subject}</span>
           <span style={{ fontSize: "13px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
             {" — "}
             {mail.isDecrypted ? (
               <>
                 <span style={{ color: "var(--gold-mid)", fontWeight: "700", fontSize: "10px", textTransform: "uppercase", marginRight: "8px" }}>
                   🔓 Decrypted
                 </span>
                 {mail.message?.slice(0, 60)}
               </>
             ) : mail.message?.includes("-----BEGIN") || mail.isEncrypted ? (
               <span style={{ color: "var(--gold-mid)", fontWeight: "800", fontSize: "11px", textTransform: "uppercase" }}>
                 🔒 Secure PGP Payload
               </span>
             ) : mail.message?.slice(0, 80)}
           </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", textAlign: "right", width: "100px", flexShrink: 0 }}>
           {mail.time?.split(",")[0]}
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
              padding: "56px 40px", background: "var(--bg-vault)", 
              backdropFilter: "blur(20px)", border: "1px solid var(--border-gold)", 
              borderRadius: "28px", maxWidth: "800px", 
              boxShadow: "0 30px 80px rgba(0,0,0,0.2), var(--glow-gold-subtle)",
              animation: "slideRight 0.6s cubic-bezier(0.23, 1, 0.32, 1) both"
            }}>
              <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0 }}>
                   <Shield size={64} color="var(--gold-mid)" strokeWidth={1} />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "20px", color: "var(--text-bright)", marginBottom: "12px" }}>SECURE IDENTITY VAULT</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px", lineHeight: "1.7" }}>
                    This communication is end-to-end PGP encrypted. Verified identity is required to decrypt the payload.
                  </p>
                  <div style={{ position: "relative", maxWidth: "440px" }}>
                    <input 
                      type="password" 
                      placeholder="Enter Vault Passphrase..." 
                      value={passInput}
                      onChange={(e) => setPassInput(e.target.value)}
                      style={{ 
                        width: "100%", background: "var(--bg-vault-input)", 
                        border: "1px solid rgba(212,160,23,0.2)", borderRadius: "14px", 
                        padding: "18px", color: "var(--gold-mid)", outline: "none", fontSize: "15px"
                      }}
                    />
                    {passError && <div style={{ color: "#e84234", fontSize: "12px", marginTop: "8px" }}>{passError}</div>}
                    <button 
                      onClick={decryptMail}
                      disabled={decrypting || !passInput}
                      style={{
                        marginTop: "24px", width: "100%",
                        background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                        border: "none", borderRadius: "14px", padding: "18px",
                        color: "#000", fontWeight: "900", cursor: "pointer", boxShadow: "var(--glow-gold)"
                      }}
                    >
                      {decrypting ? "AUTHENTICATING..." : "UNLOCK PAYLOAD"}
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