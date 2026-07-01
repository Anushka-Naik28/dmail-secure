"use client"

import { Search, X, RefreshCw } from "lucide-react"
import { useState } from "react"
import { initMailStore } from "@/utils/mailStore"

interface PageHeaderProps {
  title: string
  count?: number
  searchQuery: string
  onSearchChange: (value: string) => void
  placeholder?: string
  rightElement?: React.ReactNode
  showSearch?: boolean
}

export default function PageHeader({
  title,
  count,
  searchQuery,
  onSearchChange,
  placeholder = "Search...",
  rightElement,
  showSearch = true
}: PageHeaderProps) {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = () => {
    setIsSyncing(true)
    const userJson = typeof window !== "undefined" ? localStorage.getItem("user") : null
    const user = JSON.parse(userJson || "{}")
    if (user.email) {
      initMailStore(user.email, true)
    }
    setTimeout(() => setIsSyncing(false), 2000)
  }

  return (
    <div style={{ padding: "16px 20px 0 20px", flexShrink: 0 }}>
      {/* Search Bar Row (Standardized Placement) */}
      {showSearch && (
        <div className="folder-search-container" style={{ marginBottom: "16px", maxWidth: "450px" }}>
          <Search size={16} className="folder-search-icon" />
          <input
            type="text"
            className="folder-search-input"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: "0 8px",
                display: "flex",
                alignItems: "center"
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Header Row (Title + Count + Extra Actions) */}
      <div className="inbox-header-row" style={{ margin: 0, padding: "8px 0 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-bright)", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {title}
            {count !== undefined && count > 0 && (
              <span style={{
                background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                color: "#fff",
                fontSize: "11px",
                fontWeight: "700",
                padding: "2px 8px",
                borderRadius: "10px",
              }}>
                {count}
              </span>
            )}
            <button 
              onClick={handleSync}
              className="toolbar-btn"
              title="Sync Global Network"
              style={{ 
                background: "none", border: "none", padding: "4px", 
                marginLeft: "4px", color: "var(--gold-mid)",
                animation: isSyncing ? "spin 1s linear infinite" : "none"
              }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </h2>
        
        {rightElement && <div>{rightElement}</div>}
      </div>
    </div>
  )
}
