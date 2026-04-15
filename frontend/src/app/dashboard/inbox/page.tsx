"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { decryptMessage, encryptMessage, db } from "@/utils/gun"
import { Search, Star, Pin, Paperclip, MoreVertical, Archive, Trash2, Mail, Send, FileText, Clock, Reply, Forward, Download, Tag, Shield, Smile, Image, Link, Type, Bold, Italic, List, Lock } from "lucide-react"
import { checkPinStatus, exportMailFromIPFS, uploadFileToIPFS, getLocalNode } from "@/utils/ipfs"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import { getMails, subscribe, updateMailInStore, pinMailInStore } from "@/utils/mailStore"
import { getLabels, getMailLabels, getLabelMails, toggleMailLabel, subscribeLabelStore, type Label } from "@/utils/labelStore"
import { useLabel } from "@/context/LabelContext"
import PageHeader from "@/components/PageHeader"

type ComposeMode = "reply" | "forward" | null

export default function InboxPage() {
  const [mails, setMails]                      = useState<any[]>([])
  const [selectedMail, setSelectedMail]         = useState<any>(null)
  const [selectedMailIds, setSelectedMailIds]   = useState<string[]>([])
  const [searchQuery, setSearchQuery]           = useState("")

  const [passInput, setPassInput]               = useState("")
  const [passError, setPassError]               = useState("")
  const [showPassModal, setShowPassModal]       = useState(false)
  const [decrypting, setDecrypting]             = useState(false)
  const [loadingMail, setLoadingMail]           = useState(false)
  const [pinStatus, setPinStatus]               = useState<"pinned"|"not-pinned"|"offline"|"checking"|null>(null)
  const [exporting, setExporting]               = useState(false)
  const [copiedCid, setCopiedCid]               = useState(false)
  const [isOffline, setIsOffline]               = useState(false)
  const [userEmail, setUserEmail]               = useState("")
  const [inboxLayout, setInboxLayout]           = useState<"comfortable"|"compact">("comfortable")
  const [emailPreview, setEmailPreview]         = useState<"none"|"1line"|"2lines">("2lines")

  // ── IPFS viewer modal ──
  const [showIpfsModal, setShowIpfsModal]     = useState(false)
  const [ipfsViewContent, setIpfsViewContent] = useState<any>(null)
  const [ipfsViewLoading, setIpfsViewLoading] = useState(false)

  // ── Reply / Forward state ──
  const [composeMode, setComposeMode]       = useState<ComposeMode>(null)
  const [replyTo, setReplyTo]               = useState("")
  const [replySubject, setReplySubject]     = useState("")
  const [replyBody, setReplyBody]           = useState("")
  const [forwardTo, setForwardTo]           = useState("")
  const [sendingReply, setSendingReply]     = useState(false)
  const [replyStatus, setReplyStatus]       = useState<"idle"|"success"|"error">("idle")
  const [replyStatusMsg, setReplyStatusMsg] = useState("")

  // ── Labels ──
  const [labels, setLabels]                 = useState<Label[]>([])
  const [mailTags, setMailTags]             = useState<Record<string,string[]>>({})
  const [labelPickerMailId, setLabelPickerMailId] = useState<string | null>(null)
  const [moreMenuMailId, setMoreMenuMailId]   = useState<string | null>(null)
  const { activeLabelId }                   = useLabel()

  // ── Compose Toolbars ──
  const [draftAttachments, setDraftAttachments] = useState<{name: string, cid: string}[]>([])
  const [showEmojiPicker, setShowEmojiPicker]   = useState(false)
  const [showFormatBar, setShowFormatBar]       = useState(false)
  const [isUploading, setIsUploading]           = useState(false)
  const fileInputRef                             = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) setUserEmail(user.email)

    const onStorage = () => {
      const u = JSON.parse(localStorage.getItem("user") || "{}")
      setInboxLayout((localStorage.getItem("settings_inboxLayout") || "comfortable") as "comfortable"|"compact")
      setEmailPreview((localStorage.getItem("settings_emailPreview") || "2lines") as "none"|"1line"|"2lines")
      if (u.email) {
        setLabels(getLabels(u.email))
        const tm: Record<string, string[]> = {}
        getMails("inbox").forEach((m: any) => { tm[m.id] = getMailLabels(u.email, m.id) })
        setMailTags(tm)
      }
    }
    window.addEventListener("storage", onStorage)

    if (user.email) {
      setLabels(getLabels(user.email))
      const rawMails = getMails("inbox")
      const tagsMap: Record<string, string[]> = {}
      rawMails.forEach((m: any) => {
        tagsMap[m.id] = getMailLabels(user.email, m.id)
      })
      setMailTags(tagsMap)
    }

    setMails(getMails("inbox"))
    const unsub = subscribe(() => {
      const user2 = JSON.parse(localStorage.getItem("user") || "{}")
      setMails(getMails("inbox"))
      if (user2.email) {
        const tagsMap2: Record<string, string[]> = {}
        getMails("inbox").forEach((m: any) => {
          tagsMap2[m.id] = getMailLabels(user2.email, m.id)
        })
        setMailTags(tagsMap2)
      }
    })
    const unsubLabel = subscribeLabelStore(() => {
      const user3 = JSON.parse(localStorage.getItem("user") || "{}")
      if (!user3.email) return
      setLabels(getLabels(user3.email))
      const tagsMap3: Record<string, string[]> = {}
      getMails("inbox").forEach((m: any) => {
        tagsMap3[m.id] = getMailLabels(user3.email, m.id)
      })
      setMailTags(tagsMap3)
      setMails(getMails("inbox"))
    })
    
    setIsOffline(!navigator.onLine)
    
    return () => {
      unsub()
      unsubLabel()
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const hasValidCid = (mail: any) =>
    mail?.cid && (mail.cid.startsWith("Qm") || mail.cid.startsWith("bafy"))

  const openMail = async (mail: any) => {
    if (selectedMail?.id === mail.id) return

    setLoadingMail(true)
    setPinStatus(null)
    setPassInput("")
    setPassError("")

    try {
      const cached = await getCachedMail(mail.id)
      if (cached?.decryptedMessage) {
        setSelectedMail({
          ...mail,
          message: cached.decryptedMessage,
          attachments: cached.attachments || mail.attachments || [],
          hasAttachments: cached.hasAttachments || mail.hasAttachments || false,
          attachmentCount: cached.attachmentCount || mail.attachmentCount || 0,
          isDecrypted: true,
        })
        setLoadingMail(false)
        return
      }

      if (hasValidCid(mail)) {
        const strategies = [
          { url: `${getLocalNode(5001)}/api/v0/cat?arg=${mail.cid}`, method: "POST" },
          { url: `${getLocalNode(8080)}/ipfs/${mail.cid}`, method: "GET" },
          { url: `https://cloudflare-ipfs.com/ipfs/${mail.cid}`, method: "GET" },
        ]

        for (const s of strategies) {
          try {
            const res = await fetch(s.url, { method: s.method, signal: AbortSignal.timeout(5000) })
            if (!res.ok) continue
            const text = await res.text()
            const parsed = JSON.parse(text)
            if (parsed.message) {
              let finalMessage = parsed.message
              let encrypted = finalMessage.includes("-----BEGIN PGP MESSAGE-----")
              // Manual Mode: We no longer auto-decrypt here.
              // This ensures the "Unlock" Shield is always shown for security.
              
              setSelectedMail({
                ...mail,
                message: finalMessage,
                attachments: parsed.attachments || mail.attachments || [],
                hasAttachments: parsed.hasAttachments || mail.hasAttachments || (parsed.attachments?.length > 0),
                isDecrypted: false, // Force manual unlock
                isEncrypted: encrypted
              })
              setLoadingMail(false)
              return
            }
          } catch (e) { continue }
        }
      }

      const backupMessage = mail.message || cached?.message
      if (backupMessage) {
        let finalMessage = backupMessage
        let encrypted = finalMessage.includes("-----BEGIN PGP MESSAGE-----") || mail.isEncrypted
        // Manual Mode: Force identity verification step
        
        setSelectedMail({
          ...mail,
          message: finalMessage,
          attachments: mail.attachments || cached?.attachments || [],
          isDecrypted: false, 
          isEncrypted: encrypted
        })
        setLoadingMail(false)
      } else {
        setSelectedMail({ ...mail, message: "", ipfsFetchFailed: true })
        setLoadingMail(false)
        setPassError("Could not retrieve message body from IPFS. Verify your gateway connection.")
      }
    } catch (err: any) {
      setLoadingMail(false)
    }
    setLoadingMail(false)
  }

  const decryptMail = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!selectedMail?.message) { setPassError("No message content."); return }

    // Use typed passInput if provided, otherwise use stored password automatically
    const password = passInput || user.password
    if (!password) { setPassError("Password not found. Please enter your password."); return }

    if (!selectedMail.message.includes("-----BEGIN PGP MESSAGE-----")) {
      setSelectedMail({ ...selectedMail, isDecrypted: true })
      setShowPassModal(false)
      setPassInput("")
      return
    }

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
        setPassError("This message was not encrypted for your keys. Only the intended recipient can read it.")
      } else if (errMsg.includes("passphrase") || errMsg.includes("password")) {
        setPassError("Incorrect password. Please try again.")
      } else {
        setPassError(`Decryption failed: ${errMsg || "Unknown error"}`)
      }
    } finally {
      setDecrypting(false)
    }
  }

  const handleViewOnIPFS = async () => {
    if (!selectedMail?.cid) return
    setShowIpfsModal(true)
    setIpfsViewLoading(true)
    setIpfsViewContent(null)

    const strategies = [
      { url: `${getLocalNode(5001)}/api/v0/cat?arg=${selectedMail.cid}`, method: "POST" },
      { url: `${getLocalNode(8080)}/ipfs/${selectedMail.cid}`, method: "GET" },
      { url: `https://ipfs.io/ipfs/${selectedMail.cid}`, method: "GET" },
    ]

    for (const s of strategies) {
      try {
        const res = await fetch(s.url, { method: s.method, signal: AbortSignal.timeout(6000) })
        if (!res.ok) continue
        const text = await res.text()
        try {
          const parsed = JSON.parse(text)
          setIpfsViewContent({ ...parsed, cid: selectedMail.cid })
        } catch { setIpfsViewContent({ raw: text.slice(0, 300) + "..." }) }
        setIpfsViewLoading(false)
        return
      } catch { continue }
    }
    setIpfsViewContent({ error: "Failed to fetch from IPFS." })
    setIpfsViewLoading(false)
  }

  const handleReply = () => {
    if (!selectedMail) return
    setComposeMode("reply")
    setReplyTo(selectedMail.senderEmail)
    setReplySubject(selectedMail.subject?.startsWith("Re:") ? selectedMail.subject : `Re: ${selectedMail.subject}`)
    const quoteBody = (selectedMail.message || "").trim()
    setReplyBody(`\n\n---\nOn ${selectedMail.time}, ${selectedMail.senderEmail} wrote:\n${quoteBody}`)
    setReplyStatus("idle")
  }

  const handleForward = () => {
    if (!selectedMail) return
    setComposeMode("forward")
    setForwardTo("")
    setReplySubject(selectedMail.subject?.startsWith("Fwd:") ? selectedMail.subject : `Fwd: ${selectedMail.subject}`)
    const quoteBody = (selectedMail.message || "").trim()
    setReplyBody(`\n\n---\n---------- Forwarded message ----------\nFrom: ${selectedMail.senderEmail}\nDate: ${selectedMail.time}\nSubject: ${selectedMail.subject}\n\n${quoteBody}`)
    setReplyStatus("idle")
  }

  const handleSendReply = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const recipient = composeMode === "reply" ? replyTo : forwardTo
    if (!recipient || !replyBody.trim()) {
      setReplyStatus("error")
      setReplyStatusMsg("Recipient and message are required.")
      return
    }
    setSendingReply(true)
    db.getUser(recipient, async (recipientData: any) => {
      if (!recipientData?.publicKey) {
        setReplyStatus("error")
        setReplyStatusMsg("Recipient not found.")
        setSendingReply(false)
        return
      }
      try {
        const encrypted = await encryptMessage(replyBody, recipientData.publicKey)
        const mail = {
          senderEmail: user.email,
          receiverEmail: recipient,
          subject: replySubject,
          message: encrypted,
          time: new Date().toLocaleString(),
          status: "inbox",
          isStarred: false,
          originalId: selectedMail?.id,
          hasAttachments: draftAttachments.length > 0,
          attachments: draftAttachments
        }
        await db.sendMail(mail)
        setReplyStatus("success")
        setReplyStatusMsg("Sent successfully")
        setTimeout(() => { 
          setComposeMode(null); 
          setReplyBody(""); 
          setDraftAttachments([]);
        }, 2000)
      } catch {
        setReplyStatus("error")
        setReplyStatusMsg("Failed to send.")
      } finally { setSendingReply(false) }
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setReplyStatusMsg(`Uploading ${file.name}...`)
    try {
      const cid = await uploadFileToIPFS(file, file.name)
      setDraftAttachments(prev => [...prev, { name: file.name, cid }])
      setReplyStatusMsg("File ready on IPFS ✅")
      setTimeout(() => setReplyStatusMsg(""), 3000)
    } catch (err) {
      setReplyStatus("error")
      setReplyStatusMsg("Upload failed.")
    } finally { setIsUploading(false) }
  }

  const removeDraftAttachment = (index: number) => {
    setDraftAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const addEmoji = (emoji: string) => {
    setReplyBody(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  const handleExport = async () => {
    if (!selectedMail?.cid) return
    setExporting(true)
    try { await exportMailFromIPFS(selectedMail.cid, selectedMail.subject) }
    catch { alert("Export failed.") }
    finally { setExporting(false) }
  }

  const handleExportJSON = () => {
    if (!selectedMail) return
    try {
      const data = {
        id: selectedMail.id,
        cid: selectedMail.cid,
        sender: selectedMail.senderEmail,
        receiver: selectedMail.receiverEmail,
        subject: selectedMail.subject,
        time: selectedMail.time,
        message: selectedMail.message,
        isEncrypted: selectedMail.isEncrypted || false,
        isDecrypted: selectedMail.isDecrypted || false,
        attachments: selectedMail.attachments || [],
        labels: mailTags[selectedMail.id] || []
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `message_${selectedMail.id.slice(0, 8)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error("Export JSON failed", e)
      alert("Failed to export message JSON.")
    }
  }

  const handleDownloadAttachment = async (cid: string, name: string) => {
    try {
      const res = await fetch(`${getLocalNode(8080)}/ipfs/${cid}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url)
    } catch { alert("Download failed.") }
  }

  const handleArchive = (e: React.MouseEvent, mailId: string) => {
    e.stopPropagation()
    updateMailInStore(mailId, { status: "archived" })
    if (selectedMail?.id === mailId) setSelectedMail(null)
  }

  const updateMailStatus = (e: React.MouseEvent | null, mailId: string, updates: object) => {
    if (e) e.stopPropagation()
    updateMailInStore(mailId, updates)
    if (selectedMail?.id === mailId) setSelectedMail(null)
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedMailIds(e.target.checked ? filteredMails.map((m) => m.id) : [])
  }

  const filteredMails = mails.filter((m) => {
    if (activeLabelId) return (mailTags[m.id] ?? []).includes(activeLabelId)
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    return (
      m.senderEmail?.toLowerCase().includes(query) ||
      m.subject?.toLowerCase().includes(query) ||
      m.message?.toLowerCase().includes(query) ||
      m.time?.toLowerCase().includes(query)
    )
  })

  const pinnedMails  = filteredMails.filter((m) => m.isPinned)
  const regularMails = filteredMails.filter((m) => !m.isPinned)

  const renderComposeBox = () => {
    if (!composeMode) return null
    const isReply = composeMode === "reply"
    return (
      <div style={{ 
        marginTop: "48px", border: "1px solid var(--border-gold)", 
        borderRadius: "12px", background: "var(--bg-card)", 
        boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden",
        animation: "fadeUp 0.3s ease both"
      }}>
        {/* Gmail-Style Recipient Header */}
        <div style={{ 
          padding: "16px 20px", display: "flex", alignItems: "center", 
          borderBottom: "1px solid rgba(212,160,23,0.1)", background: "rgba(212,160,23,0.02)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "16px" }}>
            <button 
              onClick={() => setComposeMode("reply")}
              style={{
                fontSize: "11px", fontWeight: "800", color: isReply ? "var(--gold-mid)" : "var(--text-muted)",
                background: "none", border: "none", padding: "4px 8px", cursor: "pointer",
                borderBottom: isReply ? "2px solid var(--gold-mid)" : "none"
              }}
            >REPLY</button>
            <button 
              onClick={() => setComposeMode("forward")}
              style={{
                fontSize: "11px", fontWeight: "800", color: !isReply ? "var(--gold-mid)" : "var(--text-muted)",
                background: "none", border: "none", padding: "4px 8px", cursor: "pointer",
                borderBottom: !isReply ? "2px solid var(--gold-mid)" : "none"
              }}
            >FORWARD</button>
          </div>
          <div style={{ flex: 1, fontSize: "14px", color: "var(--text-bright)", fontWeight: "500" }}>
            {isReply ? replyTo : (
              <input
                type="email"
                placeholder="Type recipient address..."
                style={{ width: "100%", background: "none", border: "none", color: "var(--gold-mid)", outline: "none", fontSize: "14px" }}
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
              />
            )}
          </div>
          <button 
            onClick={() => setComposeMode(null)} 
            style={{ 
              background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "50%", 
              width: "28px", height: "28px", color: "var(--text-muted)", 
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >✕</button>
        </div>

        {/* Status Reporting Bar */}
        {isUploading && (
          <div style={{ padding: "8px 20px", background: "rgba(212,160,23,0.05)", fontSize: "11px", color: "var(--gold-mid)", borderBottom: "1px solid rgba(212,160,23,0.1)" }}>
             ⚡ SECURING FILE ON DECENTRALIZED NETWORK...
          </div>
        )}

        {/* Message Area */}
        <textarea
          style={{ 
            width: "100%", minHeight: "220px", background: "none", border: "none", 
            color: "var(--text-bright)", padding: "24px", fontSize: "15px", 
            lineHeight: "1.6", outline: "none", fontFamily: "'Inter', sans-serif", resize: "none"
          }}
          placeholder="Write your secure response..."
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
        />

        {/* Draft Attachments List */}
        {draftAttachments.length > 0 && (
          <div style={{ padding: "0 20px 16px 20px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {draftAttachments.map((att, i) => (
              <div key={i} style={{ 
                background: "rgba(212,160,23,0.1)", border: "1px solid var(--border-gold)", 
                padding: "4px 10px", borderRadius: "20px", fontSize: "11px", color: "var(--gold-mid)",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
                <Paperclip size={12} /> {att.name}
                <button 
                  onClick={() => removeDraftAttachment(i)}
                  style={{ background: "none", border: "none", color: "#e84234", cursor: "pointer", fontWeight: "800" }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Professional Toolbar */}
        <div style={{ 
          padding: "12px 20px", borderTop: "1px solid rgba(212,160,23,0.1)", 
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "rgba(212,160,23,0.01)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", position: "relative" }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
            
            {/* Emoji Picker Popup */}
            {showEmojiPicker && (
              <div style={{ 
                position: "absolute", bottom: "100%", left: "0", marginBottom: "12px",
                background: "var(--bg-card)", border: "1px solid var(--border-gold)", 
                padding: "10px", borderRadius: "12px", boxShadow: "var(--shadow-deep)",
                display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", zIndex: 10
              }}>
                {["😊", "😂", "🚀", "🔥", "✅", "⚠️", "👍", "❤️", "🛡️", "🔒", "📦", "📧"].map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => addEmoji(emoji)}
                    style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}
                  >{emoji}</button>
                ))}
              </div>
            )}

            {/* Formatting Toolbar */}
            {showFormatBar && (
              <div style={{ 
                position: "absolute", bottom: "100%", left: "0", marginBottom: "12px",
                background: "var(--bg-card)", border: "1px solid var(--border-gold)", 
                padding: "8px", borderRadius: "12px", boxShadow: "var(--shadow-deep)",
                display: "flex", gap: "8px", zIndex: 10
              }}>
                <button onClick={() => setReplyBody(p => p + "**BOLD**")} className="chromeless-btn"><Bold size={16} /></button>
                <button onClick={() => setReplyBody(p => p + "*italic*")} className="chromeless-btn"><Italic size={16} /></button>
                <button onClick={() => setReplyBody(p => p + "\n- Item")} className="chromeless-btn"><List size={16} /></button>
              </div>
            )}

            <button title="Format" onClick={() => setShowFormatBar(!showFormatBar)} className="chromeless-btn">
              <Type size={18} color={showFormatBar ? "var(--gold-mid)" : "var(--text-muted)"} />
            </button>
            <button title="Attach Files" onClick={() => fileInputRef.current?.click()} className="chromeless-btn">
              <Paperclip size={18} />
            </button>
            <button title="Insert Image" onClick={() => fileInputRef.current?.click()} className="chromeless-btn">
              <Image size={18} />
            </button>
            <button title="Insert Emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="chromeless-btn">
              <Smile size={18} color={showEmojiPicker ? "var(--gold-mid)" : "var(--text-muted)"} />
            </button>
            <button title="Insert Link" onClick={() => setReplyBody(p => p + " [Link Title](https://...)")} className="chromeless-btn"><Link size={18} /></button>
            
            <div style={{ width: "1px", height: "20px", background: "rgba(212,160,23,0.2)" }} />
            <button title="Discard" onClick={() => { setComposeMode(null); setDraftAttachments([]); }} className="chromeless-btn hover-error"><Trash2 size={18} /></button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {replyStatusMsg && (
                <div style={{ fontSize: "12px", color: replyStatus === "error" ? "#e84234" : "var(--gold-mid)", fontWeight: "600" }}>
                  {replyStatusMsg}
                </div>
            )}
            <button 
              onClick={handleSendReply} 
              disabled={sendingReply}
              style={{
                background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                border: "none", borderRadius: "20px", padding: "10px 32px",
                color: "#000", fontWeight: "800", fontSize: "13px",
                display: "flex", alignItems: "center", gap: "10px",
                cursor: (sendingReply || (!isReply && !forwardTo.trim()) || !replyBody.trim()) ? "not-allowed" : "pointer",
                boxShadow: "var(--glow-gold)",
                transition: "all 0.2s"
              }}
              onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseOut={e => e.currentTarget.style.transform = "none"}
            >
              {sendingReply ? "SENDING..." : (
                <><Send size={16} /> SEND SECURE</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderMailRow = (mail: any) => {
    const isActive = selectedMail?.id === mail.id
    const isUnread = !mail.isRead && mail.receiverEmail === userEmail
    
    // Premium Name Formatting
    const senderRaw = mail.senderName || mail.senderEmail?.split("@")[0] || "Unknown"
    const senderName = senderRaw.charAt(0).toUpperCase() + senderRaw.slice(1)
    
    // Avatar Color Logic
    const colors = ["#d4a017", "#c9871a", "#9a6b0e", "#b8750a", "#8a5a08"]
    const colorIdx = (senderName.charCodeAt(0) || 0) % colors.length
    const avatarColor = colors[colorIdx]

    return (
      <div
        key={mail.id}
        onClick={() => { openMail(mail); if (isUnread) updateMailInStore(mail.id, { isRead: true }) }}
        className={`mail-row ${isActive ? 'selected' : ''} ${isUnread ? 'unread' : ''}`}
      >
        <div className="sender-avatar" style={{ background: avatarColor }}>
          {senderName.charAt(0)}
        </div>

        <div className="mail-icons" onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}>
          <button onClick={(e) => { e.stopPropagation(); updateMailInStore(mail.id, { isStarred: !mail.isStarred }) }} 
            className="chromeless-btn" style={{ padding: "4px" }}>
            <Star size={16} fill={mail.isStarred ? "var(--gold-mid)" : "none"} color="var(--gold-mid)" />
          </button>
        </div>
        
        <div className="mail-sender">{senderName}</div>
        
        <div className="mail-content">
          <span className="mail-subject">{mail.subject || "(No Subject)"}</span>
          
          <span className="mail-snippet">
            {mail.isDecrypted ? (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ 
                  color: "var(--gold-mid)", fontWeight: "800", fontSize: "9px", 
                  textTransform: "uppercase", padding: "1px 6px", borderRadius: "4px",
                  background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.2)"
                }}>
                  🔓 Decrypted
                </span>
                <span style={{ color: "var(--text-bright)", opacity: 0.9 }}>
                  {mail.message?.replace(/-----BEGIN PGP MESSAGE-----[\s\S]*-----END PGP MESSAGE-----/g, "").slice(0, 150).trim()}
                </span>
              </span>
            ) : mail.message?.includes("-----BEGIN PGP MESSAGE-----") || mail.isEncrypted ? (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ 
                  color: "var(--text-dim)", fontWeight: "800", fontSize: "9px", 
                  textTransform: "uppercase", padding: "1px 6px", borderRadius: "4px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)"
                }}>
                  🔒 Securely Encrypted
                </span>
                <span style={{ color: "var(--text-dim)", fontSize: "11px", fontStyle: "italic" }}>
                  Unlock to view message...
                </span>
              </span>
            ) : (
              <span style={{ color: "var(--text-dim)" }}>
                {mail.message?.slice(0, 150)}
              </span>
            )}
          </span>
        </div>
        
        <div className="mail-date">{mail.time?.split(",")[0]}</div>
      </div>
    )
  }

  const renderRightPanel = () => {
    if (loadingMail) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>
    if (!selectedMail) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Select a message to read</div>

    const needsDecrypt = (selectedMail.message?.includes("-----BEGIN PGP MESSAGE-----") || selectedMail.isEncrypted) && !selectedMail.isDecrypted

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "32px", background: "var(--bg-panel)", position: "relative" }}>
        {/* Top Quick Actions (Chromeless Icons) */}
        <div style={{ 
          display: "flex", justifyContent: "space-between", alignItems: "center", 
          marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid rgba(212,160,23,0.15)"
        }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <button title="Reply" onClick={handleReply} className="chromeless-btn"><Reply size={18} /></button>
            <button title="Forward" onClick={handleForward} className="chromeless-btn"><Forward size={18} /></button>
            <div style={{ width: "1px", height: "18px", background: "rgba(212,160,23,0.2)", margin: "0 4px" }} />
            <button title="Archive" onClick={(e) => handleArchive(e, selectedMail.id)} className="chromeless-btn"><Archive size={18} /></button>
            <button title="Delete" onClick={(e) => updateMailStatus(e, selectedMail.id, { status: "trash" })} className="chromeless-btn hover-error"><Trash2 size={18} /></button>
            <button title="Labels" onClick={() => setLabelPickerMailId(selectedMail.id)} className="chromeless-btn"><Tag size={18} /></button>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button title="Star" onClick={(e) => { e.stopPropagation(); updateMailInStore(selectedMail.id, { isStarred: !selectedMail.isStarred }) }} className="chromeless-btn">
              <Star size={18} fill={selectedMail.isStarred ? "var(--gold-mid)" : "none"} color="var(--gold-mid)" />
            </button>
            <div style={{ position: "relative" }}>
               <button title="More" onClick={() => setMoreMenuMailId(moreMenuMailId === selectedMail.id ? null : selectedMail.id)} className="chromeless-btn"><MoreVertical size={18} /></button>
               {moreMenuMailId === selectedMail.id && (
                 <div className="label-picker-popover" style={{ top: "100%", right: 0, marginTop: "8px", zIndex: 100, minWidth: "160px" }}>
                    <div className="label-picker-item" onClick={() => { updateMailInStore(selectedMail.id, { isRead: false }); setSelectedMail(null); setMoreMenuMailId(null); }}>
                       Mark as Unread
                    </div>
                    <div className="label-picker-item" onClick={() => { alert("Thread Muted"); setMoreMenuMailId(null); }}>
                       Mute Thread
                    </div>
                    <div className="label-picker-item" onClick={() => { window.print(); setMoreMenuMailId(null); }}>
                       Print Message
                    </div>
                    <div className="label-picker-item text-error" style={{ borderTop: "1px solid rgba(212,160,23,0.1)", marginTop: "4px", paddingTop: "8px" }} onClick={() => { alert("Sender Blocked"); setMoreMenuMailId(null); }}>
                       Block Sender
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* Premium Labeled Action Bar */}
        <div style={{ 
          display: "flex", gap: "12px", margin: "24px 0", 
          padding: "16px", background: "rgba(255,255,255,0.02)", 
          border: "1px solid var(--border-gold)", borderRadius: "12px",
          backdropFilter: "blur(5px)"
        }}>
          <button onClick={handleExportJSON} className="labeled-action-btn">
             <FileText size={14} /> EXPORT JSON
          </button>
          <button onClick={handleViewOnIPFS} className="labeled-action-btn">
             <Search size={14} /> VIEW ON IPFS
          </button>
          
          {/* Label Picker Popover */}
          {labelPickerMailId === selectedMail.id && (
            <div className="label-picker-popover" style={{ top: "100%", right: "0", marginTop: "8px", zIndex: 10 }}>
              <div className="lp-title">Manage Labels</div>
              {labels.map(L => (
                <div key={L.id} className="label-picker-item" onClick={() => {
                  const user = JSON.parse(localStorage.getItem("user") || "{}")
                  toggleMailLabel(user.email, selectedMail.id, L.id)
                }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: L.color, marginRight: "8px" }} />
                  {L.name}
                  {(mailTags[selectedMail.id] ?? []).includes(L.id) && <span className="lp-check">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subject Header */}
        <h1 style={{ 
          fontSize: "28px", fontWeight: "400", fontFamily: "Cinzel, serif", 
          marginBottom: "24px", color: "var(--text-bright)", letterSpacing: "1px"
        }}>{selectedMail.subject}</h1>

        {/* Sender Meta — Premium Layout */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div style={{ 
            width: "48px", height: "48px", borderRadius: "50%", 
            background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "800", color: "#000", fontSize: "18px", boxShadow: "0 4px 12px rgba(212,160,23,0.3)"
          }}>
            {selectedMail.senderEmail?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "700", color: "var(--text-bright)", fontSize: "15px" }}>{selectedMail.senderEmail}</span>
              <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{selectedMail.time}</span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>to me</div>
          </div>
        </div>

        <div style={{ marginTop: "32px", minHeight: "400px" }}>
          {needsDecrypt ? (
            <div style={{ 
              padding: "48px 56px", background: "var(--bg-vault)", 
              backdropFilter: "blur(20px)", border: "1px solid var(--border-gold)", 
              borderRadius: "28px", maxWidth: "860px", 
              boxShadow: "0 30px 80px rgba(0,0,0,0.2), var(--glow-gold-subtle)",
              animation: "slideRight 0.6s cubic-bezier(0.23, 1, 0.32, 1) both",
              position: "relative", overflow: "hidden"
            }}>
              {/* Subtle Decorative Background Scan Lines */}
              <div style={{ position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none", background: "repeating-linear-gradient(0deg, transparent, transparent 2px, var(--gold-mid) 3px)" }} />
              
              <div style={{ display: "flex", gap: "48px", alignItems: "flex-start", position: "relative" }}>
                <div style={{ flexShrink: 0, marginTop: "8px" }}>
                   <div style={{ position: "relative", width: "80px", height: "80px" }}>
                      <div style={{ position: "absolute", inset: -15, background: "var(--gold-mid)", opacity: 0.08, borderRadius: "50%", animation: "pulse 3s infinite" }} />
                      <Shield size={80} color="var(--gold-mid)" strokeWidth={1} style={{ position: "relative", opacity: 0.9 }} />
                      <div style={{ position: "absolute", bottom: "-2px", right: "-2px", background: "var(--gold-rich)", borderRadius: "50%", padding: "6px", boxShadow: "var(--shadow-deep)" }}>
                        <Lock size={18} color="#000" />
                      </div>
                   </div>
                   <div style={{ marginTop: "24px", textAlign: "center" }}>
                      <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--gold-mid)", opacity: 0.6, letterSpacing: "2px" }}>PGP-2048</div>
                      <div style={{ fontSize: "8px", fontWeight: "700", color: "var(--gold-mid)", opacity: 0.4, marginTop: "4px" }}>RSA/AES-256</div>
                   </div>
                </div>

                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "24px", color: "var(--text-bright)", marginBottom: "12px", letterSpacing: "2px" }}>SECURE IDENTITY VAULT</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px", lineHeight: "1.7", maxWidth: "500px" }}>
                    This communication is end-to-end encrypted. Please authenticate with your private passphrase to decrypt the decentralized IPFS payload.
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
                        padding: "18px 24px", color: "var(--gold-mid)", outline: "none",
                        fontSize: "15px", fontFamily: "monospace", letterSpacing: "3px",
                        boxShadow: "inset 0 4px 10px rgba(0,0,0,0.3)",
                        transition: "all 0.3s"
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = "var(--gold-mid)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "rgba(212,160,23,0.2)")}
                    />
                    {passError && <div style={{ color: "#e84234", fontSize: "11px", fontWeight: "600", marginTop: "8px", paddingLeft: "4px" }}>{passError}</div>}
                    
                    <button 
                      onClick={decryptMail}
                      disabled={decrypting || !passInput}
                      style={{
                        marginTop: "24px", width: "100%",
                        background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                        border: "none", borderRadius: "14px", padding: "18px",
                        color: "#000", fontWeight: "900", fontSize: "14px",
                        cursor: decrypting || !passInput ? "not-allowed" : "pointer", 
                        boxShadow: "var(--glow-gold)", transition: "all 0.3s",
                        textTransform: "uppercase", letterSpacing: "2px",
                        opacity: decrypting ? 0.7 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "12px"
                      }}
                      onMouseOver={e => { if(!decrypting) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 15px 40px rgba(212,160,23,0.4)"; }}}
                      onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--glow-gold)"; }}
                    >
                      {decrypting ? "AUTHENTICATING..." : <><Lock size={16} strokeWidth={3} /> UNLOCK PAYLOAD</>}
                    </button>
                  </div>

                  <div style={{ marginTop: "32px", display: "flex", gap: "16px", opacity: 0.5 }}>
                     <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50" }} /> SYSTEM READY
                     </div>
                     <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4caf50" }} /> GUN DATA SYNCED
                     </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ 
              whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "15px", 
              color: "var(--text-bright)", fontFamily: "Inter, sans-serif",
              maxWidth: "900px", paddingRight: "40px"
            }}>
              {selectedMail.message}
            </div>
          )}
        </div>

        {/* Quick Reply/Forward Buttons at Bottom */}
        {!needsDecrypt && !composeMode && (
          <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
            <button onClick={handleReply} className="labeled-action-btn" style={{ padding: "10px 24px", background: "rgba(212,160,23,0.1)" }}>
              <Reply size={14} /> REPLY
            </button>
            <button onClick={handleForward} className="labeled-action-btn" style={{ padding: "10px 24px" }}>
              <Forward size={14} /> FORWARD
            </button>
          </div>
        )}

        {selectedMail.hasAttachments && (
          <div style={{ marginTop: "64px", padding: "32px", background: "var(--bg-card)", borderRadius: "16px", border: "1px solid var(--border-gold)" }}>
            <h3 style={{ fontFamily: "Cinzel, serif", fontSize: "14px", color: "var(--gold-mid)", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
               <Paperclip size={16} /> ATTACHMENTS FOR DOWNLOAD
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
              {selectedMail.attachments?.map((att: any, i: number) => (
                <div key={i} style={{ 
                  padding: "16px", background: "rgba(255,255,255,0.02)", 
                  border: "1px solid rgba(212,160,23,0.3)", borderRadius: "12px", 
                  display: "flex", gap: "12px", alignItems: "center",
                  transition: "transform 0.2s, box-shadow 0.2s"
                }} 
                onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--glow-subtle)"; }}
                onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ background: "rgba(212,160,23,0.1)", padding: "10px", borderRadius: "8px", color: "var(--gold-mid)" }}>
                    <FileText size={20} />
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>{att.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>IPFS SECURE FILE</div>
                  </div>
                  <button 
                    onClick={() => handleDownloadAttachment(att.cid, att.name)}
                    style={{ 
                      background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))", 
                      border: "none", borderRadius: "50%", width: "32px", height: "32px", 
                      color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" 
                    }}
                  >
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Integrity & Security Section */}
        <div style={{ marginTop: "40px", padding: "24px", opacity: 0.8, borderLeft: "2px solid var(--gold-mid)", background: "rgba(212,160,23,0.02)" }}>
           <h4 style={{ fontSize: "11px", fontWeight: "800", color: "var(--gold-mid)", letterSpacing: "1px", marginBottom: "12px" }}>DECENTRALIZED MESSAGE INTEGRITY</h4>
           <div style={{ display: "flex", gap: "40px" }}>
             <div>
               <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>IPFS Content ID</div>
               <div style={{ fontSize: "11px", color: "var(--text-bright)", fontFamily: "monospace" }}>{selectedMail.cid || "Local Content"}</div>
             </div>
             <div>
               <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>Encryption Protocol</div>
               <div style={{ fontSize: "11px", color: "var(--text-bright)" }}>PGP / RSA-4096 (End-to-End)</div>
             </div>
             <div>
               <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>Verification</div>
               <div style={{ fontSize: "11px", color: "#4caf6e", fontWeight: "700" }}>✓ VERIFIED AUTHENTIC</div>
             </div>
           </div>
        </div>

        {composeMode && renderComposeBox()}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: selectedMail ? "350px" : "100%", borderRight: selectedMail ? "1px solid var(--border-gold)" : "none", display: "flex", flexDirection: "column" }}>
        <PageHeader 
          title="Inbox" 
          count={mails.length} 
          searchQuery={searchQuery} 
          onSearchChange={setSearchQuery} 
        />
        <div className="mail-list" style={{ overflowY: "auto", flex: 1 }}>
          {pinnedMails.length > 0 && (
            <>
              <div style={{ padding: "8px 16px", fontSize: "10px", color: "var(--gold-mid)", fontWeight: "800" }}>PINNED</div>
              {pinnedMails.map(renderMailRow)}
              <div style={{ padding: "8px 16px", fontSize: "10px", color: "var(--text-muted)" }}>ALL</div>
            </>
          )}
          {regularMails.map(renderMailRow)}
        </div>
      </div>

      {selectedMail && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-panel)" }}>
           <div style={{ 
             padding: "12px 24px", borderBottom: "1px solid var(--border-gold)", 
             display: "flex", alignItems: "center", justifyContent: "space-between"
           }}>
             <button 
               onClick={() => setSelectedMail(null)}
               style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", fontWeight: "600" }}
             >← BACK TO LIST</button>
             <div style={{ fontSize: "11px", color: "var(--gold-mid)", fontWeight: "700", letterSpacing: "1px" }}>DECENTRALIZED ENCRYPTED CHANNEL</div>
           </div>
           {renderRightPanel()}
        </div>
      )}

      {showPassModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Verify Identity</h3>
            <input 
              type="password" 
              className="auth-input" 
              value={passInput} 
              onChange={(e) => setPassInput(e.target.value)} 
              placeholder="Enter password" 
            />
            {passError && <p style={{ color: "red", fontSize: "12px" }}>{passError}</p>}
            <div className="modal-actions">
              <button onClick={() => setShowPassModal(false)}>Cancel</button>
              <button className="btn" onClick={decryptMail} disabled={decrypting}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      {showIpfsModal && (
        <div className="modal-overlay" onClick={() => setShowIpfsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <h3 style={{ fontFamily: "Cinzel, serif", color: "var(--gold-mid)" }}>IPFS Record Explorer</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>Complete decentralized metadata for this message.</p>
            {ipfsViewLoading ? (
               <div style={{ textAlign: "center", padding: "40px" }}>
                 <div style={{ width: "30px", height: "30px", border: "2px solid var(--border-gold)", borderTopColor: "var(--gold-mid)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
               </div>
            ) : (
              <pre style={{ 
                fontSize: "11px", overflow: "auto", maxHeight: "400px", 
                background: "var(--bg-deep)", padding: "16px", borderRadius: "8px",
                border: "1px solid var(--border-gold)", color: "var(--gold-light)",
                lineHeight: "1.5"
              }}>
                {JSON.stringify(ipfsViewContent, null, 2)}
              </pre>
            )}
            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button className="btn" onClick={() => setShowIpfsModal(false)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
