"use client"

import { useState, useEffect } from "react"
import CryptoJS from "crypto-js"

interface ComposeProps {
  onClose: () => void;
}

export default function Compose({ onClose }: ComposeProps) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [destructTime, setDestructTime] = useState("0") // Minutes
  
  // NEW: State to track if recipient exists in directory
  const [recipient, setRecipient] = useState<any>(null)

  // Effect to validate recipient as user types
  useEffect(() => {
    if (to.includes("@")) {
      const directory = JSON.parse(localStorage.getItem("directory") || "[]")
      const found = directory.find((u: any) => u.email.toLowerCase() === to.toLowerCase())
      setRecipient(found || null)
    } else {
      setRecipient(null)
    }
  }, [to])

  const handleSend = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")

    // Use the recipient found in our useEffect
    if (!recipient) {
      alert("Recipient not found in secure directory! Cannot encrypt message.")
      return
    }

    if (!message) {
      alert("Please enter a message.")
      return
    }

    // 3. Encrypt Message with Receiver's Public Key
    const encryptedMsg = CryptoJS.AES.encrypt(message, recipient.publicKey).toString()

    const currentTime = new Date().toLocaleString()
    const timestamp = Date.now()
    let expiry = null
    if (destructTime !== "0") {
      expiry = timestamp + parseInt(destructTime) * 60 * 1000
    }

    const newMail = {
      id: crypto.randomUUID(),
      senderEmail: user.email,
      receiverEmail: to,
      subject: subject || "(No Subject)",
      message: encryptedMsg,
      time: currentTime,
      timestamp: timestamp,
      status: 'outbox',
      isPending: true,
      isImportant: false,
      isStarred: false,
      expiryTime: expiry,
      isEncrypted: true
    }

    const updatedMails = [newMail, ...allMails]
    localStorage.setItem("mails", JSON.stringify(updatedMails))
    window.dispatchEvent(new Event('storage'))

    setTimeout(() => {
      const currentMails = JSON.parse(localStorage.getItem("mails") || "[]")
      const deliveredMails = currentMails.map((m: any) => {
        if (m.id === newMail.id) {
          return { ...m, status: 'sent', isPending: false }
        }
        return m
      })
      localStorage.setItem("mails", JSON.stringify(deliveredMails))
      window.dispatchEvent(new Event('storage'))
    }, 2000); 

    onClose()
  }

  // Determine if we should show the "No Key" warning
  const showWarning = to.includes("@") && !recipient;

  return (
    <div className="compose-modal">
      <div className="compose-header">
        <span>New Secure Message</span>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>
      
      <div className="compose-body">
        {/* WARNING BANNER */}
        {showWarning && (
          <div style={{
            background: "rgba(217, 48, 37, 0.1)",
            border: "1px solid rgba(217, 48, 37, 0.3)",
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "12px",
            display: "flex",
            gap: "10px",
            color: "#ff8a80",
            fontSize: "13px"
          }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span>
              <strong>Recipient has no PGP key.</strong> You cannot send an encrypted message to this address.
            </span>
          </div>
        )}

        <div className="input-group">
          <input 
            type="email" 
            placeholder="Recipient Email" 
            value={to} 
            onChange={(e) => setTo(e.target.value)}
            style={{ 
              borderColor: showWarning ? "rgba(217, 48, 37, 0.5)" : "var(--border-gold)" 
            }}
          />
        </div>
        
        <div className="input-group">
          <input 
            type="text" 
            placeholder="Subject" 
            value={subject} 
            onChange={(e) => setSubject(e.target.value)} 
          />
        </div>

        <textarea 
          placeholder="Type your encrypted message here..." 
          value={message} 
          onChange={(e) => setMessage(e.target.value)}
        ></textarea>

        <div className="compose-footer">
          <div className="footer-options">
            <button 
              className="send-btn" 
              onClick={handleSend}
              disabled={!recipient} // Disable if no key is found
              style={{
                background: !recipient ? "#444" : "var(--gold-mid)",
                color: !recipient ? "#888" : "#000",
                cursor: !recipient ? "not-allowed" : "pointer"
              }}
            >
              {recipient ? "Send Securely 🔒" : "Encryption Unavailable"}
            </button>
            
            <div className="destruct-dropdown">
              <label>🔥 Self-Destruct:</label>
              <select value={destructTime} onChange={(e) => setDestructTime(e.target.value)}>
                <option value="0">Off</option>
                <option value="1">1 Min</option>
                <option value="60">1 Hour</option>
                <option value="1440">1 Day</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}