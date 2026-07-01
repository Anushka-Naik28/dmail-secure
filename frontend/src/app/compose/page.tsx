"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect } from "react"

// This page redirects legacy /compose links to /dashboard/compose
// which uses the correct PGP + IPFS + GunDB powered ComposeWindow
function ComposeRedirect() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams()
    const to = searchParams.get("to")
    const subject = searchParams.get("subject")
    const message = searchParams.get("message")
    if (to) params.set("to", to)
    if (subject) params.set("subject", subject)
    if (message) params.set("message", message)
    router.replace(`/dashboard/compose${params.toString() ? `?${params.toString()}` : ""}`)
  }, [router, searchParams])

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg-dark)",
      flexDirection: "column", gap: "8px",
      color: "var(--text-muted)", fontFamily: "Raleway, sans-serif",
    }}>
      <span style={{ fontSize: "32px", opacity: 0.3 }}>✏️</span>
      <span style={{ fontSize: "13px" }}>Opening secure compose...</span>
    </div>
  )
}

export default function ComposePage() {
  return (
    <Suspense>
      <ComposeRedirect />
    </Suspense>
  )
}
