"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { getCounts, subscribe } from "@/utils/mailStore"
import { Inbox, Send, PenSquare, Users, Settings } from "lucide-react"

interface MobileNavProps {
  onCompose: () => void
}

export default function MobileNav({ onCompose }: MobileNavProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [counts, setCounts] = useState({ inbox: 0, spam: 0, request: 0 })

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    const refresh = () => {
      const c = getCounts(user.email)
      setCounts({ inbox: c.inbox, spam: c.spam, request: c.request })
    }
    refresh()
    const unsub = subscribe(refresh)
    return () => { unsub() }
  }, [])

  const isActive = (segment: string) => pathname.includes(segment)

  const navItems = [
    {
      icon: <Inbox size={22} />,
      label: "Inbox",
      path: "/dashboard/inbox",
      badge: counts.inbox,
    },
    {
      icon: <Send size={22} />,
      label: "Sent",
      path: "/dashboard/sent",
      badge: 0,
    },
    {
      icon: null, // compose — center button
      label: "Compose",
      path: null,
      badge: 0,
    },
    {
      icon: <Users size={22} />,
      label: "Contacts",
      path: "/dashboard/contacts",
      badge: 0,
    },
    {
      icon: <Settings size={22} />,
      label: "Settings",
      path: "/dashboard/settings",
      badge: 0,
    },
  ]

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "64px",
      background: "var(--bg-card)",
      borderTop: "1px solid var(--border-gold)",
      display: "flex", alignItems: "center",
      zIndex: 500,
      paddingBottom: "env(safe-area-inset-bottom)",
      boxShadow: "var(--shadow-deep)",
    }}>
      {navItems.map((item, idx) => {
        // ── Center compose button ──
        if (item.path === null) {
          return (
            <div key="compose" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <button
                onClick={onCompose}
                style={{
                  width: "52px", height: "52px", borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(212, 175, 55,0.4)",
                  transform: "translateY(-8px)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-10px) scale(1.05)"
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-8px) scale(1)"
                }}
              >
                <PenSquare size={22} color="var(--bg-body)" />
              </button>
            </div>
          )
        }

        const active = isActive(item.path!.split("/").pop()!)

        return (
          <button
            key={item.path}
            onClick={() => router.push(item.path!)}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "3px", background: "none", border: "none",
              cursor: "pointer", padding: "8px 0",
              color: active ? "var(--gold-mid)" : "var(--text-muted)",
              transition: "color 0.15s ease",
              position: "relative",
            }}
          >
            {/* Badge */}
            {item.badge > 0 && (
              <span style={{
                position: "absolute", top: "4px",
                right: "calc(50% - 16px)",
                background: "linear-gradient(135deg, #c0392b, #8b1a1a)",
                color: "#fff", fontSize: "8px", fontWeight: "800",
                padding: "1px 4px", borderRadius: "8px",
                minWidth: "14px", textAlign: "center", lineHeight: "1.4",
              }}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}

            {item.icon}

            <span style={{
              fontSize: "9px", fontWeight: active ? "700" : "500",
              fontFamily: "Raleway, sans-serif",
            }}>
              {item.label}
            </span>

            {/* Active dot */}
            {active && (
              <div style={{
                position: "absolute", bottom: "2px",
                width: "4px", height: "4px", borderRadius: "50%",
                background: "var(--gold-mid)",
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
