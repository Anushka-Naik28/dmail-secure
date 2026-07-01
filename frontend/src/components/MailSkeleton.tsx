"use client"

export default function MailSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div 
          key={i}
          style={{
            display: "flex", alignItems: "center", padding: "16px 20px",
            borderBottom: "1px solid #141414", gap: "16px"
          }}
        >
          <div style={{ width: "18px", height: "18px", borderRadius: "4px", background: "var(--bg-input)" }} />
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--bg-input)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: "14px", width: "120px", background: "var(--bg-input)", borderRadius: "4px", marginBottom: "8px" }} />
            <div style={{ height: "12px", width: "200px", background: "var(--bg-input)", borderRadius: "4px", marginBottom: "6px" }} />
            <div style={{ height: "10px", width: "80%", background: "var(--bg-input)", borderRadius: "4px" }} />
          </div>
          <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--bg-input)" }} />
        </div>
      ))}
    </div>
  )
}
