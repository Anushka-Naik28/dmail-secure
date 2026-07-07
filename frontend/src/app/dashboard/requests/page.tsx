"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import { subscribe, updateMailInStore, getMails } from "@/utils/mailStore"
import { trustSender } from "@/utils/spamFilter"
import { UserCheck, RefreshCw, AlertCircle } from "lucide-react"

function RequestsPageContent() {
  const [mails, setMails] = useState<any[]>([])
  const [userEmail, setUserEmail] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [contactsTrigger, setContactsTrigger] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) {
      setUserEmail(user.email)
    }

    const updateMails = () => {
      setMails(getMails("all"))
      setIsRefreshing(false)
    }
    updateMails()
    const unsub = subscribe(updateMails)
    return () => unsub()
  }, [])

  // Get unique untrusted senders from all emails
  const untrustedSenders = useMemo(() => {
    if (!userEmail) return []

    // 1. Get contacts from localStorage
    let contacts: any[] = []
    try {
      const cached = localStorage.getItem(`contacts_${userEmail}`)
      if (cached) contacts = JSON.parse(cached)
    } catch (e) {
      console.warn(e)
    }
    const trustedEmails = new Set(contacts.map((c: any) => c.email?.toLowerCase()))

    // 2. Filter for incoming mails from untrusted senders
    const incomingUntrusted = mails.filter(m => {
      const sender = m.senderEmail?.toLowerCase()
      const receiver = m.receiverEmail?.toLowerCase()
      
      const isIncoming = receiver === userEmail.toLowerCase()
      const isFromSelf = sender === userEmail.toLowerCase()
      const isTrusted = trustedEmails.has(sender)

      // We show them if they are incoming, not from ourselves, and not trusted
      return isIncoming && !isFromSelf && !isTrusted
    })

    // 3. Group by sender email to get unique list of senders
    const senderMap = new Map<string, { email: string; name: string; time: string; count: number }>()
    incomingUntrusted.forEach(m => {
      const sender = m.senderEmail
      if (!sender) return
      
      const existing = senderMap.get(sender)
      if (existing) {
        existing.count++
        if (new Date(m.time).getTime() > new Date(existing.time).getTime()) {
          existing.time = m.time
        }
      } else {
        senderMap.set(sender, {
          email: sender,
          name: m.senderName || sender.split("@")[0],
          time: m.time,
          count: 1
        })
      }
    })

    return Array.from(senderMap.values()).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [mails, userEmail, contactsTrigger])

  const handleAcceptSender = (senderEmail: string) => {
    trustSender(senderEmail, userEmail)
    setContactsTrigger(prev => prev + 1)
    
    // Update all mails from this sender to "inbox"
    mails.forEach(m => {
      if (m.senderEmail?.toLowerCase() === senderEmail.toLowerCase()) {
        updateMailInStore(m.id, { status: "inbox", flaggedReason: "", spamScore: 0 })
      }
    })
  }

  const handleDeleteSender = (senderEmail: string) => {
    mails.forEach(m => {
      if (m.senderEmail?.toLowerCase() === senderEmail.toLowerCase()) {
        updateMailInStore(m.id, { status: "purged", purgedAt: Date.now() })
      }
    })
    setContactsTrigger(prev => prev + 1)
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    // Trigger local state re-evaluation
    setMails([...getMails("all")])
    setTimeout(() => setIsRefreshing(false), 800)
  }

  return (
    <div style={{ height: "100%", background: "var(--bg-body)", overflowY: "auto", padding: "40px 24px" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h2 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text-bright)", margin: 0, fontFamily: "Cinzel, serif" }}>
              Connection Requests
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
              Senders who are not in your trusted contacts. All their emails land in your Inbox, but you can manage their trust status here.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            style={{ 
              background: "none", border: "none", color: "var(--text-dim)", 
              cursor: "pointer", display: "flex", alignItems: "center",
              transition: "color 0.2s, transform 0.3s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--gold-mid)"
              e.currentTarget.style.transform = "rotate(180deg)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)"
              e.currentTarget.style.transform = "rotate(0deg)"
            }}
            title="Refresh Requests"
          >
            <RefreshCw size={20} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>

        {/* Request cards list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {untrustedSenders.length === 0 ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-gold)", borderRadius: "16px", padding: "60px 24px", textAlign: "center" }}>
              <UserCheck size={56} color="var(--gold-mid)" style={{ marginBottom: "20px", opacity: 0.6 }} />
              <h3 style={{ color: "var(--text-bright)", fontSize: "18px", margin: "0 0 8px" }}>All Senders Trusted</h3>
              <p style={{ color: "var(--text-dim)", fontSize: "14px", margin: 0 }}>
                You have no pending connection requests.
              </p>
            </div>
          ) : (
            untrustedSenders.map(sender => (
              <div 
                key={sender.email}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-gold)",
                  borderRadius: "14px",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "24px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(212, 175, 55, 0.05)",
                  transition: "transform 0.2s ease, border-color 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "50%", background: "rgba(212, 175, 55, 0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "18px", fontWeight: "800", color: "var(--gold-mid)", border: "1px solid rgba(212, 175, 55, 0.15)"
                  }}>
                    {sender.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-bright)", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {sender.name}
                    </h3>
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {sender.email}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                      <AlertCircle size={12} color="var(--gold-mid)" />
                      <span style={{ fontSize: "11px", color: "var(--gold-mid)", fontWeight: "600" }}>
                        Received {sender.count} message{sender.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                  <button
                    onClick={() => handleAcceptSender(sender.email)}
                    style={{
                      background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                      color: "var(--bg-body)", border: "none", borderRadius: "8px",
                      padding: "10px 20px", fontSize: "12px", fontWeight: "700",
                      cursor: "pointer", transition: "transform 0.2s ease, opacity 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                  >
                    Accept & Trust
                  </button>
                  <button
                    onClick={() => handleDeleteSender(sender.email)}
                    style={{
                      background: "none", border: "1px solid rgba(232, 66, 52, 0.3)",
                      color: "#e84234", borderRadius: "8px",
                      padding: "10px 20px", fontSize: "12px", fontWeight: "700",
                      cursor: "pointer", transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(232, 66, 52, 0.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    Delete Mails
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsPageContent />
    </Suspense>
  )
}
