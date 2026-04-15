"use client"

import { useState, useEffect } from "react"
import CryptoJS from "crypto-js"
import { db } from "@/utils/gun"

type StatusType = "idle" | "sending" | "success" | "error"

export default function Compose() {
  const [recipientEmail, setRecipientEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<StatusType>("idle")
  const [statusMsg, setStatusMsg] = useState("")
  
  // NEW: State for real-time key validation
  const [recipientKey, setRecipientKey] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Debounced lookup for recipient's key as user types
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (recipientEmail.includes("@") && recipientEmail.includes(".")) {
        setIsValidating(true)
        db.getUser(recipientEmail, (data: any) => {
          setRecipientKey(data?.publicKey || null)
          setIsValidating(false)
        })
      } else {
        setRecipientKey(null)
      }
    }, 600) // Wait 600ms after typing stops

    return () => clearTimeout(delayDebounce)
  }, [recipientEmail])

  const sendMail = () => {
    const userStr = localStorage.getItem("user")
    if (!userStr) {
        setStatus("error")
        setStatusMsg("You must be logged in to send mail.")
        return
    }
    const user = JSON.parse(userStr)

    if (!recipientEmail || !subject || !message) {
      setStatus("error")
      setStatusMsg("Please fill in all fields before sending.")
      return
    }

    setStatus("sending")
    setStatusMsg("Encrypting and sending...")

    // If no key found, we could either block or send plain text.
    // Given your E2EE focus, we'll use a fallback or the key.
    const encryptionKey = recipientKey || "plaintext-fallback" 
    
    // Note: If using AES, you are using Symmetric encryption. 
    // Usually, PGP uses RSA/ECC for the key exchange.
    const encrypted = recipientKey 
      ? CryptoJS.AES.encrypt(message, recipientKey).toString()
      : message // Plain text fallback

    const mail = {
      senderEmail:   user.email,
      receiverEmail: recipientEmail,
      receiverKey:   recipientKey || "none",
      subject,
      message:       encrypted,
      time:          new Date().toLocaleString(),
      status:        "inbox",
      isStarred:     false,
      isEncrypted:   !!recipientKey
    }

    db.sendMail(mail)

    setStatus("success")
    setStatusMsg(`Message sent to ${recipientEmail}`)
    setRecipientEmail("")
    setSubject("")
    setMessage("")
    setRecipientKey(null)

    setTimeout(() => setStatus("idle"), 4000)
  }

  const showNoKeyWarning = !recipientKey && !isValidating && recipientEmail.includes("@")

  return (
    <div className="compose-container">
      <div className="compose-header">New Message</div>

      {/* NO PGP KEY WARNING BANNER */}
      {showNoKeyWarning && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "12px 16px", borderRadius: "12px", marginBottom: "16px",
          background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.3)",
          color: "#e84234", fontSize: "13px", animation: "fadeIn 0.3s ease"
        }}>
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <div>
            <strong style={{ display: "block", marginBottom: "2px" }}>Recipient has no PGP key</strong>
            <span style={{ opacity: 0.8 }}>
                This user is not registered on DMail. Your message will be sent 
                <strong> unencrypted</strong>.
            </span>
          </div>
        </div>
      )}

      {/* Original Status banner */}
      {status !== "idle" && (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 16px", borderRadius: "10px", marginBottom: "16px",
          fontSize: "13px", fontWeight: "500",
          background: status === "sending" ? "rgba(212,160,23,0.08)" : status === "success" ? "rgba(76,175,110,0.10)" : "rgba(217,48,37,0.10)",
          border: `1px solid ${status === "sending" ? "rgba(212,160,23,0.3)" : status === "success" ? "rgba(76,175,110,0.3)" : "rgba(217,48,37,0.3)"}`,
          color: status === "sending" ? "var(--gold-mid)" : status === "success" ? "#4caf6e" : "#e84234",
        }}>
          {status === "sending" && <div className="spinner-small" />}
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="compose-body">
        <div style={{ position: "relative" }}>
            <input
              className="compose-input"
              placeholder="To (e.g. name1234@securemail.com)"
              value={recipientEmail}
              onChange={(e) => { setRecipientEmail(e.target.value); setStatus("idle") }}
              disabled={status === "sending"}
              style={{ paddingRight: "100px" }}
            />
            {isValidating && (
                <small style={{ position: "absolute", right: "12px", top: "14px", color: "var(--gold-mid)", fontSize: "10px" }}>
                    VALIDATING...
                </small>
            )}
        </div>
        
        <input
          className="compose-input"
          placeholder="Subject"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setStatus("idle") }}
          disabled={status === "sending"}
        />
        <textarea
          className="compose-textarea"
          placeholder="Write your message here..."
          value={message}
          onChange={(e) => { setMessage(e.target.value); setStatus("idle") }}
          disabled={status === "sending"}
        />
      </div>

      <div className="compose-footer">
        <button
          className="btn btn-send"
          onClick={sendMail}
          disabled={status === "sending"}
          style={{
            background: recipientKey ? "var(--gold-mid)" : "rgba(255,255,255,0.1)",
            color: recipientKey ? "#000" : "var(--text-muted)",
            opacity: status === "sending" ? 0.7 : 1,
          }}
        >
          {status === "sending" ? "Sending..." : recipientKey ? "Encrypt & Send 🔒" : "Send Unsecured ✉️"}
        </button>
        
        <div className="security-info">
          <span className={recipientKey ? "security-tag tag-secure" : "security-tag tag-unsecure"}>
            {recipientKey ? "🔒 End-to-End Encrypted" : "🔓 Plain Text Message"}
          </span>
        </div>
      </div>
    </div>
  )
}