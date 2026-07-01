"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  getSavedAccounts,
  switchAccount,
  removeAccount,
  getCurrentAccount,
  getAvatarColor,
  logout,
  type SavedAccount,
} from "@/utils/accounts"
import { clearStore } from "@/utils/mailStore"

interface AccountSwitcherProps {
  onClose: () => void
}

export default function AccountSwitcher({ onClose }: AccountSwitcherProps) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  
  // States
  const [accounts, setAccounts] = useState<SavedAccount[]>([])
  const [currentEmail, setCurrentEmail] = useState("")
  const [removing, setRemoving] = useState<string | null>(null)
  
  // Custom Confirmation State
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    requirePasswordFor?: string; // email to check password against
    onConfirm: () => void;
  } | null>(null)
  
  const [passwordAttempt, setPasswordAttempt] = useState("")
  const [passwordError, setPasswordError] = useState("")

  useEffect(() => {
    refreshAccounts()
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.modal-overlay')) return
      if (ref.current && !ref.current.contains(target)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const refreshAccounts = () => {
    setAccounts(getSavedAccounts())
    const user = getCurrentAccount()
    if (user) setCurrentEmail(user.email)
  }

  const handleSwitch = (account: SavedAccount) => {
    if (account.email === currentEmail) { onClose(); return }
    clearStore()
    switchAccount(account)
    onClose()
    window.location.href = "/dashboard/inbox"
  }

  const handleSignOutClick = () => {
    setConfirmConfig({
      message: "Sign out of all sessions? Enter your password to securely sign out.",
      requirePasswordFor: currentEmail || undefined,
      onConfirm: () => {
        clearStore()
        logout()
        onClose()
        router.push("/login")
      }
    })
    setPasswordAttempt("")
    setPasswordError("")
  }

  const handleSecureConfirm = () => {
    if (confirmConfig?.requirePasswordFor) {
      const acc = accounts.find(a => a.email === confirmConfig.requirePasswordFor)
      if (acc && acc.password !== passwordAttempt) {
        setPasswordError("Incorrect password")
        return
      }
    }
    confirmConfig?.onConfirm()
  }

  const isDarkMode = document.documentElement.getAttribute("data-theme") === "dark"
  const themeBg = isDarkMode ? "var(--bg-body)" : "#ffffff"
  const themeText = isDarkMode ? "#ffffff" : "#1a1a1a"
  const themeGold = "var(--gold-mid)"

  return (
    <>
      {confirmConfig && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ 
            maxWidth: "420px", width: "90%", textAlign: "center",
            background: themeBg, border: `1px solid ${themeGold}`,
            borderRadius: "24px"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}></div>
            <h3 style={{ marginBottom: "20px", color: themeText, fontFamily: "Cinzel, serif" }}>
              Secure Authorization
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px", lineHeight: "1.6" }}>
              {confirmConfig.message}
            </p>

            {confirmConfig.requirePasswordFor && (
              <div style={{ marginBottom: "24px" }}>
                <input
                  type="password"
                  placeholder="Vault Passphrase..."
                  value={passwordAttempt}
                  onChange={(e) => { setPasswordAttempt(e.target.value); setPasswordError("") }}
                  style={{
                    width: "100%", background: "rgba(212, 175, 55,0.05)",
                    border: passwordError ? "1px solid #e84234" : `1px solid ${themeGold}`,
                    borderRadius: "12px", padding: "16px", color: themeGold,
                    textAlign: "center", fontSize: "16px", letterSpacing: "4px",
                    outline: "none"
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSecureConfirm()}
                />
                {passwordError && <div style={{ color: "#e84234", fontSize: "11px", marginTop: "8px" }}>{passwordError}</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button 
                onClick={() => { setConfirmConfig(null); setPasswordAttempt(""); setPasswordError(""); }}
                style={{ flex: 1, padding: "14px", background: "none", border: `1px solid ${themeGold}`, borderRadius: "12px", color: themeGold, fontWeight: "700", cursor: "pointer" }}
              >Cancel</button>
              <button 
                onClick={handleSecureConfirm}
                style={{ flex: 1, padding: "14px", background: `linear-gradient(135deg, var(--gold-rich), var(--gold-light))`, border: "none", borderRadius: "12px", color: "var(--bg-body)", fontWeight: "900", cursor: "pointer" }}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Account Switcher Dropdown */}
      <div ref={ref} style={{
        position: "absolute", top: "calc(100% + 12px)", right: 0,
        width: "360px", background: themeBg, border: `1px solid ${themeGold}`,
        borderRadius: "28px", overflow: "hidden", 
        boxShadow: `0 20px 50px ${isDarkMode ? "rgba(0,0,0,1)" : "rgba(212, 175, 55,0.15)"}`, zIndex: 1000,
        animation: "fadeUp 0.3s cubic-bezier(0.23, 1, 0.32, 1) both"
      }}>

        {/* User Info Header */}
        <div style={{ padding: "24px", textAlign: "center", borderBottom: `1px solid rgba(212, 175, 55,0.15)` }}>
          <div style={{ 
            width: "80px", height: "80px", borderRadius: "50%", 
            background: `linear-gradient(135deg, ${themeBg}, rgba(212, 175, 55,0.2))`, margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "32px", fontWeight: "800", color: themeGold,
            border: `3px solid ${themeGold}`, boxShadow: "var(--glow-gold-subtle)"
          }}>
            {(accounts.find(a => a.email === currentEmail)?.name || currentEmail).charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: themeGold, fontFamily: "Cinzel, serif" }}>
            {accounts.find(a => a.email === currentEmail)?.name || "Active Session"}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            {currentEmail}
          </div>
          <button 
            onClick={() => { onClose(); router.push("/dashboard/profile") }}
            style={{
              marginTop: "16px", padding: "8px 20px", borderRadius: "20px",
              border: `1px solid ${themeGold}`, background: "none",
              color: themeGold, fontSize: "11px", fontWeight: "800",
              cursor: "pointer", transition: "all 0.2s", textTransform: "uppercase", letterSpacing: "1px"
            }}
            onMouseOver={e => { e.currentTarget.style.background = themeGold; e.currentTarget.style.color = themeBg; }}
            onMouseOut={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = themeGold; }}
          >
            Account Identity
          </button>
        </div>

        {/* Other Accounts List */}
        {accounts.filter(a => a.email !== currentEmail).length > 0 && (
          <div style={{ borderBottom: `1px solid rgba(212, 175, 55,0.15)`, padding: "8px 0" }}>
            {accounts.filter(a => a.email !== currentEmail).map(acc => (
              <div 
                key={acc.email} 
                style={{ 
                  padding: "12px 24px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px",
                  transition: "background 0.2s"
                }}
                onMouseOver={e => e.currentTarget.style.background = "var(--bg-hover)"}
                onMouseOut={e => e.currentTarget.style.background = "none"}
                onClick={() => handleSwitch(acc)}
              >
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  background: getAvatarColor(acc.email), display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: "800", color: "var(--bg-body)"
                }}>
                  {(acc.name || acc.email).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: themeText }}>{acc.name || "Saved Account"}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button 
            onClick={() => { onClose(); router.push("/login?add=true") }}
            style={{ 
              width: "100%", padding: "14px", background: "rgba(212, 175, 55, 0.05)", border: `1px solid rgba(212, 175, 55, 0.2)`, 
              cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", 
              color: themeGold, fontSize: "14px", fontWeight: "700",
              borderRadius: "16px", transition: "all 0.2s ease"
            }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(212, 175, 55, 0.1)"}
            onMouseOut={e => e.currentTarget.style.background = "rgba(212, 175, 55, 0.05)"}
          >
            <div style={{ 
              width: "32px", height: "32px", borderRadius: "50%", 
              background: "rgba(212, 175, 55, 0.1)", display: "flex", 
              alignItems: "center", justifyContent: "center", fontSize: "16px",
              color: themeGold
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
            </div>
            Add another account
          </button>

          <button 
            onClick={handleSignOutClick} 
            style={{ 
              width: "100%", padding: "14px", background: "rgba(217,48,37,0.05)", border: "1px solid rgba(217,48,37,0.2)", 
              cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", 
              color: "#e84234", fontSize: "14px", fontWeight: "700",
              borderRadius: "16px", transition: "all 0.2s ease"
            }}
            onMouseOver={e => { e.currentTarget.style.background = "rgba(217,48,37,0.1)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "rgba(217,48,37,0.05)"; }}
          >
            <div style={{ 
              width: "32px", height: "32px", borderRadius: "50%", 
              background: "rgba(217,48,37,0.1)", display: "flex", 
              alignItems: "center", justifyContent: "center", fontSize: "16px",
              color: "#e84234"
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </div>
            Sign out of session
          </button>
        </div>

        <div style={{ padding: "16px", textAlign: "center", fontSize: "10px", color: "var(--text-muted)", borderTop: "1px solid rgba(212, 175, 55,0.1)", textTransform: "uppercase", letterSpacing: "1px" }}>
          Decentralized Protocol • SECURE
        </div>
      </div>
    </>
  )
}
