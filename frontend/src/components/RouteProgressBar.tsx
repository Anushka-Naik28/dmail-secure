"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export default function RouteProgressBar() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(timer)
  }, [pathname])

  if (!loading) return null

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "3px",
      background: "linear-gradient(90deg, var(--gold-mid), var(--gold-light))",
      zIndex: 9999, animation: "progress 0.4s ease-out forwards"
    }}>
      <style jsx>{`
        @keyframes progress {
          0% { width: 0; opacity: 1; }
          90% { width: 100%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
