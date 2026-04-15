"use client"

import { useEffect, useState } from "react"

export default function OutboxPage() {
  const [mails, setMails] = useState<any[]>([])

  const loadOutbox = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")
    
    // Filter: Mails sent by me that are still marked as 'outbox' or 'pending'
    const pending = allMails.filter((m: any) => 
      m.senderEmail === user.email && (m.status === 'outbox' || m.isPending === true)
    )
    setMails(pending)
  }

  useEffect(() => {
    loadOutbox()
    // Optional: Refresh every few seconds to simulate sending progress
    const interval = setInterval(loadOutbox, 3000)
    return () => clearInterval(interval)
  }, [])

  const cancelSending = (mailTime: string) => {
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")
    const updated = allMails.filter((m: any) => m.time !== mailTime)
    localStorage.setItem("mails", JSON.stringify(updated))
    loadOutbox()
  }

  return (
    <div className="mail-area">
      <div className="inbox-header">
        <h2 className="inbox-title">Outbox</h2>
        <p className="mail-count">{mails.length} messages queued for delivery</p>
      </div>

      <div className="mail-list">
        {mails.length === 0 ? (
          <div className="empty-state">
            <span style={{ fontSize: '40px' }}>📤</span>
            <p>All messages have been sent.</p>
          </div>
        ) : (
          mails.map((mail, index) => (
            <div key={index} className="mail-row no-click">
              <div className="sending-spinner"></div>
              <div className="mail-sender">To: {mail.receiverEmail.split('@')[0]}</div>
              
              <div className="mail-content">
                <span className="mail-subject">{mail.subject}</span>
                <span className="mail-status-label">Sending...</span>
              </div>

              <div className="mail-actions-persistent">
                <button 
                  className="action-link delete-forever" 
                  onClick={() => cancelSending(mail.time)}
                >
                  Cancel
                </button>
              </div>

              <div className="mail-date">Queued</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}