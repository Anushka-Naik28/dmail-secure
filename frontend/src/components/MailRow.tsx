"use client"
import { memo } from "react"
import { Lock, Star, Check } from "lucide-react"
import { cleanMessage } from "@/utils/gun"

interface MailRowProps {
  mail: any
  isSelected: boolean
  onOpen: (mail: any) => void
  onToggleSelection: (id: string, e: React.MouseEvent) => void
  isSelectedInBulk: boolean
  onToggleStar: (id: string, e: React.MouseEvent) => void
  layout?: string
  preview?: string
  showToRecipient?: boolean
  activeLabels?: any[]
  badge?: { label: string, color: string }
}

const getAvatarColor = (email: string = "default") => {
  const colors = [
    { bg: "#C5A059", text: "#000000" }, // DMail Gold
    { bg: "#3B82F6", text: "#FFFFFF" }, // Royal Blue
    { bg: "#10B981", text: "#FFFFFF" }, // Emerald Green
    { bg: "#EF4444", text: "#FFFFFF" }, // Soft Red
    { bg: "#8B5CF6", text: "#FFFFFF" }, // Vivid Purple
    { bg: "#F59E0B", text: "#000000" }, // Amber
    { bg: "#EC4899", text: "#FFFFFF" }, // Pink
    { bg: "#06B6D4", text: "#FFFFFF" }, // Cyan
    { bg: "#F97316", text: "#FFFFFF" }, // Orange
    { bg: "#6366F1", text: "#FFFFFF" }, // Indigo
    { bg: "#14B8A6", text: "#FFFFFF" }, // Teal
    { bg: "#A855F7", text: "#FFFFFF" }, // Purple
  ]
  
  // Robust hash for better distribution
  let hash = 0
  const str = email.toLowerCase()
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0 // Convert to 32bit integer
  }
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

const MailRow = memo(({ 
  mail, 
  isSelected, 
  onOpen, 
  onToggleSelection, 
  isSelectedInBulk,
  onToggleStar,
  layout = "comfortable",
  preview = "2lines",
  showToRecipient = false,
  activeLabels = [],
  badge
}: MailRowProps) => {
  const isUnread = !mail.isRead
  const nameToDisplay = showToRecipient 
    ? (mail.receiverName || mail.receiverEmail?.split("@")[0] || "U")
    : (mail.senderName || mail.senderEmail?.split("@")[0] || "U")
    
  const senderInitial = nameToDisplay.charAt(0).toUpperCase()
  const isCompact = layout === "compact"
  const avatarColors = getAvatarColor(mail.senderEmail || mail.senderName || mail.id || "default")
  
  return (
    <div 
      onClick={() => onOpen(mail)}
      style={{
        display: "flex", alignItems: "center", 
        padding: isCompact ? "10px 20px" : "16px 20px",
        borderBottom: "1px solid #141414", cursor: "pointer",
        position: "relative", 
        background: isSelected || isSelectedInBulk ? "rgba(212, 175, 55, 0.08)" : "transparent",
        transition: "all 0.2s ease"
      }}
    >
      {/* Selected indicator bar */}
      {(isSelected || isSelectedInBulk) && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: "var(--gold-mid)", zIndex: 2 }} />
      )}
      
      {/* Unread Dot (on the left) */}
      <div style={{ width: "12px", display: "flex", justifyContent: "center", marginRight: "8px", flexShrink: 0 }}>
        {isUnread && (
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--gold-mid)", boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)" }} />
        )}
      </div>

      {/* Profile Avatar / Selection Trigger */}
      <div 
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelection(mail.id, e)
        }}
        style={{
          width: "40px", height: "40px", borderRadius: "50%", 
          background: isSelectedInBulk ? "var(--gold-mid)" : avatarColors.bg, 
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "15px", fontWeight: "800", 
          color: isSelectedInBulk ? "var(--bg-body)" : avatarColors.text, 
          marginRight: "16px", flexShrink: 0,
          cursor: "pointer", position: "relative",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          border: isSelectedInBulk ? "2px solid var(--gold-mid)" : "2px solid transparent",
          boxShadow: isSelectedInBulk ? "0 0 15px rgba(212, 175, 55, 0.3)" : "none"
        }}
      >
        {isSelectedInBulk ? (
          <Check size={20} strokeWidth={4} />
        ) : (
          senderInitial
        )}
        
        {/* Subtle hover indicator for selection */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.1)", opacity: 0,
          transition: "opacity 0.2s"
        }} className="avatar-hover" />
      </div>
      
      <style>{`
        div:hover > .avatar-hover { opacity: 1; }
      `}</style>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isCompact ? "0" : "4px" }}>
          <span style={{ 
            fontSize: isCompact ? "13px" : "15px", 
            fontWeight: isUnread ? "700" : "500", 
            color: isUnread ? "var(--text-bright)" : "var(--text-muted)",
            fontFamily: "Inter, sans-serif",
            display: "flex", alignItems: "center", gap: "8px"
          }}>
            {showToRecipient && "To: "}{nameToDisplay}
            {badge && (
              <span style={{
                fontSize: "9px", padding: "1px 6px", borderRadius: "6px",
                background: "rgba(255,255,255,0.05)", border: `1px solid ${badge.color}40`,
                color: badge.color, fontWeight: "800", textTransform: "uppercase"
              }}>
                {badge.label}
              </span>
            )}
            {mail.message?.includes("-----BEGIN PGP MESSAGE-----") && <Lock size={12} color="var(--gold-mid)" />}
          </span>
          <span style={{ fontSize: "12px", color: isUnread ? "var(--text-dim)" : "var(--text-dim)", opacity: 0.8 }}>
            {mail.time && !isNaN(Date.parse(mail.time))
              ? new Date(mail.time).toLocaleDateString() === new Date().toLocaleDateString()
                ? new Date(mail.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : new Date(mail.time).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : mail.time}
          </span>
        </div>
        <div style={{ 
          display: "flex", alignItems: "center", gap: "8px",
          marginTop: isCompact ? "0" : "2px",
          overflow: "hidden"
        }}>
          {activeLabels.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, maxWidth: "40%", overflow: "hidden" }}>
              {activeLabels.map(lbl => (
                <span key={lbl.id} style={{
                  fontSize: "9px", padding: "1px 6px", borderRadius: "4px",
                  background: `${lbl.color}22`, color: lbl.color,
                  border: `1px solid ${lbl.color}44`, flexShrink: 0,
                  display: "flex", alignItems: "center", gap: "2px",
                  fontWeight: "700", textTransform: "uppercase",
                  whiteSpace: "nowrap"
                }}>
                  {lbl.name}
                </span>
              ))}
            </div>
          )}
          <span style={{ 
            fontSize: "13px", 
            fontWeight: isUnread ? "600" : "400", 
            color: isUnread ? "var(--text-bright)" : "var(--text-dim)", 
            textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", 
            flex: 1
          }}>
            {mail.subject || "(No subject)"}
          </span>
        </div>
        
        {preview !== "none" && (
          <div style={{ 
            fontSize: "12px", color: "var(--text-dim)", marginTop: "4px", 
            overflow: "hidden", display: "-webkit-box", 
            WebkitLineClamp: preview === "2lines" ? 2 : 1, 
            WebkitBoxOrient: "vertical",
            lineHeight: "1.5", opacity: 0.7
          }}>
            {cleanMessage(mail.message || "")}
          </div>
        )}
      </div>

      <button 
        onClick={(e) => onToggleStar(mail.id, e)}
        style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "12px", padding: "4px", color: "var(--gold-mid)", transition: "transform 0.2s" }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.2)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        <Star size={16} fill={mail.isStarred ? "var(--gold-mid)" : "none"} strokeWidth={mail.isStarred ? 0 : 2} />
      </button>
    </div>
  )
})

MailRow.displayName = "MailRow"
export default MailRow
