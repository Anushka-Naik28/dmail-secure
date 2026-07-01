"use client"

import {
  Inbox, Send, FileText, AlertTriangle, Trash2,
  Star, Mail, Archive, Users, Settings,
  PenSquare, Database, LogOut, Tag, Plus, ChevronDown, Globe, UserPlus
} from "lucide-react"

import { useEffect, useState, memo } from "react"
import Link from "next/link"
import Image from "next/image" // 1. Added Image import
import { usePathname, useRouter } from "next/navigation"
import { getCounts, subscribe } from "@/utils/mailStore"
import { getLabels, subscribeLabelStore, type Label } from "@/utils/labelStore"
import { useLabel } from "@/context/LabelContext"
import NetworkStatus from "@/components/NetworkStatus"
import Logo from "@/components/Logo"

interface SidebarProps {
  isOpen: boolean
  onCompose: () => void
}

function Sidebar({ isOpen, onCompose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [counts, setCounts] = useState({ inbox: 0, starred: 0, spam: 0, drafts: 0, request: 0, sent: 0 })
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [userName, setUserName] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [labels, setLabels] = useState<Label[]>([])
  const [labelsOpen, setLabelsOpen] = useState(true)
  const { activeLabelId, setActiveLabelId } = useLabel()

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    setUserEmail(user.email)
    setUserName(user.name || user.email.split("@")[0])
    setCounts(getCounts(user.email))
    setLabels(getLabels(user.email))

    let throttleTimer: NodeJS.Timeout | null = null
    const throttledUpdate = () => {
      if (throttleTimer) return
      throttleTimer = setTimeout(() => {
        setCounts(getCounts(user.email))
        setLabels(getLabels(user.email))
        throttleTimer = null
      }, 500) // Update sidebar counts at most once every 500ms
    }

    const onStorage = () => {
      const u = JSON.parse(localStorage.getItem("user") || "{}")
      if (u.email) setLabels(getLabels(u.email))
    }
    window.addEventListener("storage", onStorage)

    const unsub = subscribe(throttledUpdate)
    const unsubLabel = subscribeLabelStore(throttledUpdate)

    return () => {
      unsub();
      unsubLabel();
      if (throttleTimer) clearTimeout(throttleTimer)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("user")
    router.push("/login")
  }

  const isActive = (segment: string) => pathname.includes(segment)

  if (!isOpen) return null

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-top">

          {/* Sidebar Branding Removed for a cleaner look */}
          <div style={{ height: "12px" }} /> 
          {/* ---------------------------------- */}

          <div style={{ padding: "8px 16px 20px" }}>
            <button onClick={onCompose} className="compose-btn" style={{ 
              width: "100%", padding: "12px 24px", borderRadius: "16px",
              boxShadow: "var(--shadow-deep)"
            }}>
              <Plus size={24} style={{ color: "var(--bg-body)" }} />
              <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--bg-body)" }}>Compose</span>
            </button>
          </div>

          <nav className="nav-menu">
            <div className="nav-section-label">Mail</div>

            {/* Inbox */}
            <Link href="/dashboard/inbox" className={`menu-link ${isActive("inbox") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <Inbox size={20} style={{ opacity: isActive("inbox") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Inbox</span>
                {counts.inbox > 0 && (
                  <span className="count-badge" style={{ 
                    fontSize: "11px", fontWeight: "700",
                    background: isActive("inbox") ? "var(--gold-mid)" : "rgba(212, 175, 55,0.1)",
                    color: isActive("inbox") ? "var(--bg-body)" : "var(--gold-mid)",
                    padding: "2px 8px", borderRadius: "10px"
                  }}>{counts.inbox}</span>
                )}
              </div>
            </Link>

            {/* Starred */}
            <Link href="/dashboard/starred" className={`menu-link ${isActive("starred") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <Star size={20} style={{ opacity: isActive("starred") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Starred</span>
                {counts.starred > 0 && (
                  <span className="count-badge" style={{ 
                    fontSize: "11px", fontWeight: "700",
                    background: "rgba(212, 175, 55,0.1)", color: "var(--gold-mid)",
                    padding: "2px 8px", borderRadius: "10px"
                  }}>{counts.starred}</span>
                )}
              </div>
            </Link>

            {/* Sent */}
            <Link href="/dashboard/sent" className={`menu-link ${isActive("sent") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <Send size={20} style={{ opacity: isActive("sent") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Sent</span>
                {counts.sent > 0 && (
                  <span className="count-badge" style={{ 
                    fontSize: "11px", fontWeight: "700",
                    background: "rgba(212, 175, 55,0.1)", color: "var(--gold-mid)",
                    padding: "2px 8px", borderRadius: "10px"
                  }}>{counts.sent}</span>
                )}
              </div>
            </Link>

            {/* Drafts */}
            <Link href="/dashboard/drafts" className={`menu-link ${isActive("drafts") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <FileText size={20} style={{ opacity: isActive("drafts") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Drafts</span>
                {counts.drafts > 0 && (
                  <span className="count-badge" style={{ 
                    fontSize: "11px", fontWeight: "700",
                    background: "rgba(212, 175, 55,0.1)", color: "var(--gold-mid)",
                    padding: "2px 8px", borderRadius: "10px"
                  }}>{counts.drafts}</span>
                )}
              </div>
            </Link>

            {/* Requests */}
            <Link href="/dashboard/requests" className={`menu-link ${isActive("requests") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <UserPlus size={20} style={{ opacity: isActive("requests") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Requests</span>
                {counts.request > 0 && (
                  <span className="count-badge" style={{
                    fontSize: "11px", fontWeight: "700",
                    background: "rgba(212, 175, 55, 0.15)", color: "var(--gold-mid)",
                    padding: "2px 8px", borderRadius: "10px"
                  }}>{counts.request}</span>
                )}
              </div>
            </Link>

            {/* All Mail */}
            <Link href="/dashboard/all-mail" className={`menu-link ${isActive("all-mail") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <Mail size={20} style={{ opacity: isActive("all-mail") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>All Mail</span>
              </div>
            </Link>

            {/* Archive */}
            <Link href="/dashboard/archive" className={`menu-link ${isActive("archive") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <Archive size={20} style={{ opacity: isActive("archive") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Archive</span>
              </div>
            </Link>

            {/* Spam */}
            <Link href="/dashboard/spam" className={`menu-link ${isActive("spam") ? "active" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "12px" }}>
                <AlertTriangle size={20} style={{ opacity: isActive("spam") ? 1 : 0.7 }} />
                <span style={{ flex: 1, fontSize: "14px" }}>Spam</span>
                {counts.spam > 0 && (
                  <span className="count-badge" style={{
                    background: "#d93025", color: "#fff",
                    fontSize: "11px", padding: "2px 10px", borderRadius: "12px",
                    fontWeight: "800", boxShadow: "0 2px 8px rgba(217, 48, 37, 0.3)"
                  }}>
                    {counts.spam}
                  </span>
                )}
              </div>
            </Link>

            {/* Trash */}
            <Link href="/dashboard/trash" className={`menu-link ${isActive("trash") ? "active" : ""}`}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Trash2 size={18} /> Trash
              </span>
            </Link>

            <div className="nav-divider" />

            {/* Labels Section Header */}
            <div
              className="nav-section-label"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                userSelect: "none",
                marginTop: "10px"
              }}
              onClick={() => setLabelsOpen(!labelsOpen)}
            >
              <span>Labels</span>
              <ChevronDown
                size={12}
                style={{
                  transform: labelsOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.2s ease",
                  opacity: 0.7
                }}
              />
            </div>

            {labelsOpen && (
              <>
                {labels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => setActiveLabelId(activeLabelId === label.id ? null : label.id)}
                    className={`menu-link ${activeLabelId === label.id ? "active" : ""}`}
                    style={{
                      background: activeLabelId === label.id ? `${label.color}15` : "none",
                      borderLeft: activeLabelId === label.id ? `3px solid ${label.color}` : "none",
                      color: activeLabelId === label.id ? label.color : "var(--text-muted)",
                    }}
                  >
                    <div className="link-content" style={{ width: "100%" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Tag size={18} style={{ color: label.color }} />
                        <span style={{ fontWeight: activeLabelId === label.id ? 600 : 400 }}>
                          {label.name}
                        </span>
                      </span>
                      {label.emoji && <span style={{ marginLeft: "auto", opacity: 0.8 }}>{label.emoji}</span>}
                    </div>
                  </button>
                ))}

                {labels.length === 0 && (
                  <div style={{ padding: "4px 16px 8px", fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic" }}>
                    No labels yet
                  </div>
                )}

                <Link
                  href="/dashboard/settings#labels"
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 16px", fontSize: "11px",
                    color: "var(--gold-mid)", textDecoration: "none",
                    fontFamily: "Raleway, sans-serif", opacity: 0.8,
                  }}
                >
                  <Plus size={11} /> Manage Labels
                </Link>
              </>
            )}

            <div className="nav-divider" />
            <div className="nav-section-label">More</div>


            {/* IPFS */}
            <Link href="/dashboard/ipfs" className={`menu-link ${isActive("ipfs") ? "active" : ""}`}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Database size={18} /> IPFS Explorer
              </span>
            </Link>

            {/* Contacts */}
            <Link href="/dashboard/contacts" className={`menu-link ${isActive("contacts") ? "active" : ""}`}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Users size={18} /> Contacts
              </span>
            </Link>

            {/* Settings */}
            <Link href="/dashboard/settings" className={`menu-link ${isActive("settings") ? "active" : ""}`}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Settings size={18} /> Settings
              </span>
            </Link>
          </nav>

        </div>

        {/* Network status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
          <NetworkStatus />
        </div>

        {/* User section */}
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-email">{userEmail}</div>
          </div>
        </div>

        {/* Logout */}
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
            <LogOut size={18} />
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </aside>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>🚪</div>
            <h3 style={{ marginBottom: "12px", fontFamily: "Cinzel, serif", fontSize: "20px" }}>Sign Out?</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px", lineHeight: 1.6 }}>
              You are about to sign out of your current session. You credentials will remain saved in your vault.
            </p>
            <div className="modal-actions" style={{ display: "flex", gap: "12px" }}>
              <button className="btn-secondary" onClick={() => setShowLogoutModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn" onClick={handleLogout} style={{ flex: 1, background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))" }}>
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default memo(Sidebar)
