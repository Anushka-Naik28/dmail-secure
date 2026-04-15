"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Header from "@/components/Header"
import Sidebar from "@/components/Sidebar"

export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const runSecurityCheck = () => {
      if (typeof window === "undefined") return;

      const allMails = JSON.parse(localStorage.getItem("mails") || "[]");
      const directory = JSON.parse(localStorage.getItem("directory") || "[]");
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      let hasChanges = false;

      // 1. Automatic Spam Filter Logic
      const processedMails = allMails.map((m: any) => {
        const isKnown = directory.some((d: any) => d.email === m.senderEmail);
        const isMe = m.senderEmail === user.email;

        // Unknown sender check
        if (m.receiverEmail === user.email && m.status === 'inbox' && !isKnown && !isMe) {
          hasChanges = true;
          return { ...m, status: 'spam', flaggedReason: 'Unknown Sender' };
        }
        
        // 2. Self-Destruct Logic
        if (m.expiryTime && Date.now() > m.expiryTime) {
          hasChanges = true;
          return null; 
        }

        return m;
      }).filter(Boolean);

      if (hasChanges) {
        localStorage.setItem("mails", JSON.stringify(processedMails));
        window.dispatchEvent(new Event('storage'));
      }
    };

    runSecurityCheck();
  }, [pathname]);

  return (
    <div className="dashboard">
      <Header onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} onCompose={() => {}} />
        <main className="mail-area">{children}</main>
      </div>
    </div>
  )
}