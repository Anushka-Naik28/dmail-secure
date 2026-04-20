"use client"
import GunStatusBanner from "@/components/GunStatusBanner"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Header from "@/components/Header"
import Sidebar from "@/components/Sidebar"
import OfflineQueueProcessor from "@/components/offlineQueueProcessor"
import ComposeWindow from "@/components/ComposeWindow"
import { initMailStore, updateMailInStore, getAllRaw } from "@/utils/mailStore"
import { db } from "@/utils/gun"
import { LabelProvider } from "@/context/LabelContext"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    initMailStore(user.email)
    
    // 📡 Self-Healing Sync: Re-announce presence so other devices can find us
    db.reannounceUser()

    // 🌍 Global Identity Heartbeat: Re-broadcasts our public key every 2 minutes
    // so that any device on the network can always find us.
    // IMPORTANT: Must be called ONCE here, not inside mail event listeners.
    db.startIdentityHeartbeat()

    // 📡 LAN-level IPFS PubSub Discovery (same WiFi network)
    if (user.publicKey) {
      import("@/utils/ipfs").then(mod => {
        mod.startDiscoveryPubSub(user.email, user.publicKey)
      })
    }
  }, [])

  // Maintenance — snooze + self-destruct + OUTBOX PROCESSING
  useEffect(() => {
    if (typeof window === "undefined") return

    const interval = setInterval(async () => {
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      if (!user.email) return

      const now = Date.now()

      // 1. Process Snooze & Expiry
      getAllRaw().forEach((mail: any) => {
        if (!mail?.id) return
        if (mail.expiryTime && now > mail.expiryTime) {
          updateMailInStore(mail.id, { status: "purged" })
        } else if (mail.status === "snoozed" && mail.snoozeUntil && now > mail.snoozeUntil) {
          updateMailInStore(mail.id, { status: "inbox", snoozeUntil: null })
        }
      })

      // 2. Process Scheduled Mails (Outbox)
      const scheduledKey = `scheduled_${user.email}`
      const scheduledMails = JSON.parse(localStorage.getItem(scheduledKey) || "[]")
      if (scheduledMails.length > 0) {
        let hasChanges = false
        const remaining = []

        for (const sMail of scheduledMails) {
          if (now >= sMail.targetTime) {
            try {
              // Time has come! Prepare and dispatch directly to Gun network
              const dispatchMail = { ...sMail, time: new Date().toLocaleString() }
              delete dispatchMail.targetTime
              delete dispatchMail.targetTimeText
              delete dispatchMail.id

              await db.sendMail(dispatchMail)
              hasChanges = true
            } catch (err) {
              console.warn("Scheduled send failed, will retry next tick", err)
              remaining.push(sMail)
            }
          } else {
            remaining.push(sMail)
          }
        }

        if (hasChanges) {
          localStorage.setItem(scheduledKey, JSON.stringify(remaining))
          window.dispatchEvent(new Event("storage"))
        }
      }
    }, 15000) // Polls every 15 seconds

    return () => clearInterval(interval)
  }, [pathname])

  // Listen for compose trigger from anywhere in the app
  useEffect(() => {
    const handleOpenCompose = () => setShowCompose(true)
    window.addEventListener("openCompose", handleOpenCompose)
    return () => window.removeEventListener("openCompose", handleOpenCompose)
  }, [])

  return (
    <LabelProvider>
      <GunStatusBanner />
      <div className="dashboard">

        <Header
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onCompose={() => setShowCompose(true)}
        />
        <div className="dashboard-body">
          <Sidebar
            isOpen={isSidebarOpen}
            onCompose={() => setShowCompose(true)}
          />
          <main className="mail-area">{children}</main>
        </div>

        <OfflineQueueProcessor />

        {/* Floating compose window — rendered at layout level so it persists across routes */}
        {showCompose && (
          <ComposeWindow onClose={() => setShowCompose(false)} />
        )}
      </div>
    </LabelProvider>
  )
}