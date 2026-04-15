"use client"

import { createContext, useContext, useState, ReactNode } from "react"

interface LabelContextType {
  activeLabelId: string | null
  setActiveLabelId: (id: string | null) => void
}

const LabelContext = createContext<LabelContextType>({
  activeLabelId: null,
  setActiveLabelId: () => {},
})

export const LabelProvider = ({ children }: { children: ReactNode }) => {
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null)
  return (
    <LabelContext.Provider value={{ activeLabelId, setActiveLabelId }}>
      {children}
    </LabelContext.Provider>
  )
}

export const useLabel = () => useContext(LabelContext)
