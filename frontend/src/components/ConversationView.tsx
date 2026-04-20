"use client"

import { useState, useEffect, useRef } from "react"
import { 
  ChevronDown, ChevronUp, Reply, Forward, 
  MoreVertical, Star, Trash2, Archive, 
  Paperclip, Shield, Share2, Send, X,
  Maximize2, Minimize2, Download, FileText, File,
  ArrowLeft, Printer, ExternalLink, Lock
} from "lucide-react"
import { decryptMessage } from "@/utils/gun"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import { getLocalNode } from "@/utils/ipfs"

interface Message {
  id: string
  subject: string
  senderEmail: string
  receiverEmail: string
  time: string
  message: string
  isRead: boolean
  isStarred: boolean
  isPinned: boolean
  isReply?: boolean
  isForward?: boolean
  cid?: string
  attachments?: any[]
  isDecrypted?: boolean
  decryptedMessage?: string
}

interface ConversationViewProps {
  thread: {
    subject: string
    messages: Message[]
  }
  user: any
  onSendReply: (body: string, recipient: string, subject: string) => Promise<void>
  onUpdateStatus: (id: string, updates: any) => void
  onClose: () => void
}

export default function ConversationView({
  thread,
  user,
  onSendReply,
  onUpdateStatus,
  onClose
}: ConversationViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([thread.messages[thread.messages.length - 1].id]))
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({})
  const [isDecrypting, setIsDecrypting] = useState<Record<string, boolean>>({})
  const [passInput, setPassInput] = useState("")
  const [showPassRequest, setShowPassRequest] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [pendingDecryptId, setPendingDecryptId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDecrypt = async (msg: Message, pass: string) => {
    if (!msg.message || !msg.message.includes("-----BEGIN PGP MESSAGE-----")) return
    
    setIsDecrypting(prev => ({ ...prev, [msg.id]: true }))
    try {
      const decrypted = await decryptMessage(msg.message, user.privateKey, pass)
      const cleaned = decrypted.replace(/\[IPFS Attachment: [^\]]+\]/g, "").trim()
      
      setDecryptedMessages(prev => ({ ...prev, [msg.id]: cleaned }))
      await updateCachedMail(msg.id, {
        decryptedMessage: cleaned,
        isDecrypted: true,
        message: msg.message
      })
      setShowPassRequest(false)
      setPassInput("")
    } catch (err) {
      alert("Decryption failed. Please check your password.")
    } finally {
      setIsDecrypting(prev => ({ ...prev, [msg.id]: false }))
    }
  }

  const startDecrypt = (id: string) => {
    setPendingDecryptId(id)
    setShowPassRequest(true)
  }

  const handleSend = async () => {
    if (!replyBody.trim()) return
    setIsSending(true)
    try {
      const latest = thread.messages[thread.messages.length - 1]
      const recipient = latest.senderEmail === user.email ? latest.receiverEmail : latest.senderEmail
      await onSendReply(replyBody, recipient, `Re: ${thread.subject}`)
      setReplyBody("")
    } catch (err) {
      alert("Failed to send reply.")
    } finally {
      setIsSending(false)
    }
  }

  const handleDownload = (cid: string, filename: string) => {
    // Use public gateway for reliable cross-device browsing/download
    const url = `https://ipfs.io/ipfs/${cid}`
    window.open(url, "_blank")
  }

  return (
    <div className="conversation-view" style={{ 
      display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)" 
    }}>
      {/* Header Toolbar — Standardized at 44px height to match folder toolbars */}
      <div className="folder-toolbar" style={{ 
        borderBottom: "1px solid var(--border-gold)", 
        height: "44px", padding: "0 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--bg-card)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={onClose} className="toolbar-btn" title="Back to list" style={{ background: "none", border: "none" }}>
             <ArrowLeft size={18} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" title="Archive Thread" style={{ background: "none", border: "none" }}><Archive size={18}/></button>
          <button className="toolbar-btn" title="Report Spam" style={{ background: "none", border: "none" }}><Shield size={18}/></button>
          <button className="toolbar-btn" title="Delete Thread" style={{ background: "none", border: "none" }}><Trash2 size={18}/></button>
        </div>
        
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button className="toolbar-btn" title="Print" style={{ background: "none", border: "none" }}><Printer size={18}/></button>
          <button className="toolbar-btn" title="Open in new window" style={{ background: "none", border: "none" }}><ExternalLink size={18}/></button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Subject Header Area */}
        <div style={{ padding: "20px 24px 8px" }}>
          <h2 style={{ 
            margin: 0, fontSize: "22px", fontWeight: "400", color: "var(--text-bright)",
            fontFamily: "'Cinzel', serif", letterSpacing: "0.5px"
          }}>{thread.subject}</h2>
        </div>

        {/* Messages List */}
        <div ref={scrollRef} style={{ padding: "12px 24px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {thread.messages.map((msg, index) => {
              const isExpanded = expandedIds.has(msg.id)
              const isSelf = msg.senderEmail === user.email
              const needsDecrypt = msg.message?.includes("-----BEGIN PGP MESSAGE-----") && !decryptedMessages[msg.id] && !msg.decryptedMessage
              const content = decryptedMessages[msg.id] || msg.decryptedMessage || msg.message

              return (
                <div key={msg.id} style={{
                  border: "1px solid var(--mail-row-border)",
                  borderRadius: "8px",
                  background: isExpanded ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                  overflow: "hidden",
                  transition: "all 0.15s ease",
                  boxShadow: isExpanded ? "0 4px 12px rgba(0,0,0,0.2)" : "none"
                }}>
                  {/* Message Summary / Header */}
                  <div 
                    onClick={() => toggleExpand(msg.id)}
                    style={{ 
                      padding: "10px 16px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "12px",
                      background: isExpanded ? "rgba(255,255,255,0.01)" : "transparent"
                    }}
                  >
                    <div style={{ 
                      width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                      background: isSelf ? "var(--border-gold)" : "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: "800", color: isSelf ? "var(--gold-mid)" : "#000"
                    }}>
                      {msg.senderEmail.charAt(0).toUpperCase()}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)" }}>
                          {isSelf ? "You" : msg.senderEmail.split("@")[0]}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-dim)", display: isExpanded ? "inline" : "none" }}>
                          &lt;{msg.senderEmail}&gt;
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-dim)" }}>{msg.time}</span>
                      </div>
                      {!isExpanded && (
                        <div style={{ 
                          fontSize: "13px", color: "var(--text-muted)", marginTop: "2px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" 
                        }}>
                          {needsDecrypt ? "🔒 Encrypted Content" : (content || "").slice(0, 100)}
                        </div>
                      )}
                    </div>
                    {msg.isStarred && <Star size={14} fill="var(--gold-mid)" color="var(--gold-mid)" />}
                    <div style={{ color: "var(--text-dim)" }}>
                       <MoreVertical size={16} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ padding: "8px 16px 20px 56px" }}>
                      <div style={{ 
                        fontSize: "14px", lineHeight: "1.6", color: "var(--text-bright)",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: "'Raleway', sans-serif", margin: "4px 0 24px"
                      }}>
                        {needsDecrypt ? (
                          <div style={{ 
                            padding: "24px", borderRadius: "8px", 
                            background: "var(--bg-vault)", border: "1px solid var(--border-gold)",
                            display: "flex", flexDirection: "column", gap: "12px",
                            boxShadow: "var(--shadow-deep)"
                          }}>
                            <h2 style={{ fontFamily: "Cinzel, serif", fontSize: "16px", color: "var(--text-bright)", margin: 0 }}>ENCRYPTED CONTENT</h2>
                            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                              This message is end-to-end encrypted. Enter your DMail password to unlock.
                            </p>
                            <div style={{ marginTop: "8px", display: "flex", gap: "12px", alignItems: "center" }}>
                              <div style={{
                                display: "inline-flex", alignItems: "center", gap: "6px",
                                background: "rgba(212,160,23,0.1)", padding: "6px 12px", borderRadius: "8px",
                                border: "1px solid var(--border-gold)", color: "var(--gold-mid)", fontSize: "11px", fontWeight: "700"
                              }}>
                                <Lock size={12} /> ECC Curve25519
                              </div>
                              <button 
                                className="btn"
                                onClick={(e) => { e.stopPropagation(); startDecrypt(msg.id); }}
                                style={{ fontSize: "11px", padding: "6px 16px", borderRadius: "20px" }}
                              >UNLOCK MESSAGE</button>
                            </div>
                          </div>
                        ) : content}
                      </div>

                      {/* Attachments Section */}
                      {(msg.cid || (msg.attachments && msg.attachments.length > 0)) && (
                         <div style={{ 
                           marginTop: "24px", padding: "16px", borderRadius: "12px",
                           background: "rgba(255,255,255,0.015)", border: "1px solid var(--border-gold)"
                         }}>
                           <div style={{ 
                             display: "flex", alignItems: "center", gap: "8px", 
                             marginBottom: "12px", fontSize: "10px", fontWeight: "800", 
                             color: "var(--gold-mid)", textTransform: "uppercase", letterSpacing: "0.1em"
                           }}>
                              <Paperclip size={14} /> Attachments
                           </div>
                           
                           <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                             {msg.cid && (
                               <div className="attachment-card" style={{
                                 padding: "10px 14px", borderRadius: "10px", 
                                 background: "var(--bg-card)", border: "1px solid var(--border-gold)",
                                 display: "flex", alignItems: "center", gap: "12px", minWidth: "220px"
                               }}>
                                 <div style={{ color: "var(--gold-mid)" }}><Shield size={18} /></div>
                                 <div style={{ flex: 1, minWidth: 0 }}>
                                   <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                     Encrypted Artifact
                                   </div>
                                   <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>IPFS · {msg.cid.slice(0, 10)}...</div>
                                 </div>
                                 <button onClick={() => handleDownload(msg.cid!, "attachment")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)" }}>
                                   <Download size={16} />
                                 </button>
                               </div>
                             )}
                           </div>
                         </div>
                      )}

                      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                         <button className="btn-secondary" style={{ padding: "6px 16px", borderRadius: "18px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                           <Reply size={14} /> Reply
                         </button>
                         <button className="btn-secondary" style={{ padding: "6px 16px", borderRadius: "18px", fontSize: "12px", color: "var(--text-muted)", borderColor: "var(--border-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                           <Forward size={14} /> Forward
                         </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Inline Reply Box — Polished */}
      <div style={{ 
        padding: "16px 24px", borderTop: "1px solid var(--border-gold)",
        background: "var(--bg-panel)"
      }}>
        <div style={{ 
          border: "1px solid var(--border-gold)", borderRadius: "12px",
          background: "var(--bg-panel)", padding: "4px"
        }}>
          <textarea 
            placeholder="Click here to reply..."
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            style={{
              width: "100%", minHeight: "80px", padding: "12px 16px",
              background: "none", border: "none", outline: "none",
              color: "var(--text-bright)", fontSize: "14px", lineHeight: "1.5",
              resize: "none", fontFamily: "'Raleway', sans-serif"
            }}
          />
          <div style={{ 
            padding: "8px 12px", borderTop: "1px solid rgba(212,160,23,0.1)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <button className="toolbar-btn" style={{ background: "none", border: "none" }}><Paperclip size={18}/></button>
              <button className="toolbar-btn" style={{ background: "none", border: "none" }}><Share2 size={18}/></button>
            </div>
            <button 
              onClick={handleSend}
              disabled={isSending || !replyBody.trim()}
              className="btn"
              style={{
                padding: "8px 24px", borderRadius: "20px", fontSize: "13px",
                display: "flex", alignItems: "center", gap: "8px",
                opacity: (isSending || !replyBody.trim()) ? 0.6 : 1
              }}
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      </div>

      {/* Decryption Modal */}
      {showPassRequest && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal-content" style={{ maxWidth: "400px" }}>
            <Shield size={48} color="var(--gold-mid)" style={{ marginBottom: "16px" }} />
            <h3 style={{ margin: 0, marginBottom: "8px" }}>Unlock Identity</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Enter your password to decrypt the PGP messages in this thread.
            </p>
            <input 
              type="password" className="auth-input" autoFocus
              value={passInput} onChange={(e) => setPassInput(e.target.value)}
              placeholder="Your secure password"
              onKeyDown={(e) => e.key === "Enter" && handleDecrypt(thread.messages.find(m => m.id === pendingDecryptId)!, passInput)}
            />
            <div className="modal-actions" style={{ marginTop: "24px" }}>
              <button className="btn-secondary" onClick={() => setShowPassRequest(false)}>Cancel</button>
              <button className="btn" onClick={() => handleDecrypt(thread.messages.find(m => m.id === pendingDecryptId)!, passInput)}>Unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
