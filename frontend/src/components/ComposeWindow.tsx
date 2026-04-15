"use client"

import { useState, useRef, useEffect } from "react"
import { db, encryptMessage, sendMailNow } from "@/utils/gun"
import { autoSaveContact } from "@/utils/contacts"
import { uploadFileToIPFS } from "@/utils/ipfs"
import { isStorageReady } from "@/utils/web3storage"

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

// ── Proof-of-Work ─────────────────────────────────────────────
// Finds a nonce such that SHA-256(mailHash + nonce) starts with `difficulty` zeros
// Runs in the browser using Web Crypto API — no server needed
const computePoW = async (
  mailHash: string,
  difficulty: number = 3,
  onProgress?: (nonce: number) => void
): Promise<{ nonce: number; hash: string }> => {
  const prefix = "0".repeat(difficulty)
  let nonce = 0

  while (true) {
    const input = `${mailHash}:${nonce}`
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input)
    )
    const hashArray = Array.from(new Uint8Array(buffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

    if (hashHex.startsWith(prefix)) {
      return { nonce, hash: hashHex }
    }

    nonce++
    if (nonce % 500 === 0 && onProgress) onProgress(nonce)

    // Yield to UI every 1000 iterations to avoid freezing
    if (nonce % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

// Hash the mail content to use as PoW challenge
const hashMailContent = async (
  senderEmail: string,
  recipientEmail: string,
  subject: string
): Promise<string> => {
  const content = `${senderEmail}:${recipientEmail}:${subject}:${Date.now()}`
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content)
  )
  const hashArray = Array.from(new Uint8Array(buffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export default function ComposeWindow({
  onClose,
  defaultTo = "",
  defaultSubject = "",
  defaultMessage = "",
}: ComposeWindowProps) {
  const [recipientEmail, setRecipientEmail] = useState(defaultTo)
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

  // ── PoW state ──
  const [powProgress, setPowProgress]     = useState(0)
  const [powHash, setPowHash]             = useState<string | null>(null)
  const [showPowInfo, setShowPowInfo]     = useState(false)
  const [storageReady, setStorageReady]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!recipientEmail || !recipientEmail.includes("@")) {
      setEncryptionReady("checking")
      return
    }
    const timer = setTimeout(() => {
      db.getUser(recipientEmail, (data: any) => {
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
    const drafts = JSON.parse(localStorage.getItem(`drafts_${user.email}`) || "[]")
    const draft = {
      id:      `draft_${Date.now()}`,
      to:      recipientEmail,
      subject,
      message,
      savedAt: new Date().toLocaleString(),
    }
    drafts.unshift(draft)
    localStorage.setItem(`drafts_${user.email}`, JSON.stringify(drafts.slice(0, 20)))
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
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!recipientEmail || !subject || !message) {
      setStatus("error")
      setStatusMsg("Please fill in all fields before sending.")
      return
    }

    setStatus("sending")
    setStatusMsg("Looking up recipient...")
    setWasQueued(false)
    setPowProgress(0)
    setPowHash(null)

    db.getUser(recipientEmail, async (recipientData: any) => {
      if (!recipientData?.publicKey) {
        setStatus("error")
        setStatusMsg("Recipient not found. Check the email and try again.")
        return
      }

      try {
        // ── Step 1: Proof-of-Work ──────────────────────────────
        setStatusMsg("⛏️ Computing proof-of-work...")
        const mailHash = await hashMailContent(user.email, recipientEmail, subject)

        const { nonce, hash } = await computePoW(
          mailHash,
          3, // difficulty: 3 leading zeros ≈ ~4000 iterations, ~100ms
          (n) => {
            setPowProgress(n)
            setStatusMsg(`⛏️ Proof-of-work... (${n.toLocaleString()} attempts)`)
          }
        )

        setPowHash(hash)
        console.log(`✅ PoW solved: nonce=${nonce}, hash=${hash}`)

        // ── Step 2: Encrypt ────────────────────────────────────
        setStatusMsg("🔒 Encrypting with PGP...")
        const encryptedMessage = await encryptMessage(message, recipientData.publicKey)

        // ── Step 3: Upload attachments ─────────────────────────
        const finalAttachments = []
        for (const att of attachments) {
          if (att.type === "local" && att.rawFile) {
            setStatusMsg(`📎 Uploading ${att.name} to IPFS...`)
            try {
              const cid = await uploadFileToIPFS(att.rawFile, att.name)
              finalAttachments.push({ ...att, type: "ipfs", cid, rawFile: undefined, data: undefined })
            } catch {
              setStatus("error")
              setStatusMsg(`Failed to upload ${att.name}`)
              return
            }
          } else {
            finalAttachments.push({ ...att, rawFile: undefined, data: undefined })
          }
        }

        const ipfsRefs = finalAttachments
          .filter((a) => a.type === "ipfs")
          .map((a) => `\n\n[IPFS Attachment: ${a.cid}]`)
          .join("")

        const mail = {
          senderEmail:     user.email,
          receiverEmail:   recipientEmail,
          subject,
          message:         encryptedMessage + ipfsRefs,
          time:            new Date().toLocaleString(),
          scheduledTimeText: scheduleDate && scheduleTime ? `${scheduleDate} ${scheduleTime}` : null,
          status:          "inbox",
          isStarred:       false,
          hasAttachments:  finalAttachments.length > 0,
          attachmentCount: finalAttachments.length,
          attachments:     finalAttachments,
          // ── PoW proof stored with mail ──
          pow: { nonce, hash, difficulty: 3 },
        }

        if (scheduleDate && scheduleTime) {
          const targetTime = new Date(`${scheduleDate}T${scheduleTime}`).getTime()
          const scheduledMail = { ...mail, targetTime, targetTimeText: `${scheduleDate} ${scheduleTime}`, id: `sched_${Date.now()}` }
          
          const scheduledMails = JSON.parse(localStorage.getItem(`scheduled_${user.email}`) || "[]")
          scheduledMails.push(scheduledMail)
          localStorage.setItem(`scheduled_${user.email}`, JSON.stringify(scheduledMails))
          
          setStatus("success")
          setStatusMsg(`✅ Scheduled for ${scheduleDate} ${scheduleTime}`)
        } else {
          setStatusMsg("📦 Sending to global network...")
          try {
            const id = await sendMailNow(mail)

            if (user.publicKey && user.privateKey && user.password) {
              await autoSaveContact(
                recipientEmail.split("@")[0], recipientEmail,
                user.email, user.publicKey, user.privateKey, user.password
              )
            }

            setStatus("success")
            setStatusMsg(`✅ Sent to ${recipientEmail}`)
          } catch (sendErr) {
            // If IPFS/GunDB fails, queue offline
            const { addToQueue } = await import("@/utils/offlineQueue")
            addToQueue(mail)
            setWasQueued(true)
            setStatus("success")
            setStatusMsg(`📴 Queued — will send when network is available`)
          }
        }

        setTimeout(() => onClose(), 1500)

      } catch {
        setStatus("error")
        setStatusMsg("Failed to send. Please try again.")
      }
    })
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
          boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
          fontFamily: "Raleway, sans-serif",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: "700" }}>
          ✏️ {subject || "New Message"}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {recipientEmail || "No recipient"}
        </span>
        <span style={{
          marginLeft: "8px", fontSize: "11px", color: "var(--text-muted)",
          padding: "2px 8px", borderRadius: "6px",
          background: "rgba(212,160,23,0.1)",
        }}>▲ Open</span>
      </div>
    )
  }

  const isMaximized = windowState === "maximized"

  return (
    <div style={{
      position: "fixed", zIndex: 1000,
      bottom:    isMaximized ? "0"     : "24px",
      right:     isMaximized ? "0"     : "24px",
      width:     isMaximized ? "100vw" : "540px",
      height:    isMaximized ? "100vh" : "auto",
      maxHeight: isMaximized ? "100vh" : "80vh",
      background: "var(--bg-card)",
      border: "1px solid var(--border-gold)",
      borderRadius: isMaximized ? "0" : "14px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      display: "flex", flexDirection: "column",
      overflow: "hidden", transition: "all 0.2s ease",
    }}>

      {/* ── Title bar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: "linear-gradient(135deg, rgba(212,160,23,0.12), rgba(212,160,23,0.06))",
        borderBottom: "1px solid var(--border-gold)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--text-bright)", fontFamily: "Raleway, sans-serif" }}>
          ✏️ New Message
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {draftSaved && (
            <span style={{ fontSize: "11px", color: "#4caf6e", marginRight: "4px" }}>💾 Draft saved</span>
          )}
          <button onClick={() => saveDraft(false)} title="Save Draft" style={{ background: "none", border: "1px solid var(--border-gold)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: "11px", fontFamily: "Raleway, sans-serif" }}>💾</button>
          <button onClick={() => setWindowState("minimized")} title="Minimize" style={{ background: "none", border: "1px solid var(--border-gold)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px" }}>─</button>
          <button onClick={() => setWindowState(isMaximized ? "open" : "maximized")} title={isMaximized ? "Restore" : "Maximize"} style={{ background: "none", border: "1px solid var(--border-gold)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: "11px" }}>{isMaximized ? "⊡" : "⊞"}</button>
          <button onClick={onClose} title="Close" style={{ background: "rgba(217,48,37,0.1)", border: "1px solid rgba(217,48,37,0.3)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", color: "#e84234", fontSize: "13px" }}>✕</button>
        </div>
      </div>

      {/* ── Status banner ── */}
      {status !== "idle" && (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "8px 16px", flexShrink: 0,
          fontSize: "12px", fontWeight: "500", fontFamily: "Raleway, sans-serif",
          borderBottom: "1px solid var(--border-gold)",
          background:
            status === "sending" ? "rgba(212,160,23,0.08)" :
            status === "success" && wasQueued ? "rgba(212,160,23,0.08)" :
            status === "success" ? "rgba(76,175,110,0.10)" :
            "rgba(217,48,37,0.10)",
          color:
            status === "sending" ? "var(--gold-mid)" :
            status === "success" && wasQueued ? "var(--gold-mid)" :
            status === "success" ? "#4caf6e" :
            "#e84234",
        }}>
          {status === "sending" && (
            <div style={{
              width: "12px", height: "12px", flexShrink: 0,
              border: "2px solid rgba(212,160,23,0.2)",
              borderTop: "2px solid var(--gold-mid)",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
          )}
          {status === "success" && !wasQueued && <span>✅</span>}
          {status === "success" &&  wasQueued && <span>📴</span>}
          {status === "error"   && <span>⚠️</span>}
          <span style={{ flex: 1 }}>{statusMsg}</span>

          {/* PoW progress bar during computation */}
          {status === "sending" && powProgress > 0 && !powHash && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <div style={{
                width: "60px", height: "4px", borderRadius: "2px",
                background: "rgba(212,160,23,0.2)", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: "2px",
                  background: "var(--gold-mid)",
                  width: `${Math.min((powProgress / 8000) * 100, 95)}%`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* PoW success checkmark */}
          {powHash && (
            <span style={{
              fontSize: "10px", padding: "2px 7px", borderRadius: "6px",
              background: "rgba(76,175,110,0.1)", color: "#4caf6e",
              border: "1px solid rgba(76,175,110,0.3)", flexShrink: 0,
            }}>⛏️ PoW ✓</span>
          )}
        </div>
      )}

      {/* ── To field ── */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(212,160,23,0.1)", padding: "0 16px", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", width: "40px", flexShrink: 0 }}>To</span>
        <input
          style={{ flex: 1, background: "none", border: "none", outline: "none", padding: "10px 0", fontSize: "13px", color: "var(--text-bright)", fontFamily: "Raleway, sans-serif" }}
          placeholder="recipient@securemail.com"
          value={recipientEmail}
          onChange={(e) => { setRecipientEmail(e.target.value); setStatus("idle") }}
          disabled={status === "sending"}
        />
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          fontSize: "11px", fontWeight: "700", flexShrink: 0,
          padding: "3px 8px", borderRadius: "6px",
          background: encryptionReady === "ready" ? "rgba(76,175,110,0.1)" : encryptionReady === "no-key" ? "rgba(217,48,37,0.1)" : "rgba(212,160,23,0.08)",
          color: encryptionReady === "ready" ? "#4caf6e" : encryptionReady === "no-key" ? "#e84234" : "var(--gold-mid)",
          border: `1px solid ${encryptionReady === "ready" ? "rgba(76,175,110,0.3)" : encryptionReady === "no-key" ? "rgba(217,48,37,0.3)" : "rgba(212,160,23,0.2)"}`,
        }}>
          {encryptionReady === "ready"    && <>🔒 PGP Ready</>}
          {encryptionReady === "no-key"   && <>⚠️ No Key</>}
          {encryptionReady === "checking" && <>🔑 …</>}
        </div>
      </div>

      {/* ── Subject field ── */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(212,160,23,0.1)", padding: "0 16px", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", width: "40px", flexShrink: 0 }}>Sub</span>
        <input
          style={{ flex: 1, background: "none", border: "none", outline: "none", padding: "10px 0", fontSize: "13px", color: "var(--text-bright)", fontFamily: "Raleway, sans-serif" }}
          placeholder="Subject"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setStatus("idle") }}
          disabled={status === "sending"}
        />
      </div>

      {/* ── Message body ── */}
      <textarea
        style={{
          flex: 1, background: "none", border: "none", outline: "none",
          padding: "14px 16px", fontSize: "13px", color: "var(--text-bright)",
          fontFamily: "Georgia, serif", lineHeight: "1.7", resize: "none",
          minHeight: isMaximized ? "auto" : "180px",
        }}
        placeholder="Write your encrypted message here..."
        value={message}
        onChange={(e) => { setMessage(e.target.value); setStatus("idle") }}
        disabled={status === "sending"}
      />

      {/* ── Attachments chips ── */}
      {attachments.length > 0 && (
        <div style={{ padding: "8px 16px", flexShrink: 0, borderTop: "1px solid rgba(212,160,23,0.1)", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {attachments.map((att) => (
            <div key={att.id} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 10px", borderRadius: "20px",
              background: att.type === "ipfs" ? "rgba(76,175,110,0.1)" : "rgba(212,160,23,0.08)",
              border: `1px solid ${att.type === "ipfs" ? "rgba(76,175,110,0.3)" : "rgba(212,160,23,0.2)"}`,
              fontSize: "11px", color: att.type === "ipfs" ? "#4caf6e" : "var(--text-bright)",
            }}>
              <span>{att.type === "ipfs" ? "📦" : "📎"}</span>
              <span style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>{att.size}</span>
              <button onClick={() => removeAttachment(att.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px", padding: "0" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── IPFS CID input ── */}
      {showIpfsInput && (
        <div style={{ padding: "8px 16px", flexShrink: 0, borderTop: "1px solid rgba(212,160,23,0.1)", display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            style={{ flex: 1, padding: "7px 12px", background: "var(--bg-panel)", border: "1px solid var(--border-gold)", borderRadius: "8px", color: "var(--text-bright)", fontFamily: "Courier New, monospace", fontSize: "11px", outline: "none" }}
            placeholder="Paste IPFS CID (Qm... or bafy...)"
            value={ipfsCid}
            onChange={(e) => setIpfsCid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIpfsAttach()}
            autoFocus
          />
          <button onClick={handleIpfsAttach} style={{ padding: "7px 12px", borderRadius: "8px", cursor: "pointer", background: "none", border: "1px solid rgba(76,175,110,0.4)", color: "#4caf6e", fontSize: "11px", fontFamily: "Raleway, sans-serif" }}>Attach</button>
          <button onClick={() => { setShowIpfsInput(false); setIpfsCid("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px" }}>✕</button>
        </div>
      )}

      {/* ── Schedule picker ── */}
      {showSchedule && (
        <div style={{ padding: "10px 16px", flexShrink: 0, borderTop: "1px solid rgba(212,160,23,0.1)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>⏰ Send at:</span>
          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
            style={{ padding: "5px 10px", borderRadius: "6px", background: "var(--bg-panel)", border: "1px solid var(--border-gold)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: "6px", background: "var(--bg-panel)", border: "1px solid var(--border-gold)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          {scheduleDate && scheduleTime && (
            <span style={{ fontSize: "11px", color: "#4caf6e" }}>✅ Scheduled for {scheduleDate} at {scheduleTime}</span>
          )}
          <button onClick={() => { setShowSchedule(false); setScheduleDate(""); setScheduleTime("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px" }}>Clear ✕</button>
        </div>
      )}

      {/* ── Footer toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 16px", flexShrink: 0,
        borderTop: "1px solid var(--border-gold)",
        background: "rgba(212,160,23,0.03)",
      }}>
        {/* Send */}
        <button
          onClick={sendMail}
          disabled={status === "sending"}
          style={{
            padding: "8px 20px",
            background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
            border: "none", borderRadius: "20px", cursor: "pointer",
            fontSize: "12px", fontWeight: "800", color: "#000",
            fontFamily: "Raleway, sans-serif",
            boxShadow: "0 2px 10px rgba(212,160,23,0.3)",
            opacity: status === "sending" ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          {status === "sending" ? (
            <>
              <span style={{ display: "inline-block", width: "11px", height: "11px", border: "2px solid rgba(0,0,0,0.2)", borderTop: "2px solid #000", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Sending...
            </>
          ) : (
            <>✉️ Send {scheduleDate ? "📅" : ""}</>
          )}
        </button>

        <div style={{ width: "1px", height: "20px", background: "var(--border-gold)" }} />

        {/* Attach local file */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach File"
          style={{ background: "none", border: "1px solid var(--border-gold)", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", transition: "all 0.15s" }}
          onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.color = "var(--gold-mid)"; ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold-mid)" }}
          onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-gold)" }}
        >📎</button>

        <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileAttach} />

        {/* Attach IPFS */}
        <button
          onClick={() => setShowIpfsInput(!showIpfsInput)}
          title="Attach IPFS CID"
          style={{ background: showIpfsInput ? "rgba(76,175,110,0.1)" : "none", border: `1px solid ${showIpfsInput ? "rgba(76,175,110,0.4)" : "var(--border-gold)"}`, borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: showIpfsInput ? "#4caf6e" : "var(--text-muted)", fontSize: "14px", transition: "all 0.15s" }}
        >📦</button>

        {/* Schedule */}
        <button
          onClick={() => setShowSchedule(!showSchedule)}
          title="Schedule Send"
          style={{ background: showSchedule ? "rgba(212,160,23,0.1)" : "none", border: `1px solid ${showSchedule ? "var(--gold-mid)" : "var(--border-gold)"}`, borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: showSchedule ? "var(--gold-mid)" : "var(--text-muted)", fontSize: "14px", transition: "all 0.15s" }}
        >⏰</button>

        {/* PoW info toggle */}
        <button
          onClick={() => setShowPowInfo(!showPowInfo)}
          title="Proof-of-Work spam prevention"
          style={{
            background: showPowInfo ? "rgba(212,160,23,0.1)" : "none",
            border: `1px solid ${showPowInfo ? "var(--gold-mid)" : "var(--border-gold)"}`,
            borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
            color: showPowInfo ? "var(--gold-mid)" : "var(--text-muted)",
            fontSize: "14px", transition: "all 0.15s",
          }}
        >⛏️</button>

        {/* Footer encryption indicator */}
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px",
          fontSize: "10px", fontWeight: "700", padding: "4px 10px", borderRadius: "8px",
          background: encryptionReady === "ready" ? "rgba(76,175,110,0.1)" : encryptionReady === "no-key" ? "rgba(217,48,37,0.08)" : "rgba(212,160,23,0.08)",
          border: `1px solid ${encryptionReady === "ready" ? "rgba(76,175,110,0.3)" : encryptionReady === "no-key" ? "rgba(217,48,37,0.25)" : "rgba(212,160,23,0.2)"}`,
          color: encryptionReady === "ready" ? "#4caf6e" : encryptionReady === "no-key" ? "#e84234" : "var(--gold-mid)",
        }}>
          {encryptionReady === "ready"    && <>🔒 PGP · Global Network · PoW</>}
          {encryptionReady === "no-key"   && <>⚠️ Recipient has no PGP key</>}
          {encryptionReady === "checking" && <>🔑 Awaiting recipient...</>}
        </div>
      </div>

      {/* ── PoW info panel ── */}
      {showPowInfo && (
        <div style={{
          padding: "12px 16px", flexShrink: 0,
          borderTop: "1px solid var(--border-gold)",
          background: "rgba(212,160,23,0.03)",
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "6px" }}>
            ⛏️ Proof-of-Work Spam Prevention
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.6" }}>
            Before every send, your device computes a small SHA-256 puzzle (difficulty: 3 leading zeros).
            This takes ~100ms for humans but makes mass spam computationally expensive.
            The proof is stored with each mail so receivers can verify it.
          </div>
          {powHash && (
            <div style={{
              marginTop: "8px", padding: "6px 10px", borderRadius: "6px",
              background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
              fontFamily: "Courier New, monospace", fontSize: "9px",
              color: "#4caf6e", wordBreak: "break-all",
            }}>
              Last hash: {powHash}
            </div>
          )}
        </div>
      )}
    </div>
  )
}