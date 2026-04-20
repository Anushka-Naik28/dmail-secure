"use client"

import { useEffect, useState } from "react"
import { checkPinStatus, exportMailFromIPFS, getLocalNode } from "@/utils/ipfs"
import { getMails, subscribe } from "@/utils/mailStore"
import { copyToClipboard } from "@/utils/clipboard"
import PageHeader from "@/components/PageHeader"

type Tab = "overview" | "cids" | "backup"

interface NodeStats {
  status:      "online" | "offline" | "checking"
  version:     string
  repoSize:    string
  numObjects:  number
  peerId:      string
  peers:       number
}

interface BackupStatus {
  state:   "idle" | "backing-up" | "success" | "error"
  cid:     string
  msg:     string
}

export default function IPFSExplorerPage() {
  const [activeTab, setActiveTab]       = useState<Tab>("overview")
  const [mails, setMails]               = useState<any[]>([])
  const [searchCid, setSearchCid]       = useState("")
  const [copiedCid, setCopiedCid]       = useState<string | null>(null)
  const [pinStatuses, setPinStatuses]   = useState<Record<string, "pinned" | "not-pinned" | "offline" | "checking">>({})
  const [exportingId, setExportingId]   = useState<string | null>(null)
  const [nodeStats, setNodeStats]       = useState<NodeStats>({
    status: "checking", version: "—", repoSize: "—",
    numObjects: 0, peerId: "—", peers: 0,
  })
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ state: "idle", cid: "", msg: "" })
  const [restoreCid, setRestoreCid]     = useState("")
  const [pinningAll, setPinningAll]     = useState(false)
  const [pinnedAllMsg, setPinnedAllMsg] = useState("")

  // ── Load mails from store ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return

    const getIPFSMails = () =>
      getMails("all").filter((m: any) => m.cid &&
        (m.cid.startsWith("Qm") || m.cid.startsWith("bafy"))
      )

    setMails(getIPFSMails())
    const unsub = subscribe(() => setMails(getIPFSMails()))
    return () => { unsub() }
  }, [])

  // ── Fetch IPFS node stats ──────────────────────────────────────
  useEffect(() => {
    fetchNodeStats()
  }, [])

  const fetchNodeStats = async () => {
    setNodeStats((prev) => ({ ...prev, status: "checking" }))
    try {
      // Repo stats
      const repoRes = await fetch(`${getLocalNode(5001)}/api/v0/repo/stat`, {
        method: "POST", signal: AbortSignal.timeout(4000),
      })
      const repoData = await repoRes.json()

      // Node ID
      const idRes = await fetch(`${getLocalNode(5001)}/api/v0/id`, {
        method: "POST", signal: AbortSignal.timeout(4000),
      })
      const idData = await idRes.json()

      // Peer count
      const peersRes = await fetch(`${getLocalNode(5001)}/api/v0/swarm/peers`, {
        method: "POST", signal: AbortSignal.timeout(4000),
      })
      const peersData = await peersRes.json()

      const bytes     = repoData.RepoSize || 0
      const formatted = bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(2)} MB`

      setNodeStats({
        status:     "online",
        version:    idData.AgentVersion?.split("/")[1] || idData.AgentVersion || "—",
        repoSize:   formatted,
        numObjects: repoData.NumObjects || 0,
        peerId:     idData.ID || "—",
        peers:      peersData.Peers?.length || 0,
      })
    } catch {
      setNodeStats({ status: "offline", version: "—", repoSize: "—", numObjects: 0, peerId: "—", peers: 0 })
    }
  }

  // ── Pin actions ────────────────────────────────────────────────
  const handleCheckPin = async (mail: any) => {
    setPinStatuses((prev) => ({ ...prev, [mail.id]: "checking" }))
    const status = await checkPinStatus(mail.cid)
    setPinStatuses((prev) => ({ ...prev, [mail.id]: status }))
  }

  const handlePinAll = async () => {
    setPinningAll(true)
    setPinnedAllMsg("")
    let pinned = 0
    for (const mail of mails) {
      try {
        await fetch(`${getLocalNode(9094)}/pins/${mail.cid}`, { method: "POST" })
        pinned++
      } catch { /* skip */ }
    }
    setPinningAll(false)
    setPinnedAllMsg(`✅ Pinned ${pinned} of ${mails.length} files on your IPFS Cluster`)
    setTimeout(() => setPinnedAllMsg(""), 5000)
  }

  const handleExport = async (mail: any) => {
    setExportingId(mail.id)
    try {
      await exportMailFromIPFS(mail.cid, mail.subject)
    } catch {
      alert("Export failed — IPFS daemon may be offline.")
    } finally {
      setExportingId(null)
    }
  }

  const handleDownload = (cid: string, filename: string) => {
    // Standardize to public gateway for reliable browser download
    const url = `https://ipfs.io/ipfs/${cid}`
    window.open(url, "_blank")
  }

  const copyCid = (cid: string) => {
    copyToClipboard(cid)
    setCopiedCid(cid)
    setTimeout(() => setCopiedCid(null), 2000)
  }

  // ── Backup mailbox ─────────────────────────────────────────────
  const handleBackup = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    setBackupStatus({ state: "backing-up", cid: "", msg: "Collecting mails..." })

    try {
      const backupData = {
        version:   1,
        email:     user.email,
        createdAt: new Date().toISOString(),
        mailCount: mails.length,
        mails:     mails.map((m) => ({
          id: m.id, cid: m.cid, subject: m.subject,
          senderEmail: m.senderEmail, receiverEmail: m.receiverEmail,
          time: m.time, status: m.status, isStarred: m.isStarred,
        })),
      }

      setBackupStatus({ state: "backing-up", cid: "", msg: "Uploading to IPFS..." })

      const formData = new FormData()
      formData.append("file", new Blob([JSON.stringify(backupData)], { type: "application/json" }))

      const res = await fetch(`${getLocalNode(5001)}/api/v0/add?pin=false`, {
        method: "POST", body: formData,
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      const cid = data.Hash

      // Pin via cluster
      await fetch(`${getLocalNode(9094)}/pins/${cid}`, { method: "POST" })

      // Save backup CID to localStorage
      const backups = JSON.parse(localStorage.getItem(`backups_${user.email}`) || "[]")
      backups.unshift({ cid, date: new Date().toLocaleString(), count: mails.length })
      localStorage.setItem(`backups_${user.email}`, JSON.stringify(backups.slice(0, 10)))

      setBackupStatus({
        state: "success", cid,
        msg: `Backup complete — ${mails.length} mail index entries stored`,
      })
    } catch (err) {
      setBackupStatus({ state: "error", cid: "", msg: "Backup failed — is your IPFS daemon running?" })
    }
  }

  const filteredMails = mails.filter((m) =>
    m.cid?.toLowerCase().includes(searchCid.toLowerCase()) ||
    m.subject?.toLowerCase().includes(searchCid.toLowerCase()) ||
    m.senderEmail?.toLowerCase().includes(searchCid.toLowerCase())
  )

  // ── Shared styles ──────────────────────────────────────────────
  const card = (extra?: any) => ({
    background: "var(--bg-card)", border: "1px solid var(--border-gold)",
    borderRadius: "14px", padding: "20px", ...extra,
  })

  const tabBtn = (t: Tab) => ({
    padding: "8px 18px", borderRadius: "20px", cursor: "pointer",
    fontFamily: "Raleway, sans-serif", fontSize: "12px", fontWeight: "700" as const,
    border: "1px solid",
    borderColor: activeTab === t ? "var(--gold-mid)" : "var(--border-gold)",
    background: activeTab === t
      ? "linear-gradient(135deg, var(--gold-rich), var(--gold-light))"
      : "none",
    color: activeTab === t ? "#000" : "var(--text-muted)",
    transition: "all 0.2s ease",
  })

  const statRow = (label: string, value: string, color?: string) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 14px", background: "var(--bg-panel)",
      borderRadius: "8px", border: "1px solid var(--border-gold)",
    }}>
      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "12px", fontWeight: "700", color: color || "var(--text-bright)" }}>{value}</span>
    </div>
  )

  const user = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "{}") : {}
  const backupHistory: any[] = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem(`backups_${user.email}`) || "[]") : []

  return (
    <>
      <PageHeader 
        title="IPFS Explorer"
        count={mails.length}
        searchQuery={activeTab === "cids" ? searchCid : ""}
        onSearchChange={setSearchCid}
        placeholder="Search CIDs..."
        showSearch={activeTab === "cids"}
        rightElement={
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "700",
            border: "1px solid",
            borderColor: nodeStats.status === "online"
              ? "rgba(76,175,110,0.4)"
              : nodeStats.status === "checking"
              ? "rgba(212,160,23,0.4)"
              : "rgba(217,48,37,0.4)",
            background: nodeStats.status === "online"
              ? "rgba(76,175,110,0.08)"
              : nodeStats.status === "checking"
              ? "rgba(212,160,23,0.08)"
              : "rgba(217,48,37,0.08)",
            color: nodeStats.status === "online" ? "#4caf6e"
              : nodeStats.status === "checking" ? "var(--gold-mid)"
              : "#e84234",
          }}>
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: nodeStats.status === "online" ? "#4caf6e"
                : nodeStats.status === "checking" ? "var(--gold-mid)"
                : "#e84234",
              animation: nodeStats.status === "checking" ? "pulse 1s infinite" : "none",
            }} />
            {nodeStats.status === "online" ? "Node Online"
              : nodeStats.status === "checking" ? "Checking..."
              : "Node Offline"}
          </div>
        }
      />

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <button style={tabBtn("overview")} onClick={() => setActiveTab("overview")}>🖥️ Overview</button>
        <button style={tabBtn("cids")}     onClick={() => setActiveTab("cids")}>🗂️ CID List</button>
        <button style={tabBtn("backup")}   onClick={() => setActiveTab("backup")}>☁️ Backup</button>
      </div>

      {/* ══ OVERVIEW TAB ══════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Node status card */}
          <div style={card()}>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: "16px",
            }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                  🖥️ IPFS Node Status
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Kubo daemon (Local Node)
                </div>
              </div>
              <button
                onClick={fetchNodeStats}
                style={{
                  padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                  background: "none", border: "1px solid var(--border-gold)",
                  color: "var(--text-bright)", fontSize: "11px",
                  fontFamily: "Raleway, sans-serif",
                }}
              >
                🔄 Refresh
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {statRow("Status",
                nodeStats.status === "online" ? "✅ Online"
                  : nodeStats.status === "checking" ? "⏳ Checking..."
                  : "❌ Offline",
                nodeStats.status === "online" ? "#4caf6e"
                  : nodeStats.status === "checking" ? "var(--gold-mid)"
                  : "#e84234"
              )}
              {statRow("Kubo Version",  nodeStats.version)}
              {statRow("Connected Peers", nodeStats.status === "online" ? `${nodeStats.peers} peers` : "—")}
              {statRow("Peer ID",
                nodeStats.peerId !== "—"
                  ? nodeStats.peerId.slice(0, 20) + "..."
                  : "—"
              )}
            </div>
          </div>

          {/* Storage stats card */}
          <div style={card()}>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "16px" }}>
              💾 Storage Used
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {statRow("Repo Size",      nodeStats.repoSize)}
              {statRow("Objects Stored", `${nodeStats.numObjects}`)}
              {statRow("Mails on IPFS",  `${mails.length} mails`)}
              {statRow("Pinned via Cluster", "Local Network Cluster")}
            </div>

            {/* Visual storage bar */}
            <div style={{ marginTop: "8px" }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px",
              }}>
                <span>Storage used</span>
                <span>{nodeStats.repoSize}</span>
              </div>
              <div style={{
                height: "6px", borderRadius: "3px",
                background: "rgba(212,160,23,0.1)",
                border: "1px solid var(--border-gold)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: "3px",
                  background: "linear-gradient(90deg, var(--gold-rich), var(--gold-light))",
                  width: nodeStats.status === "online" ? "30%" : "0%",
                  transition: "width 1s ease",
                }} />
              </div>
            </div>
          </div>

          {/* Pinned files summary */}
          <div style={card()}>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: "16px",
            }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                  📌 Pinned Files
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {mails.length} mail{mails.length !== 1 ? "s" : ""} stored on IPFS Cluster
                </div>
              </div>
              <button
                onClick={handlePinAll}
                disabled={pinningAll || mails.length === 0}
                style={{
                  padding: "7px 14px", borderRadius: "8px", cursor: "pointer",
                  background: "none", border: "1px solid rgba(76,175,110,0.4)",
                  color: "#4caf6e", fontSize: "11px",
                  fontFamily: "Raleway, sans-serif", fontWeight: "600",
                  opacity: pinningAll ? 0.6 : 1,
                }}
              >
                {pinningAll ? "⏳ Pinning..." : "📌 Pin All"}
              </button>
            </div>

            {pinnedAllMsg && (
              <div style={{
                background: "rgba(76,175,110,0.08)", border: "1px solid rgba(76,175,110,0.25)",
                borderRadius: "8px", padding: "8px 12px", marginBottom: "12px",
                fontSize: "12px", color: "#4caf6e",
              }}>{pinnedAllMsg}</div>
            )}

            {mails.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                No mails stored on IPFS yet. Send a mail to see it here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {mails.slice(0, 5).map((mail) => (
                  <div key={mail.id} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 12px", background: "var(--bg-panel)",
                    borderRadius: "8px", border: "1px solid var(--border-gold)",
                  }}>
                    <span style={{ fontSize: "13px" }}>📧</span>
                    <span style={{
                      flex: 1, fontSize: "12px", color: "var(--text-bright)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{mail.subject}</span>
                    <span style={{
                      fontFamily: "Courier New, monospace", fontSize: "10px",
                      color: "var(--gold-light)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: "140px",
                    }}>{mail.cid?.slice(0, 16)}...</span>
                  </div>
                ))}
                {mails.length > 5 && (
                  <button
                    onClick={() => setActiveTab("cids")}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--gold-mid)", fontSize: "12px",
                      fontFamily: "Raleway, sans-serif", padding: "4px 0", textAlign: "left",
                    }}
                  >
                    View all {mails.length} →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Encryption notice */}
          <div style={{
            background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
            borderRadius: "10px", padding: "12px 16px",
            fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.7",
          }}>
            🔒 All mails are <strong style={{ color: "var(--text-bright)" }}>PGP encrypted</strong> before
            upload. Content is retrievable by CID but{" "}
            <strong style={{ color: "var(--text-bright)" }}>unreadable</strong> without your private key.
          </div>
        </div>
      )}

      {/* ══ CID LIST TAB ══════════════════════════════════════════ */}
      {activeTab === "cids" && (
        <>
          {/* Search removed here as it's now in PageHeader */}

          {filteredMails.length === 0 ? (
            <p className="empty-state">
              {searchCid ? "No results found." : "No IPFS stored mails yet."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredMails.map((mail) => {
                const pinStatus  = pinStatuses[mail.id] || null
                const isExporting = exportingId === mail.id

                return (
                  <div key={mail.id} style={card()}>
                    {/* Header */}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: "10px",
                    }}>
                      <div>
                        <p style={{ color: "var(--text-bright)", fontWeight: "600", marginBottom: "2px" }}>
                          {mail.subject}
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                          From: {mail.senderEmail} · {mail.time?.replace(/:\d{2} /, " ")}
                        </p>
                      </div>
                      <span style={{
                        fontSize: "10px", padding: "3px 8px", borderRadius: "6px", fontWeight: "700",
                        background: "rgba(76,175,110,0.1)", color: "#4caf6e",
                        border: "1px solid rgba(76,175,110,0.2)",
                        whiteSpace: "nowrap", marginLeft: "12px",
                      }}>✅ On IPFS</span>
                    </div>

                    {/* CID */}
                    <div style={{
                      background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
                      borderRadius: "8px", padding: "8px 12px", marginBottom: "12px",
                      display: "flex", alignItems: "center", gap: "8px",
                    }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0 }}>CID:</span>
                      <span style={{
                        fontFamily: "Courier New, monospace", fontSize: "11px",
                        color: "var(--gold-light)", flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{mail.cid}</span>
                      <button onClick={() => copyCid(mail.cid)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--gold-mid)", fontSize: "13px", flexShrink: 0,
                      }}>
                        {copiedCid === mail.cid ? "✅" : "📋"}
                      </button>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                      <button onClick={() => handleCheckPin(mail)}
                        disabled={pinStatus === "checking"} style={{
                          background: "none", border: "1px solid rgba(76,175,110,0.4)",
                          borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
                          color: "#4caf6e", fontSize: "12px", fontFamily: "Raleway, sans-serif",
                          opacity: pinStatus === "checking" ? 0.6 : 1,
                        }}>
                        {pinStatus === "checking" ? "⏳ Checking..." : "📌 Check Pin"}
                      </button>

                      <button onClick={() => handleExport(mail)} disabled={isExporting} style={{
                        background: "none", border: "1px solid rgba(76,175,110,0.4)",
                        borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
                        color: "#4caf6e", fontSize: "12px", fontFamily: "Raleway, sans-serif",
                        opacity: isExporting ? 0.6 : 1,
                      }}>
                        {isExporting ? "⏳ Exporting..." : "⬇️ Export"}
                      </button>

                      <a href={`${getLocalNode(8080)}/ipfs/${mail.cid}`}
                        target="_blank" rel="noopener noreferrer" style={{
                          fontSize: "12px", padding: "6px 12px", borderRadius: "8px",
                          background: "none", color: "#4caf6e",
                          border: "1px solid rgba(76,175,110,0.4)", textDecoration: "none",
                          fontFamily: "Raleway, sans-serif",
                        }}>💻 Local ↗</a>

                      <a href={`https://ipfs.io/ipfs/${mail.cid}`}
                        target="_blank" rel="noopener noreferrer" style={{
                          fontSize: "12px", padding: "6px 12px", borderRadius: "8px",
                          background: "none", color: "#4caf6e",
                          border: "1px solid rgba(76,175,110,0.4)", textDecoration: "none",
                          fontFamily: "Raleway, sans-serif",
                        }}>🌍 IPFS.io ↗</a>

                      {pinStatus && pinStatus !== "checking" && (
                        <span style={{
                          fontSize: "12px", padding: "6px 12px", borderRadius: "8px",
                          background: pinStatus === "pinned"
                            ? "rgba(76,175,110,0.1)"
                            : pinStatus === "not-pinned"
                            ? "rgba(212,160,23,0.1)"
                            : "rgba(217,48,37,0.1)",
                          color: pinStatus === "pinned" ? "#4caf6e"
                            : pinStatus === "not-pinned" ? "var(--gold-mid)"
                            : "#e84234",
                          border: `1px solid ${pinStatus === "pinned"
                            ? "rgba(76,175,110,0.3)"
                            : pinStatus === "not-pinned"
                            ? "rgba(212,160,23,0.3)"
                            : "rgba(217,48,37,0.3)"}`,
                        }}>
                          {pinStatus === "pinned"     && "✅ Pinned"}
                          {pinStatus === "not-pinned" && "⚠️ Not pinned"}
                          {pinStatus === "offline"    && "❌ Offline"}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══ BACKUP TAB ════════════════════════════════════════════ */}
      {activeTab === "backup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Backup mailbox card */}
          <div style={card()}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                ☁️ Backup Mailbox to IPFS
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>
                Creates an encrypted JSON index of all your mails and uploads it to your IPFS node.
                Save the CID to restore your mailbox on any device.
              </div>
            </div>

            <div style={{
              display: "flex", flexDirection: "column", gap: "8px",
              marginBottom: "16px",
            }}>
              {[
                { label: "Mails to backup",  value: `${mails.length} mails` },
                { label: "Backup target",    value: "Local Kubo + IPFS Cluster" },
                { label: "Format",           value: "JSON index (CIDs only)" },
                { label: "Encryption",       value: "Content stays PGP-encrypted" },
              ].map((row) => (
                <div key={row.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "9px 14px", background: "var(--bg-panel)",
                  borderRadius: "8px", border: "1px solid var(--border-gold)",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-bright)" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Backup status */}
            {backupStatus.state !== "idle" && (
              <div style={{
                padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
                fontSize: "12px", lineHeight: "1.6",
                background: backupStatus.state === "success"
                  ? "rgba(76,175,110,0.08)"
                  : backupStatus.state === "error"
                  ? "rgba(217,48,37,0.08)"
                  : "rgba(212,160,23,0.08)",
                border: `1px solid ${backupStatus.state === "success"
                  ? "rgba(76,175,110,0.3)"
                  : backupStatus.state === "error"
                  ? "rgba(217,48,37,0.3)"
                  : "rgba(212,160,23,0.3)"}`,
                color: backupStatus.state === "success" ? "#4caf6e"
                  : backupStatus.state === "error" ? "#e84234"
                  : "var(--gold-mid)",
              }}>
                {backupStatus.state === "backing-up" && (
                  <span style={{
                    display: "inline-block", width: "11px", height: "11px",
                    border: "2px solid rgba(212,160,23,0.3)",
                    borderTop: "2px solid var(--gold-mid)",
                    borderRadius: "50%", animation: "spin 0.8s linear infinite",
                    marginRight: "8px", verticalAlign: "middle",
                  }} />
                )}
                {backupStatus.msg}

                {backupStatus.state === "success" && backupStatus.cid && (
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Backup CID — save this:
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
                      borderRadius: "6px", padding: "6px 10px",
                    }}>
                      <span style={{
                        fontFamily: "Courier New, monospace", fontSize: "10px",
                        color: "var(--gold-light)", flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{backupStatus.cid}</span>
                      <button onClick={() => copyCid(backupStatus.cid)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--gold-mid)", fontSize: "12px",
                      }}>
                        {copiedCid === backupStatus.cid ? "✅" : "📋"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleBackup}
              disabled={backupStatus.state === "backing-up" || mails.length === 0}
              style={{
                padding: "11px 24px", borderRadius: "10px", cursor: "pointer",
                background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                border: "none", color: "#000", fontSize: "13px",
                fontFamily: "Raleway, sans-serif", fontWeight: "700",
                boxShadow: "0 2px 12px rgba(212,160,23,0.3)",
                opacity: backupStatus.state === "backing-up" ? 0.7 : 1,
              }}
            >
              {backupStatus.state === "backing-up" ? "⏳ Backing up..." : "☁️ Backup Now"}
            </button>
          </div>

          {/* Backup history */}
          {backupHistory.length > 0 && (
            <div style={card()}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "14px" }}>
                🕓 Backup History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {backupHistory.map((b: any, i: number) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", background: "var(--bg-panel)",
                    borderRadius: "8px", border: "1px solid var(--border-gold)",
                  }}>
                    <span style={{ fontSize: "13px" }}>☁️</span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-bright)", fontWeight: "600" }}>
                        {b.count} mails · {b.date}
                      </div>
                      <div style={{
                        fontFamily: "Courier New, monospace", fontSize: "10px",
                        color: "var(--gold-light)", marginTop: "2px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{b.cid}</div>
                    </div>
                    <button onClick={() => copyCid(b.cid)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--gold-mid)", fontSize: "12px", flexShrink: 0,
                    }}>
                      {copiedCid === b.cid ? "✅" : "📋"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restore */}
          <div style={card()}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-bright)", marginBottom: "4px" }}>
                🔁 Restore from CID
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Paste a backup CID to restore your mail index from IPFS.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Qm... or bafy..."
                value={restoreCid}
                onChange={(e) => setRestoreCid(e.target.value)}
                style={{
                  flex: 1, padding: "10px 14px",
                  background: "var(--bg-panel)", border: "1px solid var(--border-gold)",
                  borderRadius: "8px", color: "var(--text-bright)",
                  fontFamily: "Courier New, monospace", fontSize: "12px", outline: "none",
                }}
              />
              <button
                onClick={async () => {
                  try {
                    const { fetchFromIPFS } = await import("@/utils/ipfs")
                    const data = await fetchFromIPFS(restoreCid.trim())
                    alert(`✅ Backup found: ${data.mailCount} mails from ${data.email} (${data.createdAt?.split("T")[0]})`)
                  } catch (e) {
                    alert("❌ Could not fetch backup from global or local IPFS — check the CID and your connection.")
                  }
                }}
                disabled={!restoreCid.trim()}
                style={{
                  padding: "10px 16px", borderRadius: "8px", cursor: "pointer",
                  background: "none", border: "1px solid rgba(76,175,110,0.4)",
                  color: "#4caf6e", fontSize: "12px",
                  fontFamily: "Raleway, sans-serif", fontWeight: "600",
                  opacity: restoreCid.trim() ? 1 : 0.5,
                }}
              >
                🔁 Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}