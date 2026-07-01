"use client"

import { useEffect, useState } from "react"

export default function SnoozedPage() {
  const [mails, setMails] = useState<any[]>([])

  const loadMails = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")
    
    const filtered = allMails.filter((m: any) => 
      m.receiverEmail === user.email && m.status === 'snoozed'
    )
    setMails(filtered)
  }

  useEffect(() => {
    loadMails()
  }, [])

  return (
    <div className="mail-area">
      <h2 className="inbox-title">Snoozed</h2>
      <div className="mail-list">
        {mails.length === 0 ? <p className="empty-state">No snoozed messages.</p> : 
          mails.map((mail, index) => (
            <div key={index} className="mail-row">
              <span style={{ marginRight: '10px' }}>🕒</span>
              <div className="mail-sender">{mail.senderEmail.split('@')[0]}</div>
              <div className="mail-content">
                {mail.subject} 
                <span className="snooze-tag">
                  Scheduled: {new Date(mail.snoozeUntil).toLocaleString()}
                </span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
