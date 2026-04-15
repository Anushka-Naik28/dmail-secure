"use client"

import { useEffect, useState } from "react"
import CryptoJS from "crypto-js"

export default function Received() {
  const [mails, setMails] = useState<any[]>([])
  const [selectedMail, setSelectedMail] = useState<any>(null)
  const [showPassModal, setShowPassModal] = useState(false)
  const [tempMail, setTempMail] = useState<any>(null)
  const [passInput, setPassInput] = useState("")

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")
    
    // Filtering mails specifically addressed to this user's Public Key
    const myMails = allMails.filter((mail: any) => mail.receiver === user.publicKey)
    setMails(myMails)
  }, [])

  const handleMailClick = (mail: any) => {
    setTempMail(mail)
    setShowPassModal(true)
  }

  const unlockMail = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    
    if (passInput !== user.password) {
      alert("❌ Authentication Failed: Invalid Password")
      return
    }

    try {
      const bytes = CryptoJS.AES.decrypt(tempMail.message, user.publicKey)
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8)

      if (!decryptedText) throw new Error()

      setSelectedMail({ ...tempMail, message: decryptedText })
      setShowPassModal(false)
      setPassInput("")
    } catch (e) {
      alert("Decryption Error: The message could not be unlocked with this key.")
    }
  }

  if (selectedMail) {
    return (
      <div className="mail-area">
        <button className="btn-secondary" onClick={() => setSelectedMail(null)}>← Back to Received</button>
        <div className="full-mail-view">
          <h2 className="mail-detail-subject">{selectedMail.subject}</h2>
          <div className="mail-detail-meta">
             <span>From: <b>{selectedMail.sender.substring(0, 15)}...</b></span>
          </div>
          <hr className="divider" />
          <p className="mail-body-content">{selectedMail.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mail-area">
      <div className="inbox-header">
        <h2 className="inbox-title">Received Mails</h2>
        <span className="mail-count">{mails.length} secure messages</span>
      </div>
      
      <div className="mail-list">
        {mails.length === 0 ? (
          <div className="empty-state">No received messages found.</div>
        ) : (
          mails.map((mail, index) => (
            <div key={index} className="mail-row" onClick={() => handleMailClick(mail)}>
              <div className="mail-sender">{mail.sender.substring(0, 10)}...</div>
              <div className="mail-content">
                <span className="mail-subject">{mail.subject}</span>
                <span className="mail-snippet"> — 🔒 Locked Content (Requires Password)</span>
              </div>
              <div className="mail-date">{mail.time?.replace(/:\d{2} /, " ")}</div>
            </div>
          ))
        )}
      </div>

      {showPassModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Identity Verification</h3>
            <p>Please enter your account password to decrypt this received message.</p>
            <input 
              type="password" 
              className="auth-input" 
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="Enter Password"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowPassModal(false)}>Cancel</button>
              <button className="btn" onClick={unlockMail}>Unlock & Read</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}