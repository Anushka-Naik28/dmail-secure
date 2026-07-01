"use client"

import { useEffect, useState } from "react"
import { getQueue, removeFromQueue, updateRetries, isOnline } from "@/utils/offlineQueue"
import { sendMailNow } from "@/utils/gun"

export default function OfflineQueueProcessor() {
  const [processing, setProcessing] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [justSent, setJustSent] = useState(0)
  const [online, setOnline] = useState(true)

  const processQueue = async () => {
    const queue = getQueue()
    if (queue.length === 0) return
    const online = await isOnline()
    if (!online) return

    setProcessing(true)
    let sent = 0

    for (const entry of queue) {
      if (entry.retries >= 5) {
        removeFromQueue(entry.id)
        continue
      }
      try {
        await sendMailNow(entry.mail)
        removeFromQueue(entry.id)
        sent++
      } catch {
        updateRetries(entry.id)
      }
    }

    setProcessing(false)
    setQueueCount(getQueue().length)

    if (sent > 0) {
      setJustSent(sent)
      setTimeout(() => setJustSent(0), 4000)
    }
  }

  useEffect(() => {
    setQueueCount(getQueue().length)

    const handleOnline = () => {
      setOnline(true)
      setTimeout(processQueue, 1000)
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    const interval = setInterval(async () => {
      const queue = getQueue()
      setQueueCount(queue.length)
      if (queue.length > 0) await processQueue()
    }, 30000)

    processQueue()

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      clearInterval(interval)
    }
  }, [])

  if (queueCount === 0 && !processing && justSent === 0 && online) return null

  return (
    <div style={{
      position: "fixed", bottom: "20px", right: "20px",
      zIndex: 9999, display: "flex", flexDirection: "column",
      gap: "8px", alignItems: "flex-end",
    }}>
      {!online && (
        <div style={{
          background: "rgba(20,20,20,0.97)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,90,90,0.5)", borderRadius: "12px",
          padding: "12px 18px", display: "flex", alignItems: "center",
          gap: "10px", boxShadow: "var(--shadow-deep)",
        }}>
          <span style={{ fontSize: "16px" }}>📴</span>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#ff5a5a", fontFamily: "Raleway, sans-serif" }}>
              You are offline
            </div>
            <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>
              Mails will send when connection returns
            </div>
          </div>
        </div>
      )}

      {queueCount > 0 && (
        <div style={{
          background: "rgba(20,20,20,0.97)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(212, 175, 55,0.5)", borderRadius: "12px",
          padding: "12px 18px", display: "flex", alignItems: "center",
          gap: "10px", boxShadow: "var(--shadow-deep)",
        }}>
          {processing ? (
            <>
              <span style={{
                display: "inline-block", width: "14px", height: "14px",
                border: "2px solid rgba(212, 175, 55,0.3)",
                borderTop: "2px solid var(--gold-mid)",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--gold-mid)", fontFamily: "Raleway, sans-serif" }}>
                  Sending queued mails...
                </div>
                <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>
                  {queueCount} remaining
                </div>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: "16px" }}>⏳</span>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--gold-mid)", fontFamily: "Raleway, sans-serif" }}>
                  {queueCount} mail{queueCount > 1 ? "s" : ""} queued
                </div>
                <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>
                  Waiting for connection
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {justSent > 0 && (
        <div style={{
          background: "rgba(20,20,20,0.97)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(76,175,110,0.5)", borderRadius: "12px",
          padding: "12px 18px", display: "flex", alignItems: "center",
          gap: "10px", boxShadow: "var(--shadow-deep)",
        }}>
          <span style={{ fontSize: "16px" }}>✅</span>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#4caf6e", fontFamily: "Raleway, sans-serif" }}>
              {justSent} queued mail{justSent > 1 ? "s" : ""} sent!
            </div>
            <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>
              Successfully delivered
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
