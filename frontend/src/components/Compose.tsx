"use client"

/**
 * Compose.tsx — Legacy wrapper
 * Delegates to ComposeWindow which uses PGP (OpenPGP.js) + IPFS (Kubo) + GunDB.
 * The old CryptoJS AES implementation has been removed — it was incompatible
 * with the global mail network and could not be read by any inbox.
 */
import ComposeWindow from "@/components/ComposeWindow"

interface ComposeProps {
  onClose: () => void
  defaultTo?: string
  defaultSubject?: string
  defaultMessage?: string
}

export default function Compose({ onClose, defaultTo, defaultSubject, defaultMessage }: ComposeProps) {
  return (
    <ComposeWindow
      onClose={onClose}
      defaultTo={defaultTo}
      defaultSubject={defaultSubject}
      defaultMessage={defaultMessage}
    />
  )
}
