"use client"

import { useEffect, useState } from "react"

export default function OutboxPage() {
  const [mails, setMails] = useState<any[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return
    const { getMails, subscribe } = require("@/utils/mailStore")
    
    const load = () => {
      setMails(getMails("outbox"))
    }

    load()
    const unsub = subscribe(load)
    return () => unsub()
  }, [])

  const cancelSending = (id: string) => {
    const { updateMailInStore } = require("@/utils/mailStore")
    updateMailInStore(id, { status: "trash", isPending: false })
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
                  onClick={() => cancelSending(mail.id)}
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
