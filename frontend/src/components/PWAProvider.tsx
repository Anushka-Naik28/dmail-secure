"use client"

import { useEffect, useState } from "react"
import {
  registerServiceWorker,
  initInstallPrompt,
  canInstall,
  installPWA,
  isInstalled,
  requestNotificationPermission,
  isBiometricAvailable,
  hasBiometricRegistered,
  registerBiometric,
  isIOS,
  showLocalNotification,
} from "@/utils/pwa"
import { subscribe, getMails } from "@/utils/mailStore"
import { startRelayDiscovery } from "@/utils/gun"

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showIOSBanner, setShowIOSBanner]         = useState(false)
  const [showBiometricBanner, setShowBiometricBanner] = useState(false)
  const [installing, setInstalling]               = useState(false)
  const [dismissed, setDismissed]                 = useState(false)
  const seenCountRef = { current: 0 }

  useEffect(() => {
    // Register SW
    registerServiceWorker()

    // Start Zero-Config Relay Discovery (Mesh Networking)
    startRelayDiscovery()

    // Start Identity Heartbeat (Auto-repair corrupted cloud records)
    const { db } = require("@/utils/gun")
    db.startIdentityHeartbeat()

    // Init install prompt listener
    initInstallPrompt()

    // Show install banner after 3s if not installed
    const timer = setTimeout(() => {
      const wasDismissed = localStorage.getItem("pwa_install_dismissed")
      if (wasDismissed) return
      if (isInstalled()) return

      if (isIOS()) {
        setShowIOSBanner(true)
      } else {
        // Check after a tick so beforeinstallprompt has fired
        setTimeout(() => {
          if (canInstall()) setShowInstallBanner(true)
        }, 500)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // Request notification permission + show biometric prompt
  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    // Request notifications
    requestNotificationPermission()

    // Show biometric prompt if available and not yet registered
    const checkBiometric = async () => {
      const available   = await isBiometricAvailable()
      const registered  = hasBiometricRegistered(user.email)
      const wasDismissed = localStorage.getItem(`biometric_dismissed_${user.email}`)
      if (available && !registered && !wasDismissed) {
        setTimeout(() => setShowBiometricBanner(true), 5000)
      }
    }
    checkBiometric()
  }, [])

  // Listen for new mails and show push notification
  useEffect(() => {
    if (typeof window === "undefined") return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    // Seed current count
    seenCountRef.current = getMails("inbox").length

    const unsub = subscribe(() => {
      const inbox    = getMails("inbox")
      const newCount = inbox.length
      if (newCount > seenCountRef.current) {
        const newest = inbox[inbox.length - 1]
        if (Notification.permission === "granted" && !document.hasFocus()) {
          showLocalNotification(
            "📬 New mail in SecureMail",
            `From: ${newest?.senderEmail || "Unknown"} — ${newest?.subject || "(No subject)"}`,
            "/dashboard/inbox"
          )
        }
      }
      seenCountRef.current = newCount
    })

    return () => { unsub() }
  }, [])

  const handleInstall = async () => {
    setInstalling(true)
    const accepted = await installPWA()
    setInstalling(false)
    setShowInstallBanner(false)
    if (accepted) localStorage.setItem("pwa_installed", "true")
  }

  const handleDismissInstall = () => {
    setShowInstallBanner(false)
    setShowIOSBanner(false)
    setDismissed(true)
    localStorage.setItem("pwa_install_dismissed", "true")
  }

  const handleRegisterBiometric = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    const success = await registerBiometric(user.email)
    setShowBiometricBanner(false)
    if (success) {
      alert("✅ Biometric unlock enabled! You can now unlock SecureMail with your fingerprint or face.")
    }
  }

  const handleDismissBiometric = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    localStorage.setItem(`biometric_dismissed_${user.email}`, "true")
    setShowBiometricBanner(false)
  }

  return (
    <>
      {children}

      {/* ── Install banner (Android / Desktop) ── */}
      {showInstallBanner && !dismissed && (
        <div style={{
          position: "fixed", bottom: "80px", left: "16px", right: "16px",
          background: "var(--bg-card)", border: "1px solid var(--border-gold)",
          borderRadius: "14px", padding: "16px",
          boxShadow: "var(--shadow-deep)",
          zIndex: 600, display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "10px", flexShrink: 0,
            background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px",
          }}>✉️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "2px" }}>
              Install SecureMail
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Add to home screen for faster access and offline support
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={handleDismissInstall}
              style={{
                background: "none", border: "1px solid var(--border-gold)",
                borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "11px",
              }}
            >Not now</button>
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                border: "none", borderRadius: "8px", padding: "6px 14px",
                cursor: "pointer", fontSize: "11px", fontWeight: "700", color: "var(--bg-body)",
                fontFamily: "Raleway, sans-serif",
              }}
            >{installing ? "Installing..." : "Install"}</button>
          </div>
        </div>
      )}

      {/* ── iOS install instructions ── */}
      {showIOSBanner && !dismissed && (
        <div style={{
          position: "fixed", bottom: "80px", left: "16px", right: "16px",
          background: "var(--bg-card)", border: "1px solid var(--border-gold)",
          borderRadius: "14px", padding: "16px",
          boxShadow: "var(--shadow-deep)",
          zIndex: 600,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)" }}>
              📱 Install on iPhone / iPad
            </div>
            <button
              onClick={handleDismissInstall}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "16px" }}
            >✕</button>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.7" }}>
            <div>1. Tap the <strong style={{ color: "var(--text-bright)" }}>Share</strong> button (⬆) at the bottom of Safari</div>
            <div>2. Scroll down and tap <strong style={{ color: "var(--text-bright)" }}>"Add to Home Screen"</strong></div>
            <div>3. Tap <strong style={{ color: "var(--text-bright)" }}>Add</strong> — DMail will appear on your home screen</div>
          </div>
          <div style={{
            marginTop: "10px", padding: "8px 12px", borderRadius: "8px",
            background: "rgba(212, 175, 55,0.08)", border: "1px solid rgba(212, 175, 55,0.2)",
            fontSize: "11px", color: "var(--gold-mid)",
          }}>
            💡 Works fully offline once installed
          </div>
        </div>
      )}

      {/* ── Biometric prompt ── */}
      {showBiometricBanner && (
        <div style={{
          position: "fixed", bottom: "80px", left: "16px", right: "16px",
          background: "var(--bg-card)", border: "1px solid var(--border-gold)",
          borderRadius: "14px", padding: "16px",
          boxShadow: "var(--shadow-deep)",
          zIndex: 600, display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "10px", flexShrink: 0,
            background: "rgba(76,175,110,0.12)", border: "1px solid rgba(76,175,110,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px",
          }}>🔑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "2px" }}>
              Enable Biometric Unlock
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Use fingerprint or face ID to unlock SecureMail instantly
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={handleDismissBiometric}
              style={{
                background: "none", border: "1px solid var(--border-gold)",
                borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "11px",
              }}
            >Skip</button>
            <button
              onClick={handleRegisterBiometric}
              style={{
                background: "rgba(76,175,110,0.12)",
                border: "1px solid rgba(76,175,110,0.4)",
                borderRadius: "8px", padding: "6px 14px",
                cursor: "pointer", fontSize: "11px", fontWeight: "700",
                color: "#4caf6e", fontFamily: "Raleway, sans-serif",
              }}
            >Enable</button>
          </div>
        </div>
      )}
    </>
  )
}
