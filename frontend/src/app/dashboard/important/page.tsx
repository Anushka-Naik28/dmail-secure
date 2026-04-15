"use client"

import { useEffect, useState } from "react"
import PageHeader from "@/components/PageHeader"

export default function ImportantPage() {
  // 1. Single state definition
  const [mails, setMails] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  // 2. Logic to load and filter mails
  const loadMails = () => {
    const userString = localStorage.getItem("user")
    const mailsString = localStorage.getItem("mails")
    
    if (!userString || !mailsString) return
    
    const user = JSON.parse(userString)
    const allMails = JSON.parse(mailsString)
    
    const filtered = allMails.filter((m: any) => {
      // Gmail-style auto-importance logic (Keywords)
      const isUrgent = /urgent|important|action|security|boss/i.test(m.subject || "");
      
      return (
        m.receiverEmail === user.email && 
        m.status !== 'trash' && 
        (m.isImportant || isUrgent)
      );
    });
    setMails(filtered)
  }

  const filteredMails = mails.filter(
    (m) =>
      m.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.senderEmail?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 3. Single useEffect hook
  useEffect(() => {
    loadMails()
  }, [])

  // 4. Manual toggle for the Importance Marker
  const toggleImportance = (e: React.MouseEvent, mailTime: string) => {
    e.stopPropagation()
    const allMails = JSON.parse(localStorage.getItem("mails") || "[]")
    const updated = allMails.map((m: any) => {
      if (m.time === mailTime) return { ...m, isImportant: !m.isImportant }
      return m
    })
    localStorage.setItem("mails", JSON.stringify(updated))
    loadMails()
  }

  return (
    <>
      <PageHeader 
        title="Important"
        count={mails.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search important mail..."
      />

      <div className="mail-list" style={{ marginTop: "16px" }}>
        {filteredMails.length === 0 ? (
          <div className="empty-state">
            <span style={{ fontSize: '40px' }}>🏷️</span>
            <p>{searchQuery ? "No results found." : "No important messages found."}</p>
            <small>Messages from frequent contacts or those marked with "»" appear here.</small>
          </div>
        ) : (
          mails.map((mail, index) => (
            <div key={index} className="mail-row">
              {/* Gmail-style Chevron Marker */}
              <span 
                className={`importance-marker ${mail.isImportant ? 'active' : ''}`}
                onClick={(e) => toggleImportance(e, mail.time)}
              >
                {mail.isImportant ? '»' : '›'}
              </span>
              
              <div className="mail-sender">{mail.senderEmail?.split('@')[0]}</div>
              <div className="mail-content">
                <span className="mail-subject">{mail.subject}</span>
                <span className="mail-snippet"> — 🔒 Encrypted Content</span>
              </div>
              <div className="mail-date">{mail.time?.replace(/:\d{2} /, " ")}</div>
            </div>
          ))
        )}
      </div>
    </>
  )
}