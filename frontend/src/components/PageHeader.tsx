"use client"

import { Search, X } from "lucide-react"

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
      <div className="inbox-header-row" style={{ margin: 0, padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="inbox-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
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
        </h2>
        
        {rightElement && <div>{rightElement}</div>}
      </div>
    </div>
  )
}
