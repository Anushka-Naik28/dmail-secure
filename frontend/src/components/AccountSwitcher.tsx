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

  // --- Logic triggered after user clicks "Confirm" in our custom UI ---
  const executeRemove = (email: string) => {
    setRemoving(email)
    setConfirmConfig(null)
    
    setTimeout(() => {
      removeAccount(email)
      if (email === currentEmail) {
        clearStore()
        const remaining = getSavedAccounts()
        if (remaining.length > 0) {
          switchAccount(remaining[0])
          window.location.href = "/dashboard/inbox"
        } else {
          logout()
          router.push("/login")
        }
      } else {
        refreshAccounts()
        setRemoving(null)
      }
    }, 300)
  }

  const handleRemoveClick = (e: React.MouseEvent, email: string) => {
    e.stopPropagation()
    const isCurrent = email === currentEmail
    setConfirmConfig({
      message: isCurrent 
        ? `Remove active account ${email}? This will log you out and delete saved keys. Enter password to confirm.`
        : `Remove ${email} from this device? Enter password to confirm.`,
      requirePasswordFor: email,
      onConfirm: () => executeRemove(email)
    })
    setPasswordAttempt("")
    setPasswordError("")
  }

  const handleSignOutClick = () => {
    setConfirmConfig({
      message: "Sign out of your current session? Your credentials will remain saved. Enter your password to securely sign out.",
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

  return (
    <>
      {/* CUSTOM MODAL OVERLAY (The replacement for alert) */}
      {confirmConfig && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: "520px", width: "90%", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔐</div>
            <h3 style={{ marginBottom: "20px", lineHeight: "1.4" }}>
              {confirmConfig.message}
            </h3>

            {confirmConfig.requirePasswordFor && (
              <div style={{ marginBottom: "20px" }}>
                <input
                  type="password"
                  placeholder="Enter password..."
                  value={passwordAttempt}
                  onChange={(e) => { setPasswordAttempt(e.target.value); setPasswordError("") }}
                  className="search-input"
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "14px",
                    fontSize: "16px", letterSpacing: "2px",
                    border: passwordError ? "1px solid #e84234" : "1px solid var(--border-gold)"
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSecureConfirm()}
                />
                {passwordError && (
                  <div style={{ color: "#e84234", fontSize: "11px", marginTop: "6px" }}>
                    {passwordError}
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button 
                onClick={() => { setConfirmConfig(null); setPasswordAttempt(""); setPasswordError(""); }}
                className="btn-secondary"
              >Cancel</button>
              <button 
                onClick={handleSecureConfirm}
                className="btn"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Account Switcher Dropdown */}
      <div ref={ref} style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0,
        width: "320px", background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
        borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 1000,
      }}>

      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-gold)", background: "linear-gradient(135deg, rgba(212,160,23,0.08), rgba(212,160,23,0.03))" }}>
        <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
          Saved Accounts
        </div>
      </div>

      {/* Account list */}
      <div style={{ maxHeight: "320px", overflowY: "auto" }}>
        {accounts.map((account) => {
          const isActive = account.email === currentEmail
          return (
            <div
              key={account.email}
              onClick={() => handleSwitch(account)}
              style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", cursor: "pointer",
                background: isActive ? "rgba(212,160,23,0.06)" : "none",
                borderBottom: "1px solid rgba(212,160,23,0.06)",
                transition: "all 0.2s ease",
                opacity: removing === account.email ? 0 : 1,
              }}
            >
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: getAvatarColor(account.email), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", color: "#fff", border: isActive ? "2px solid var(--gold-mid)" : "2px solid transparent" }}>
                {(account.name || account.email).charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: isActive ? "var(--gold-mid)" : "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {account.name || account.email.split("@")[0]}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {account.email}
                </div>
              </div>

              <button
                onClick={(e) => handleRemoveClick(e, account.email)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: "8px" }}
              >✕</button>
            </div>
          )
        })}
      </div>

      {/* Footer Actions */}
      <div style={{ borderTop: "1px solid var(--border-gold)" }}>

        <button onClick={() => { onClose(); router.push("/dashboard/profile") }} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-bright)", fontSize: "13px", fontWeight: "600", borderBottom: "1px solid rgba(212,160,23,0.06)" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(76,175,110,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", border: "1px solid rgba(76,175,110,0.3)", color: "#4caf6e" }}>👤</div>
          View Profile Details
        </button>

        <button onClick={() => { onClose(); router.push("/login?addAccount=true") }} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-bright)", fontSize: "13px", fontWeight: "600", borderBottom: "1px solid rgba(212,160,23,0.06)" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px dashed var(--border-gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "var(--text-muted)" }}>+</div>
          Add another account
        </button>

        <button onClick={handleSignOutClick} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", fontSize: "13px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(217,48,37,0.08)", border: "1px solid rgba(217,48,37,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>🚪</div>
          Sign out of session
        </button>
      </div>
      </div>
    </>
  )
}