"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Logo from "@/components/Logo"

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 🛡️ [Test Mode] Always force redirect to signup to show the flow
    router.push("/signup")
  }, [router])

  if (loading) return null;

  return (
    <div className="page-center" style={{ textAlign: "center" }}>
      <div className="auth-card" style={{ maxWidth: "450px" }}>
        <div style={{ marginBottom: "32px" }}>
          <Logo size={80} layout="vertical" />
        </div>
        
        <h1 style={{ 
          fontSize: "28px", 
          marginBottom: "12px", 
          fontFamily: "Cinzel, serif",
          color: "var(--gold-mid)"
        }}>
          SecureMail
        </h1>
        
        <p style={{ 
          color: "var(--text-muted)", 
          fontSize: "14px", 
          lineHeight: "1.6",
          marginBottom: "32px"
        }}>
          The world's first fully decentralized, end-to-end encrypted email service. 
          Your identity, your data, your control.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button 
            className="btn" 
            onClick={() => router.push("/signup")}
            style={{ width: "100%", padding: "14px" }}
          >
            Get Started
          </button>
          
          <button 
            className="btn-secondary" 
            onClick={() => router.push("/login")}
            style={{ width: "100%", padding: "14px", border: "1px solid var(--border-gold)" }}
          >
            I already have an account
          </button>
        </div>

        <div style={{ 
          marginTop: "32px", 
          paddingTop: "24px", 
          borderTop: "1px solid var(--border-gold)",
          fontSize: "11px",
          color: "var(--text-dim)",
          display: "flex",
          justifyContent: "center",
          gap: "24px"
        }}>
          <span>🛡️ End-to-End Encrypted</span>
          <span>🌐 Decentralized Mesh</span>
        </div>
      </div>
    </div>
  )
}
