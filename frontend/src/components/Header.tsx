"use client"

import { useEffect, useState, useRef, memo } from "react"
import Link from "next/link"
import Image from "next/image"
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

function Header({ onToggle, onCompose }: HeaderProps) {
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<any>({})
  const [isDark, setIsDark] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [nodeStatus, setNodeStatus] = useState<"active" | "connecting">("active")
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  const [accountCount, setAccountCount] = useState(0)

  const searchRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    setCurrentUser(user)
    const savedTheme = localStorage.getItem("theme") || "dark"
    setIsDark(savedTheme === "dark")
    document.documentElement.setAttribute("data-theme", savedTheme)

    const accs = getSavedAccounts()
    setAccountCount(accs.length)

    const interval = setInterval(async () => {
      try {
        const { checkGunServer } = await import("@/utils/gun")
        const res = await checkGunServer()
        setNodeStatus(res.reachable ? "active" : "connecting")
      } catch {
        setNodeStatus("connecting")
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const updateUnread = () => {
      const inbox = getMails("inbox")
      setUnreadCount(inbox.filter((m: any) => !m.isRead).length)
    }
    updateUnread()
    const unsub = subscribe(updateUnread)
    return unsub
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    const all = getAllRaw()
    const q = searchQuery.toLowerCase()
    const filtered = all.filter(m => 
      m.subject?.toLowerCase().includes(q) ||
      m.senderEmail?.toLowerCase().includes(q) ||
      m.receiverEmail?.toLowerCase().includes(q) ||
      m.message?.toLowerCase().includes(q) ||
      m.id?.toLowerCase().includes(q) ||
      m.time?.toLowerCase().includes(q)
    ).slice(0, 8) // Limit to top 8 for the dropdown

    setSearchResults(filtered.map(m => ({
      id: m.id,
      subject: m.subject || "(No Subject)",
      senderEmail: m.senderEmail,
      receiverEmail: m.receiverEmail,
      time: m.time,
      status: m.status,
      snippet: m.message?.slice(0, 50) || ""
    })))
    setShowResults(true)
  }, [searchQuery])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
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

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false)
    setSearchQuery("")
    router.push(`/dashboard/inbox?highlight=${result.id}`)
  }

  return (
    <header className="header" style={{ height: "72px", borderBottom: "1px solid var(--border-gold)", padding: "0 24px" }}>
      <div className="header-left" style={{ minWidth: "200px" }}>
        <Logo size={28} />
      </div>

      <div className="header-middle" style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
        <div ref={searchRef} style={{ width: "100%", maxWidth: "580px", position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center",
            background: "var(--bg-input)", border: "1px solid var(--border-color)",
            borderRadius: "10px", height: "40px", padding: "0 16px",
            transition: "all 0.2s ease"
          }}>
            <Search size={16} color="var(--text-dim)" />
            <input
              suppressHydrationWarning={true}
              ref={inputRef}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "var(--text-bright)", fontSize: "14px", marginLeft: "12px",
                fontFamily: "Inter, sans-serif"
              }}
              placeholder="Search mail, contacts, attachments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowResults(false)
                  router.push(`/dashboard/inbox?search=${encodeURIComponent(searchQuery)}`)
                }
              }}
              onFocus={() => setSearchFocused(true)}
            />
            <div style={{ color: "var(--text-dim)", fontSize: "11px", fontWeight: "600", letterSpacing: "1px" }}>
              ⌘ K
            </div>
          </div>
          
          {showResults && searchResults.length > 0 && (
             <div style={{
               position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
               background: "var(--bg-card)", border: "1px solid var(--border-color)",
               borderRadius: "10px", overflow: "hidden", zIndex: 1000,
               boxShadow: "var(--shadow-deep)"
             }}>
               {searchResults.map((r) => (
                 <div 
                   key={r.id} 
                   onClick={() => handleResultClick(r)}
                   style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #1F1F1F" }}
                 >
                   <div style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: "600" }}>{r.subject}</div>
                   <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{r.senderEmail}</div>
                 </div>
               ))}
             </div>
          )}
        </div>
      </div>

      <div className="header-right" style={{ 
        flex: 1, 
        display: "flex", 
        justifyContent: "flex-end", 
        alignItems: "center", 
        gap: "24px",
        paddingLeft: "20px"
      }}>
        
        {/* Node Status Badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "var(--bg-hover)", border: "1px solid var(--border-gold)",
          padding: "6px 14px", borderRadius: "10px",
          transition: "all 0.3s ease",
          marginRight: "4px" // Extra push to prevent toggle overlap
        }}>
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: nodeStatus === "active" ? "var(--gold-mid)" : "#E84234",
            boxShadow: nodeStatus === "active" ? "0 0 10px var(--gold-mid)" : "none"
          }} />
          <span style={{ 
            fontSize: "11px", fontWeight: "800", color: "var(--gold-mid)", 
            letterSpacing: "0.5px", textTransform: "uppercase" 
          }}>
            {nodeStatus === "active" ? "Active" : "Syncing"}
          </span>
        </div>

        {/* Theme Toggle Button */}
        <button 
          className="theme-toggle"
          onClick={() => {
            const newTheme = !isDark
            setIsDark(newTheme)
            localStorage.setItem("theme", newTheme ? "dark" : "light")
            document.documentElement.setAttribute("data-theme", newTheme ? "dark" : "light")
          }}
          style={{ 
            padding: "4px", borderRadius: "50%", transition: "background 0.2s",
            flexShrink: 0 // Prevent shrinking
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "none")}
          title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
        >
          <div className="toggle-track">
            <span className="toggle-icon-left">
              <Moon size={14} color="var(--text-muted)" />
            </span>
            <div className={`toggle-thumb ${isDark ? "left" : "right"}`} />
            <span className="toggle-icon-right">
              <Sun size={14} color="var(--text-muted)" />
            </span>
          </div>
        </button>

        <button 
          className="header-icon-btn"
          style={{ 
            background: "rgba(255, 255, 255, 0.04)", 
            border: "1px solid rgba(255, 255, 255, 0.02)", 
            cursor: "pointer", 
            color: "var(--text-muted)", position: "relative",
            width: "36px", height: "36px", borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s ease"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
          }}
        >
          <span style={{ fontSize: "16px", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))", transform: "translateY(-1px)" }}>🔔</span>
          {unreadCount > 0 && (
            <div style={{
              position: "absolute", top: "-4px", right: "-4px",
              minWidth: "18px", height: "18px", borderRadius: "9px",
              background: "#D93025", border: "2px solid var(--bg-header)",
              color: "#FFF", fontSize: "10px", fontWeight: "800",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px", boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </div>
          )}
        </button>
        <div ref={accountRef} style={{ position: "relative" }}>
          <button
            onClick={() => {
              setShowAccountSwitcher((prev) => !prev)
              setAccountCount(getSavedAccounts().length)
            }}
            title="Switch account"
            style={{ 
              background: "none", border: "none", cursor: "pointer", padding: "0", 
              position: "relative", display: "flex", alignItems: "center" 
            }}
          >
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: currentUser.email
                ? getAvatarColor(currentUser.email)
                : "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: "800", color: "var(--bg-body)",
              marginLeft: "8px", border: showAccountSwitcher ? "2px solid var(--gold-mid)" : "1px solid var(--border-color)"
            }}>
              {(currentUser.email || "U").charAt(0).toUpperCase()}
            </div>
          </button>

          {showAccountSwitcher && (
            <AccountSwitcher onClose={() => setShowAccountSwitcher(false)} />
          )}
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
