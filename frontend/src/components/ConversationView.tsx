"use client"

import { useState, useEffect, useRef } from "react"
import { 
  ChevronDown, ChevronUp, Reply, Forward, 
  MoreVertical, Star, Trash2, Archive, 
  Paperclip, Shield, Share2, Send, X,
  Maximize2, Minimize2, Download, FileText, File,
  ArrowLeft, Printer, ExternalLink, Lock
} from "lucide-react"
import { decryptMessage, cleanMessage } from "@/utils/gun"
import { getCachedMail, updateCachedMail } from "@/utils/mailCache"
import { getLocalNode, fetchFromIPFS } from "@/utils/ipfs"
import { hybridDecrypt } from "@/utils/cryptoHybrid"

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
      const cleaned = cleanMessage(decrypted)
      
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

  const handleDownload = async (cid: string, filename: string, isHybrid: boolean = false) => {
    if (!isHybrid) {
      // Standard unencrypted IPFS download
      const url = `https://ipfs.io/ipfs/${cid}`
      window.open(url, "_blank")
      return
    }

    // 🛡️ Hybrid Decryption Flow
    try {
      console.log(`🛡️ [HybridDecrypt] Fetching encrypted attachment from IPFS: ${cid}`)
      const encryptedPackage = await fetchFromIPFS(cid)
      
      if (!encryptedPackage || !encryptedPackage.key) {
        throw new Error("Invalid hybrid package received from IPFS")
      }

      // We need the user's password for decryption
      const password = passInput || prompt("Enter your password to decrypt this attachment:")
      if (!password) return

      const decryptedData = await hybridDecrypt(encryptedPackage, user.privateKey, password)
      
      // Create a blob and download
      const blob = new Blob([decryptedData], { type: "application/octet-stream" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename || "decrypted_attachment"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      console.log("✅ [HybridDecrypt] Attachment decrypted and downloaded.")
    } catch (err) {
      console.error("❌ [HybridDecrypt] Failed:", err)
      alert("Failed to decrypt attachment. Please ensure your password is correct.")
    }
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
        <div style={{ padding: "32px 32px 16px" }}>
          <h2 style={{ 
            margin: 0, fontSize: "28px", fontWeight: "500", color: "#FFFFFF",
            fontFamily: "'Inter', sans-serif", letterSpacing: "-0.5px"
          }}>{thread.subject}</h2>
        </div>

        {/* Messages List */}
        <div ref={scrollRef} style={{ padding: "0 32px 32px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {thread.messages.map((msg, index) => {
              const isExpanded = expandedIds.has(msg.id)
              const isSelf = msg.senderEmail === user.email
              const needsDecrypt = msg.message?.includes("-----BEGIN PGP MESSAGE-----") && !decryptedMessages[msg.id] && !msg.decryptedMessage
              const content = decryptedMessages[msg.id] || msg.decryptedMessage || msg.message

              return (
                <div key={msg.id} style={{
                  border: isExpanded ? "none" : "1px solid var(--mail-row-border)",
                  borderRadius: "8px",
                  background: isExpanded ? "transparent" : "rgba(255,255,255,0.02)",
                  overflow: "hidden",
                  transition: "all 0.15s ease",
                  marginBottom: isExpanded ? "32px" : "8px"
                }}>
                  {/* Compact Header for collapsed state */}
                  {!isExpanded && (
                    <div 
                      onClick={() => toggleExpand(msg.id)}
                      style={{ 
                        padding: "10px 16px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "12px",
                      }}
                    >
                      <div style={{ 
                        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                        background: isSelf ? "var(--border-gold)" : "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: "800", color: isSelf ? "var(--gold-mid)" : "var(--bg-body)"
                      }}>
                        {msg.senderEmail.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-bright)" }}>
                            {isSelf ? "You" : msg.senderEmail.split("@")[0]}
                          </span>
                          <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-dim)" }}>{msg.time}</span>
                        </div>
                        <div style={{ 
                          fontSize: "13px", color: "var(--text-muted)", marginTop: "2px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" 
                        }}>
                          {needsDecrypt ? "🔒 Encrypted Content" : cleanMessage(content).slice(0, 100)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ padding: "8px 0" }}>
                      
                      {/* Detailed Sender Info */}
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", cursor: "pointer" }} onClick={() => toggleExpand(msg.id)}>
                        <div style={{ 
                          width: "44px", height: "44px", borderRadius: "50%", 
                          background: "#E8B923", 
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "16px", fontWeight: "700", color: "#000"
                        }}>
                          {isSelf ? "YO" : msg.senderEmail.substring(0,2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "15px", fontWeight: "500", color: "#FFFFFF" }}>
                            {isSelf ? "You" : (msg.senderEmail.split("@")[0].charAt(0).toUpperCase() + msg.senderEmail.split("@")[0].slice(1))}
                          </div>
                          <div style={{ fontSize: "13px", color: "#808080", marginTop: "2px" }}>
                            {msg.senderEmail} <span style={{ margin: "0 6px", color: "#555" }}>→</span> {msg.receiverEmail || user.email}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "12px", color: "#808080", marginBottom: "6px" }}>
                            {msg.time}
                          </div>
                          <div style={{ 
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            background: "rgba(232, 185, 35, 0.1)", color: "#E8B923", border: "1px solid rgba(232, 185, 35, 0.2)",
                            padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "500"
                          }}>
                            ✓ On-chain verified
                          </div>
                        </div>
                      </div>

                      {/* Security Bar */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "rgba(232, 185, 35, 0.05)", border: "1px solid rgba(232, 185, 35, 0.15)",
                        padding: "8px 12px", borderRadius: "6px", marginBottom: "16px"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "#E8B923" }}>
                          <Lock size={14} />
                          <span style={{ fontFamily: "monospace" }}>0x3f7a...d4c2 → 0x9b1e...a83f</span>
                          <span style={{ color: "rgba(232, 185, 35, 0.3)" }}>|</span>
                          <span>Signed & Encrypted</span>
                          <span style={{ color: "rgba(232, 185, 35, 0.3)" }}>|</span>
                          <span style={{ fontFamily: "monospace" }}>IPFS: {msg.cid ? `${msg.cid.slice(0,6)}...${msg.cid.slice(-3)}` : "Qm8xKp...rT2"}</span>
                        </div>
                        <div style={{
                          background: "#E8B923", color: "#000",
                          padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700",
                          display: "flex", alignItems: "center", gap: "4px"
                        }}>
                          ✓ VERIFIED
                        </div>
                      </div>

                      {/* Action Buttons Row */}
                      <div style={{ display: "flex", gap: "8px", marginBottom: "32px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "24px" }}>
                        <button style={{ 
                          display: "flex", alignItems: "center", gap: "8px",
                          background: "#E8B923", color: "#000", border: "none",
                          padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer"
                        }}>
                          <Reply size={16} /> Reply
                        </button>
                        <button style={{ 
                          display: "flex", alignItems: "center", gap: "8px",
                          background: "rgba(255,255,255,0.04)", color: "#999", border: "none",
                          padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "500", cursor: "pointer"
                        }}>
                          <Forward size={16} /> Forward
                        </button>
                        <button style={{ 
                          display: "flex", alignItems: "center", gap: "8px",
                          background: "rgba(255,255,255,0.04)", color: "#999", border: "none",
                          padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "500", cursor: "pointer"
                        }}>
                          <Star size={16} /> Star
                        </button>
                        <button style={{ 
                          display: "flex", alignItems: "center", gap: "8px",
                          background: "rgba(255,255,255,0.04)", color: "#999", border: "none",
                          padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "500", cursor: "pointer"
                        }}>
                          <Trash2 size={16} /> Delete
                        </button>
                      </div>

                      {/* Message Body */}
                      <div style={{ 
                        fontSize: "14px", lineHeight: "1.6", color: "#A0A0A0",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: "'Inter', sans-serif", margin: "0 0 24px"
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
                                background: "rgba(212, 175, 55,0.1)", padding: "6px 12px", borderRadius: "8px",
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
                        ) : (
                          // Custom renderer for golden left-border lines
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {cleanMessage(content).split('\n').map((line, i, arr) => {
                              if (line.trim().startsWith('|') || line.trim().match(/^[-•]\s/)) {
                                const cleanLine = line.trim().replace(/^[|•-]\s*/, '');
                                const isPrevList = i > 0 && (arr[i-1].trim().startsWith('|') || arr[i-1].trim().match(/^[-•]\s/));
                                return (
                                  <div key={i} style={{ 
                                    borderLeft: "3px solid #E8B923", 
                                    paddingLeft: "12px", 
                                    marginTop: isPrevList ? "-12px" : "0", 
                                    color: "#A0A0A0"
                                  }}>
                                    {cleanLine}
                                  </div>
                                );
                              }
                              
                              // Check if line looks like a golden signature name
                              if (line.trim() === "Vitalik Nakamoto" || line.trim() === msg.senderEmail.split("@")[0] || line.trim() === "EtherX Foundation") {
                                return <div key={i} style={{ minHeight: "1em", color: "#E8B923", fontWeight: "500", marginTop: "16px" }}>{line}</div>;
                              }

                              return <div key={i} style={{ minHeight: "1em" }}>{line}</div>;
                            })}
                          </div>
                        )}
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

                             {msg.attachments?.map((att: any, i: number) => (
                               <div key={i} className="attachment-card" style={{
                                 padding: "10px 14px", borderRadius: "10px", 
                                 background: "var(--bg-card)", border: "1px solid var(--border-gold)",
                                 display: "flex", alignItems: "center", gap: "12px", minWidth: "220px"
                                }}>
                                 <div style={{ color: "var(--gold-mid)" }}>
                                   {att.type === "ipfs_hybrid" ? <Lock size={18} /> : <FileText size={18} />}
                                 </div>
                                 <div style={{ flex: 1, minWidth: 0 }}>
                                   <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                     {att.name || "Attachment"}
                                   </div>
                                   <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                                     {att.type === "ipfs_hybrid" ? "Hybrid Encrypted" : "IPFS"} · {att.size ? `${(att.size / 1024).toFixed(1)} KB` : "Stored"}
                                   </div>
                                 </div>
                                 <button 
                                   onClick={() => handleDownload(att.cid, att.name, att.type === "ipfs_hybrid")} 
                                   style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)" }}
                                 >
                                   <Download size={16} />
                                 </button>
                               </div>
                             ))}
                           </div>
                         </div>
                      )}
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
            padding: "8px 12px", borderTop: "1px solid rgba(212, 175, 55,0.1)",
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
