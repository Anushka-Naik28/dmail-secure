"use client"

import { useState, useRef, useEffect } from "react"
import { db } from "@/utils/gun"
import { isStorageReady } from "@/utils/web3storage"
import { 
  PenLine, Save, Minus, Maximize2, Minimize2, X, 
  Check, WifiOff, AlertCircle, Send, Calendar, 
  Paperclip, Archive, Clock, ShieldCheck, AlertTriangle, Link, Lock
} from "lucide-react"

type StatusType = "idle" | "sending" | "success" | "error"
type WindowState = "open" | "minimized" | "maximized"

interface AttachedFile {
  id: string
  name: string
  size: string
  type: "local" | "ipfs"
  cid?: string
  data?: string
  rawFile?: File
}

interface ComposeWindowProps {
  onClose: () => void
  defaultTo?: string
  defaultSubject?: string
  defaultMessage?: string
}


export default function ComposeWindow({
  onClose,
  defaultTo = "",
  defaultSubject = "",
  defaultMessage = "",
}: ComposeWindowProps) {
  const [recipientEmail, setRecipientEmail] = useState(defaultTo)
  const [isFocused, setIsFocused] = useState(false)
  const [subject, setSubject]               = useState(defaultSubject)
  const [message, setMessage]               = useState(defaultMessage)
  const [status, setStatus]                 = useState<StatusType>("idle")
  const [statusMsg, setStatusMsg]           = useState("")
  const [windowState, setWindowState]       = useState<WindowState>("open")
  const [wasQueued, setWasQueued]           = useState(false)
  const [attachments, setAttachments]       = useState<AttachedFile[]>([])
  const [showSchedule, setShowSchedule]     = useState(false)
  const [scheduleDate, setScheduleDate]     = useState("")
  const [scheduleTime, setScheduleTime]     = useState("")
  const [ipfsCid, setIpfsCid]              = useState("")
  const [showIpfsInput, setShowIpfsInput]   = useState(false)
  const [draftSaved, setDraftSaved]         = useState(false)
  const [encryptionReady, setEncryptionReady] = useState<"checking" | "ready" | "no-key">("checking")

  const [storageReady, setStorageReady]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const normalizedRecipient = recipientEmail.trim().toLowerCase()
    if (!normalizedRecipient || !normalizedRecipient.includes("@")) {
      setEncryptionReady("checking")
      return
    }
    const isDmail = normalizedRecipient.endsWith("@dmail.com") || normalizedRecipient.endsWith("@securemail.com")
    if (!isDmail) {
      setEncryptionReady("no-key")
      return
    }
    const timer = setTimeout(() => {
      db.getUser(normalizedRecipient, (data: any) => {
        setEncryptionReady(data?.publicKey ? "ready" : "no-key")
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [recipientEmail])

  useEffect(() => {
    isStorageReady().then(setStorageReady)
  }, [])

  useEffect(() => {
    if (!subject && !message && !recipientEmail) return
    const timer = setInterval(() => saveDraft(true), 30000)
    return () => clearInterval(timer)
  }, [recipientEmail, subject, message])

  const saveDraft = (auto = false) => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    const normalizedEmail = user.email.trim().toLowerCase()
    const drafts = JSON.parse(localStorage.getItem(`drafts_${normalizedEmail}`) || "[]")
    const draft = {
      id:      `draft_${Date.now()}`,
      to:      recipientEmail.trim().toLowerCase(),
      subject,
      message,
      savedAt: new Date().toLocaleString(),
    }
    drafts.unshift(draft)
    localStorage.setItem(`drafts_${normalizedEmail}`, JSON.stringify(drafts.slice(0, 20)))
    if (!auto) {
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
    }
  }

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const newFile: AttachedFile = {
          id:   `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          type: "local",
          data: reader.result as string,
          rawFile: file,
        }
        setAttachments((prev) => [...prev, newFile])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  const handleIpfsAttach = () => {
    const cid = ipfsCid.trim()
    if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) return
    const newFile: AttachedFile = {
      id:   `ipfs_${Date.now()}`,
      name: `IPFS: ${cid.slice(0, 12)}...`,
      size: "Decentralized",
      type: "ipfs",
      cid,
    }
    setAttachments((prev) => [...prev, newFile])
    setIpfsCid("")
    setShowIpfsInput(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const sendMail = async () => {
    const userJson = localStorage.getItem("user")
    const user = userJson ? JSON.parse(userJson) : {}
    const normalizedRecipient = recipientEmail.trim().toLowerCase()
    
    if (!normalizedRecipient || !subject || !message) {
      setStatus("error")
      setStatusMsg("Please fill in all fields before sending.")
      return
    }

    try {
      const { sendMailInBackground } = await import("@/utils/backgroundSend")
      
      // 🔥 INSTANT DISPATCH: We don't wait for encryption/PoW/IPFS
      sendMailInBackground({
        user,
        recipientEmail: normalizedRecipient,
        subject,
        message,
        attachments,
        scheduleDate,
        scheduleTime
      })

      // Close immediately
      onClose()
      
    } catch (err: any) {
      setStatus("error")
      setStatusMsg(`Dispatch Error: ${err?.message}`)
    }
  }

  // ── Minimized pill ──────────────────────────────────────────
  if (windowState === "minimized") {
    return (
      <div
        onClick={() => setWindowState("open")}
        style={{
          position: "fixed", bottom: "0", right: "24px", zIndex: 1000,
          background: "var(--bg-card)", border: "1px solid var(--border-gold)",
          borderBottom: "none", borderRadius: "10px 10px 0 0",
          padding: "10px 20px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "10px",
          boxShadow: "var(--shadow-deep)",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
          <PenLine size={14} color="var(--gold-mid)" /> {subject || "New Message"}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {recipientEmail || "No recipient"}
        </span>
        <span style={{
          marginLeft: "8px", fontSize: "11px", color: "var(--text-muted)",
          padding: "2px 8px", borderRadius: "6px",
          background: "rgba(212, 175, 55,0.1)",
        }}>Expand</span>
      </div>
    )
  }

  const isMaximized = windowState === "maximized"

  return (
    <div style={{
      position: "fixed", zIndex: 1000,
      bottom:    isMaximized ? "0"     : "24px",
      right:     isMaximized ? "0"     : "24px",
      width:     isMaximized ? "100vw" : "800px",
      height:    isMaximized ? "100vh" : "600px",
      background: "var(--bg-input)",
      borderTop: "4px solid var(--gold-mid)",
      borderRadius: isMaximized ? "0" : "8px",
      boxShadow: "var(--shadow-deep)",
      display: "flex", flexDirection: "column",
      overflow: "hidden", transition: "all 0.2s ease",
      fontFamily: "Inter, sans-serif"
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 24px", background: "var(--bg-input)"
      }}>
        <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--gold-mid)" }}>
          New Message
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            background: "rgba(212, 175, 55, 0.1)", border: "1px solid rgba(212, 175, 55, 0.2)",
            borderRadius: "20px", padding: "4px 12px", display: "flex", alignItems: "center", gap: "8px"
          }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--gold-mid)" }} />
            <span style={{ fontSize: "11px", color: "var(--gold-mid)", fontWeight: "600" }}>E2E Encrypted · IPFS Storage</span>
          </div>
          <button onClick={onClose} style={{ background: "var(--border-color)", border: "none", color: "var(--text-dim)", borderRadius: "4px", width: "24px", height: "24px", cursor: "pointer", fontSize: "12px" }}>X</button>
        </div>
      </div>

      {/* ── Fields ── */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", width: "60px" }}>TO</span>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            {recipientEmail && recipientEmail.includes("@") && recipientEmail.split("@")[1].includes(".") && !isFocused ? (
              <div 
                onClick={() => setIsFocused(true)}
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "6px",
                  background: "rgba(212, 175, 55, 0.15)", 
                  color: "var(--gold-mid)", 
                  padding: "4px 12px", 
                  borderRadius: "4px", 
                  fontSize: "13px", 
                  fontWeight: "600",
                  cursor: "text"
                }}
              >
                {recipientEmail}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRecipientEmail(""); setIsFocused(true); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--gold-mid)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "2px",
                    opacity: 0.8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "0.8"}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <input
                style={{ background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "13px", flex: 1 }}
                placeholder="recipient@dmail.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoFocus={isFocused}
              />
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", width: "60px" }}>CC</span>
          <input style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "13px" }} />
        </div>
      </div>

      <div style={{ padding: "15px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "20px" }}>
        <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", width: "60px" }}>SUBJECT</span>
        <input
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "14px", fontWeight: "500" }}
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* ── Body ── */}
      <textarea
        style={{
          flex: 1, background: "none", border: "none", outline: "none",
          padding: "24px", fontSize: "15px", color: "var(--text-muted)",
          lineHeight: "1.8", resize: "none"
        }}
        placeholder="Write your message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {/* ── Attachments chips ── */}
      {attachments.length > 0 && (
        <div style={{ padding: "8px 24px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {attachments.map((att) => (
            <div key={att.id} style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "4px 12px", borderRadius: "4px",
              background: "var(--bg-input)", border: "1px solid var(--border-color)",
              fontSize: "12px", color: "var(--text-muted)"
            }}>
              {att.type === "ipfs" ? <Archive size={12} /> : <Paperclip size={12} />}
              <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
              <button onClick={() => removeAttachment(att.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center" }}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* ── IPFS CID input ── */}
      {showIpfsInput && (
        <div style={{ padding: "12px 24px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", gap: "10px", alignItems: "center", background: "var(--bg-input)" }}>
          <input
            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "4px", color: "var(--text-bright)", fontSize: "12px", outline: "none" }}
            placeholder="Paste IPFS CID (Qm...)"
            value={ipfsCid}
            onChange={(e) => setIpfsCid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIpfsAttach()}
            autoFocus
          />
          <button onClick={handleIpfsAttach} style={{ padding: "8px 16px", borderRadius: "4px", cursor: "pointer", background: "var(--gold-mid)", border: "none", color: "var(--bg-body)", fontSize: "11px", fontWeight: "700" }}>Attach</button>
          <button onClick={() => { setShowIpfsInput(false); setIpfsCid("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}><X size={18} /></button>
        </div>
      )}

      {/* ── Schedule picker ── */}
      {showSchedule && (
        <div style={{ padding: "12px 24px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "var(--bg-input)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "700" }}>SEND AT:</span>
          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
            style={{ padding: "6px 12px", borderRadius: "4px", background: "var(--bg-card)", border: "1px solid var(--border-color)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: "4px", background: "var(--bg-card)", border: "1px solid var(--border-color)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          <button onClick={() => { setShowSchedule(false); setScheduleDate(""); setScheduleTime("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)", fontSize: "11px", fontWeight: "700" }}>CLEAR</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ padding: "20px 24px", background: "var(--bg-input)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              width: "36px", height: "36px", background: "var(--border-color)", border: "none", 
              borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-dim)"
            }}
            title="Attach Local File"
          >
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileAttach} />

          <button 
            onClick={() => setShowIpfsInput(!showIpfsInput)}
            style={{ 
              width: "36px", height: "36px", background: showIpfsInput ? "rgba(212, 175, 55, 0.1)" : "var(--border-color)", 
              border: "none", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: showIpfsInput ? "var(--gold-mid)" : "var(--text-dim)"
            }}
            title="Attach IPFS CID"
          >
            <Archive size={18} />
          </button>

          <button 
            onClick={() => setShowSchedule(!showSchedule)}
            style={{ 
              width: "36px", height: "36px", background: showSchedule ? "rgba(212, 175, 55, 0.1)" : "var(--border-color)", 
              border: "none", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: showSchedule ? "var(--gold-mid)" : "var(--text-dim)"
            }}
            title="Schedule Send"
          >
            <Clock size={18} />
          </button>

          <div style={{ width: "1px", height: "36px", background: "var(--border-color)", margin: "0 5px" }} />
          
          <button style={{ 
            width: "36px", height: "36px", background: "var(--border-color)", border: "none", 
            borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--text-dim)"
          }}>
            <Lock size={18} />
          </button>
        </div>

        <button
          onClick={sendMail}
          disabled={status === "sending"}
          style={{
            background: "var(--gold-mid)", color: "var(--bg-body)", border: "none", 
            padding: "12px 28px", borderRadius: "8px", fontWeight: "700",
            fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
            boxShadow: "0 4px 15px rgba(212, 175, 55, 0.3)"
          }}
        >
          <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "10px solid var(--bg-body)" }} />
          {status === "sending" ? "Sending..." : "Send Encrypted"}
        </button>
      </div>
    </div>
  )
}
