"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Header from "@/components/Header"
import Sidebar from "@/components/Sidebar"

export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // Logic moved to background processes in mailStore.
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
