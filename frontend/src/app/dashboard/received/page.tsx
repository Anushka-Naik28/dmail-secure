"use client"

/**
 * /dashboard/received — Legacy page redirect
 * 
 * This route previously used a CryptoJS AES + localStorage-only mail system
 * which is incompatible with the current PGP + IPFS + GunDB global network.
 * 
 * All received mails are now in /dashboard/inbox which uses:
 * - OpenPGP.js (ECC Curve25519) for decryption
 * - IPFS (Kubo) for content retrieval
 * - GunDB for the global P2P index
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ReceivedPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/inbox")
  }, [router])

  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--text-muted)",
      fontSize: "13px", fontFamily: "Raleway, sans-serif",
    }}>
      Redirecting to Inbox...
    </div>
  )
}
