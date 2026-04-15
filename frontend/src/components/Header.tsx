"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import Image from "next/image" // 1. Added Image import
import { useRouter } from "next/navigation"
import { subscribe, getMails, clearStore, initMailStore, getAllRaw } from "@/utils/mailStore"
import AccountSwitcher from "@/components/AccountSwitcher"
import Logo from "@/components/Logo"
import { getSavedAccounts, getAvatarColor } from "@/utils/accounts"

import {
  Bell, Sun, Moon, RefreshCw,
  PenSquare, Search, Menu, X
} from "lucide-react"

interface HeaderProps {
  onToggle: () => void
  onCompose?: () => void
}

interface Notification {
  id: string
  subject: string
  senderEmail: string
  time: string
  read: boolean
}

interface SearchResult {
  id: string
  subject: string
  senderEmail: string
  receiverEmail: string
  time: string
  status: string
  snippet: string
  isReply?: boolean
  isForward?: boolean
}

export default function Header({ onToggle, onCompose }: HeaderProps) {
  const router = useRouter()

  const [name, setName] = useState("User")
  const [currentUser, setCurrentUser] = useState<any>({})
  const [isDark, setIsDark] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshed, setRefreshed] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // ── Account switcher ──
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  const [accountCount, setAccountCount] = useState(0)
  const accountRef = useRef<HTMLDivElement>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [mounted, setMounted] = useState(false)

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setMounted(true)
    const checkUser = () => {
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      setCurrentUser(user)
      if (user.name) setName(user.name)
      else if (user.email) setName(user.email.split("@")[0])
      else setName("User")

      const accs = getSavedAccounts()
      setAccountCount(accs.length)
      setAccounts(accs)
    }
    const savedTheme = localStorage.getItem("theme") || "dark"
    setIsDark(savedTheme === "dark")
    document.documentElement.setAttribute("data-theme", savedTheme)
    checkUser()
    window.addEventListener("storage", checkUser)
    return () => window.removeEventListener("storage", checkUser)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const existing = getMails("inbox")
    existing.forEach((m: any) => seenIdsRef.current.add(m.id))

    const unsub = subscribe(() => {
      const inbox = getMails("inbox")
      const newMails = inbox.filter((m: any) => !seenIdsRef.current.has(m.id))
      if (newMails.length > 0) {
        newMails.forEach((m: any) => seenIdsRef.current.add(m.id))
        setNotifications((prev) => {
          const fresh: Notification[] = newMails.map((m: any) => ({
            id: m.id,
            subject: m.subject || "(No subject)",
            senderEmail: m.senderEmail || "unknown",
            time: m.time || "",
            read: false,
          }))
          return [...fresh, ...prev].slice(0, 20)
        })
        setUnreadCount((prev) => prev + newMails.length)
      }
    })
    return () => { unsub() }
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
        setSearchFocused(false)
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setShowAccountSwitcher(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query || query.length < 2) {
      setSearchResults([])
      setShowResults(false)
      setActiveIndex(-1)
      return
    }

    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const allMails = getAllRaw()

    const results: SearchResult[] = allMails
      .filter((m: any) => {
        if (!m || m.status === "purged") return false
        if (m.receiverEmail !== user.email && m.senderEmail !== user.email) return false
        return (
          m.subject?.toLowerCase().includes(query) ||
          m.senderEmail?.toLowerCase().includes(query) ||
          m.receiverEmail?.toLowerCase().includes(query) ||
          m.message?.toLowerCase().includes(query) ||
          m.time?.toLowerCase().includes(query)
        )
      })
      .slice(0, 8)
      .map((m: any) => {
        let snippet = ""
        if (m.subject?.toLowerCase().includes(query)) {
          snippet = m.subject
        } else if (m.senderEmail?.toLowerCase().includes(query)) {
          snippet = `From: ${m.senderEmail}`
        } else if (m.receiverEmail?.toLowerCase().includes(query)) {
          snippet = `To: ${m.receiverEmail}`
        } else if (m.message?.toLowerCase().includes(query)) {
          const idx = m.message.toLowerCase().indexOf(query)
          const start = Math.max(0, idx - 30)
          snippet = (start > 0 ? "..." : "") + m.message.slice(start, idx + 60) + "..."
        } else {
          snippet = m.time || ""
        }
        return {
          id: m.id,
          subject: m.subject || "(No subject)",
          senderEmail: m.senderEmail,
          receiverEmail: m.receiverEmail,
          time: m.time?.split(",")[0] || "",
          status: m.status,
          snippet,
          isReply: m.isReply,
          isForward: m.isForward,
        }
      })

    setSearchResults(results)
    setShowResults(results.length > 0)
    setActiveIndex(-1)
  }, [searchQuery])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, searchResults.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (activeIndex >= 0 && searchResults[activeIndex]) {
        handleResultClick(searchResults[activeIndex])
      } else if (searchQuery.trim()) {
        router.push(`/dashboard/inbox?search=${encodeURIComponent(searchQuery.trim())}`)
        setShowResults(false)
      }
    } else if (e.key === "Escape") {
      setShowResults(false)
      setSearchQuery("")
      inputRef.current?.blur()
    }
  }

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false)
    setSearchQuery("")
    const folder =
      result.status === "trash" ? "trash" :
        result.status === "spam" ? "spam" :
          result.status === "request" ? "spam" :
            result.status === "draft" ? "drafts" :
              result.senderEmail === JSON.parse(localStorage.getItem("user") || "{}").email
                ? "sent" : "inbox"
    router.push(`/dashboard/${folder}?highlight=${result.id}`)
  }

  const getStatusIcon = (result: SearchResult) => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (result.senderEmail === user.email) return "📤"
    if (result.status === "trash") return "🗑️"
    if (result.status === "spam") return "🚫"
    if (result.status === "request") return "📬"
    if (result.isReply) return "↩️"
    if (result.isForward) return "↪️"
    return "📧"
  }

  const highlightMatch = (text: string, query: string) => {
    if (!query || !text) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: "rgba(212,160,23,0.3)", color: "var(--gold-mid)", borderRadius: "2px", padding: "0 1px" }}>
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  const toggleTheme = () => {
    const newTheme = isDark ? "light" : "dark"
    setIsDark(!isDark)
    localStorage.setItem("theme", newTheme)
    document.documentElement.setAttribute("data-theme", newTheme)
  }

  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (user.email) {
      clearStore()
      initMailStore(user.email)
      setTimeout(() => {
        getMails("inbox").forEach((m: any) => seenIdsRef.current.add(m.id))
      }, 1000)
    }
    setTimeout(() => {
      setRefreshing(false)
      setRefreshed(true)
      setTimeout(() => setRefreshed(false), 2000)
    }, 1200)
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  const markOneRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const clearAll = () => {
    setNotifications([])
    setUnreadCount(0)
    setShowNotifs(false)
  }

  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-icon" onClick={onToggle}><Menu size={20} /></button>

        <Link href="/dashboard/inbox" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <Logo size={32} />
          <span className="decentralized-badge" style={{
            fontSize: "8px", fontWeight: "900", letterSpacing: "1px",
            background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.35)",
            color: "var(--gold-mid)", padding: "2px 8px", borderRadius: "5px",
            marginLeft: "12px", textTransform: "uppercase", height: "fit-content"
          }}>Decentralized</span>
        </Link>
      </div>

      {/* ── Global Search ── */}
      <div className="header-middle">
        <div ref={searchRef} style={{ position: "relative", width: "100%", maxWidth: "720px" }}>
          <div
            className="search-container"
            style={{
              border: searchFocused ? "1px solid var(--gold-mid)" : "1px solid transparent",
              background: searchFocused ? "var(--bg-card)" : "rgba(255,255,255,0.05)",
              transition: "all 0.2s ease", borderRadius: "8px", 
              height: "44px", // Slighter, more professional
              padding: "0 18px"
            }}
          >
            <Search size={18} color="var(--text-dim)" />
            <input
              ref={inputRef}
              className="search-input"
              placeholder="Search mail"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { setSearchFocused(true); if (searchResults.length > 0) setShowResults(true) }}
              onKeyDown={handleSearchKeyDown}
              style={{ flex: 1, fontSize: "15px", marginLeft: "12px" }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setShowResults(false); inputRef.current?.focus() }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 4px", display: "flex", alignItems: "center" }}
              ><X size={14} /></button>
            )}
          </div>

          {showResults && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
              background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
              borderRadius: "14px", overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 1000,
            }}>
              <div style={{
                padding: "10px 14px", borderBottom: "1px solid rgba(212,160,23,0.1)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "Raleway, sans-serif" }}>
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for
                  <strong style={{ color: "var(--gold-mid)", marginLeft: "4px" }}>"{searchQuery}"</strong>
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                  ↑↓ navigate · Enter to open · Esc to close
                </span>
              </div>

              {searchResults.map((result, idx) => (
                <div
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: "1px solid rgba(212,160,23,0.06)",
                    background: idx === activeIndex ? "rgba(212,160,23,0.08)" : "none",
                    transition: "background 0.1s ease",
                    display: "flex", alignItems: "flex-start", gap: "10px",
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div style={{
                    width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                    background: "rgba(212,160,23,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
                  }}>{getStatusIcon(result)}</div>

                  <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {highlightMatch(result.subject, searchQuery)}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-dim)", flexShrink: 0 }}>{result.time}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {highlightMatch(
                        result.senderEmail === JSON.parse(localStorage.getItem("user") || "{}").email
                          ? `To: ${result.receiverEmail}` : `From: ${result.senderEmail}`,
                        searchQuery
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {highlightMatch(result.snippet, searchQuery)}
                    </div>
                  </div>

                  <span style={{
                    fontSize: "9px", padding: "2px 7px", borderRadius: "6px",
                    background: "rgba(212,160,23,0.1)", color: "var(--gold-mid)",
                    border: "1px solid rgba(212,160,23,0.2)",
                    fontFamily: "Raleway, sans-serif", fontWeight: "700",
                    flexShrink: 0, alignSelf: "center", textTransform: "capitalize",
                  }}>
                    {result.status === "request" ? "Requests"
                      : result.senderEmail === JSON.parse(localStorage.getItem("user") || "{}").email
                        ? "Sent" : result.status === "inbox" ? "Inbox" : result.status}
                  </span>
                </div>
              ))}

              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔍</div>
                  No results for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="header-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>



        {/* Refresh */}
        <button
          onClick={handleRefresh} disabled={refreshing} title="Refresh mail"
          style={{
            background: "none", border: "1px solid var(--border-gold)",
            borderRadius: "8px", padding: "6px 10px",
            cursor: refreshing ? "not-allowed" : "pointer",
            color: refreshed ? "#4caf6e" : "var(--text-bright)",
            fontSize: "14px", display: "flex", alignItems: "center", gap: "6px",
            opacity: refreshing ? 0.7 : 1, transition: "all 0.2s ease",
          }}
        >
          <RefreshCw size={16} style={{ color: refreshed ? "#4caf6e" : "var(--text-bright)", animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          <span style={{ fontSize: "11px", fontFamily: "Raleway, sans-serif", fontWeight: "600" }}>
            {refreshing ? "Refreshing..." : refreshed ? "Done" : "Refresh"}
          </span>
        </button>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            onClick={() => { setShowNotifs((prev) => !prev); if (!showNotifs && unreadCount > 0) markAllRead() }}
            title="Notifications"
            style={{
              background: "none", border: "1px solid var(--border-gold)",
              borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
              color: "var(--text-bright)", position: "relative",
              display: "flex", alignItems: "center", transition: "all 0.2s ease",
            }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: "-6px", right: "-6px",
                background: "linear-gradient(135deg, #c0392b, #8b1a1a)",
                color: "#fff", fontSize: "9px", fontWeight: "800",
                padding: "2px 5px", borderRadius: "10px",
                minWidth: "16px", textAlign: "center", lineHeight: "1.4",
              }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>

          {showNotifs && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0,
              width: "320px", maxHeight: "420px",
              background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
              borderRadius: "14px", overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              zIndex: 1000, display: "flex", flexDirection: "column",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border-gold)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--text-bright)", fontFamily: "Raleway, sans-serif" }}>
                  🔔 Notifications
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {notifications.length > 0 && (
                    <>
                      <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10px", color: "var(--gold-mid)", fontFamily: "Raleway, sans-serif", fontWeight: "600" }}>Mark all read</button>
                      <button onClick={clearAll} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10px", color: "var(--text-muted)", fontFamily: "Raleway, sans-serif" }}>Clear all</button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔔</div>
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markOneRead(notif.id)}
                      style={{
                        padding: "12px 16px", borderBottom: "1px solid rgba(212,160,23,0.08)",
                        background: notif.read ? "none" : "rgba(212,160,23,0.05)",
                        cursor: "pointer", transition: "background 0.15s ease",
                        display: "flex", gap: "10px", alignItems: "flex-start",
                      }}
                    >
                      <div style={{
                        width: "7px", height: "7px", borderRadius: "50%",
                        flexShrink: 0, marginTop: "5px",
                        background: notif.read ? "transparent" : "var(--gold-mid)",
                      }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "12px", fontWeight: notif.read ? "500" : "700", color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {notif.subject}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          From: {notif.senderEmail}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                          {notif.time}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme} className="theme-toggle"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </button>



        <div ref={accountRef} style={{ position: "relative" }}>
          <button
            onClick={() => {
              setShowAccountSwitcher((prev) => !prev)
              setAccountCount(getSavedAccounts().length)
            }}
            title="Switch account"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0", position: "relative" }}
          >
            <div style={{
              width: "34px", height: "34px", borderRadius: "50%",
              background: currentUser.email
                ? getAvatarColor(currentUser.email)
                : "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: "800", color: "#fff",
              border: showAccountSwitcher ? "2px solid var(--gold-mid)" : "2px solid var(--border-gold)",
              transition: "border 0.2s ease",
              boxShadow: showAccountSwitcher ? "0 0 0 3px rgba(212,160,23,0.2)" : "none",
            }}>
              {(currentUser.name || currentUser.email || "U").charAt(0).toUpperCase()}
            </div>

            {accountCount > 1 && (
              <span style={{
                position: "absolute", bottom: "-2px", right: "-2px",
                width: "14px", height: "14px", borderRadius: "50%",
                background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                color: "#000", fontSize: "8px", fontWeight: "800",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid var(--bg-panel)",
              }}>{accountCount}</span>
            )}
          </button>

          {showAccountSwitcher && (
            <AccountSwitcher onClose={() => setShowAccountSwitcher(false)} />
          )}
        </div>
      </div>
    </header>
  )
}