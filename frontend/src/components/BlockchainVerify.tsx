"use client"

import { useEffect, useState } from "react"
import {
  isAnyWalletAvailable,
  isMetaMaskAvailable,
  connectWallet,
  getChainId,
  getChainName,
  signIdentityMessage,
  storeIdentityOnChain,
  loadIdentity,
  shortAddress,
  formatVerifiedAt,
  getEtherscanLink,
  type BlockchainIdentity,
  type VerificationStatus,
} from "@/utils/blockchain"
import { copyToClipboard } from "@/utils/clipboard"
import { 
  CheckCircle, Copy, ExternalLink, Trash2, 
  AlertCircle, Link as LinkIcon, ShieldCheck
} from "lucide-react"

export default function BlockchainVerify() {
  const [status, setStatus]         = useState<VerificationStatus>("unverified")
  const [identity, setIdentity]     = useState<BlockchainIdentity | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [chainId, setChainId]       = useState<number>(1)
  const [error, setError]           = useState<string | null>(null)
  const [step, setStep]             = useState<"idle"|"connecting"|"signing"|"storing"|"done">("idle")
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [walletAvailable, setWalletAvailable] = useState(false)

  const getUser = () => JSON.parse(localStorage.getItem("user") || "{}")

  useEffect(() => {
    setWalletAvailable(isAnyWalletAvailable())

    // Load existing identity
    const user = getUser()
    if (!user.email) return

    loadIdentity(user.email, (id) => {
      if (id) {
        setIdentity(id)
        setStatus("verified")
      }
    })

    // Listen for wallet account changes
    if ((window as any).ethereum) {
      (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length === 0) setWalletAddress(null)
        else setWalletAddress(accounts[0])
      })
      ;(window as any).ethereum.on("chainChanged", (chainHex: string) => {
        setChainId(parseInt(chainHex, 16))
      })
    }
  }, [])

  const handleVerify = async () => {
    const user = getUser()
    if (!user.email) return

    setError(null)
    setStep("connecting")
    setStatus("pending")

    try {
      // Step 1 — connect wallet
      const address = await connectWallet()
      if (!address) {
        setError("No wallet account found.")
        setStatus("failed")
        setStep("idle")
        return
      }
      setWalletAddress(address)

      const chain = await getChainId()
      setChainId(chain)

      // Step 2 — sign message
      setStep("signing")
      const { signature, message } = await signIdentityMessage(address, user.email)

      // Step 3 — store on GunDB
      setStep("storing")
      const newIdentity: BlockchainIdentity = {
        walletAddress: address,
        signature,
        message,
        verifiedAt: Date.now(),
        chainId:    chain,
      }

      await storeIdentityOnChain(user.email, newIdentity)

      // Save locally
      const updatedUser = { ...user, blockchainIdentity: newIdentity }
      localStorage.setItem("user", JSON.stringify(updatedUser))

      setIdentity(newIdentity)
      setStatus("verified")
      setStep("done")

    } catch (err: any) {
      const msg = err?.message || "Verification failed."
      setError(
        msg.includes("rejected") ? "You rejected the wallet signature request." :
        msg.includes("not found") ? "MetaMask not found. Please install it." :
        msg
      )
      setStatus("failed")
      setStep("idle")
    }
  }

  const handleRevoke = () => {
    const user = getUser()
    setIdentity(null)
    setStatus("unverified")
    setStep("idle")
    setWalletAddress(null)
    const updatedUser = { ...user, blockchainIdentity: null }
    localStorage.setItem("user", JSON.stringify(updatedUser))
    // Remove from GunDB
    import("@/utils/gun").then(({ gun }) => {
      gun.get("securemail_identities").get(user.email).put(null as any)
    })
  }

  const handleCopyAddress = () => {
    if (!identity?.walletAddress) return
    copyToClipboard(identity.walletAddress)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  // ── Verified state ────────────────────────────────────────
  if (status === "verified" && identity) {
    return (
      <div>
        {/* Verified banner */}
        <div style={{
          background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.25)",
          borderRadius: "12px", padding: "16px", marginBottom: "16px",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            width: "42px", height: "42px", borderRadius: "50%", flexShrink: 0,
            background: "rgba(76,175,110,0.12)", border: "1px solid rgba(76,175,110,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "20px", color: "#4caf6e"
          }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#4caf6e" }}>
              Blockchain Identity Verified
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Verified on {formatVerifiedAt(identity.verifiedAt)} · {getChainName(identity.chainId)}
            </div>
          </div>
        </div>

        {/* Wallet info */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {[
            { label: "Wallet Address", value: identity.walletAddress, mono: true },
            { label: "Network",        value: getChainName(identity.chainId), mono: false },
            { label: "Verified",       value: formatVerifiedAt(identity.verifiedAt), mono: false },
          ].map((row) => (
            <div key={row.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", background: "var(--bg-panel)",
              borderRadius: "8px", border: "1px solid var(--border-gold)",
            }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.label}</span>
              <span style={{
                fontSize: "12px", fontWeight: "600", color: "var(--text-bright)",
                fontFamily: row.mono ? "Courier New, monospace" : "inherit",
              }}>
                {row.mono ? shortAddress(row.value) : row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={handleCopyAddress}
            style={{
              padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
              background: copiedAddress ? "rgba(76,175,110,0.1)" : "rgba(212, 175, 55,0.08)",
              border: `1px solid ${copiedAddress ? "rgba(76,175,110,0.3)" : "rgba(212, 175, 55,0.3)"}`,
              color: copiedAddress ? "#4caf6e" : "var(--gold-mid)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {copiedAddress ? <CheckCircle size={14} /> : <Copy size={14} />}
              {copiedAddress ? "Copied!" : "Copy Address"}
            </span>
          </button>

          
            <a
            href={getEtherscanLink(identity.walletAddress, identity.chainId)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 14px", borderRadius: "8px",
              background: "none", border: "1px solid var(--border-gold)",
              color: "var(--text-muted)", fontSize: "12px",
              fontFamily: "Raleway, sans-serif", textDecoration: "none",
              display: "flex", alignItems: "center", gap: "6px"
            }}
          ><ExternalLink size={14} /> View on Explorer ↗</a>

          <button
            onClick={handleRevoke}
            style={{
              padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
              background: "rgba(217,48,37,0.06)",
              border: "1px solid rgba(217,48,37,0.2)",
              color: "#e84234", fontSize: "12px",
              fontFamily: "Raleway, sans-serif",
              marginLeft: "auto",
              display: "flex", alignItems: "center", gap: "6px"
            }}
          ><Trash2 size={14} /> Revoke</button>
        </div>
      </div>
        )
  }

  // ── Unverified / pending state ────────────────────────────
  return (
    <div>
      {/* No wallet warning */}
      {!walletAvailable && (
        <div style={{
          background: "rgba(212, 175, 55,0.06)", border: "1px solid rgba(212, 175, 55,0.2)",
          borderRadius: "10px", padding: "12px 16px", marginBottom: "16px",
          fontSize: "12px", color: "var(--gold-mid)", lineHeight: "1.6",
          display: "flex", alignItems: "center", gap: "8px"
        }}>
          <AlertCircle size={14} /> No Ethereum wallet detected. Install{" "}
          <a href="https://metamask.io" target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--gold-mid)", fontWeight: "700" }}>MetaMask</a>
          {" "}or another Web3 wallet to verify your identity.
        </div>
      )}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {[
          { n: 1, label: "Connect your Ethereum wallet",       done: step !== "idle" },
          { n: 2, label: "Sign a message (no gas required)",   done: step === "storing" || step === "done" },
          { n: 3, label: "Identity stored on GunDB network",   done: step === "done" },
        ].map((s) => (
          <div key={s.n} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", background: "var(--bg-panel)",
            borderRadius: "8px", border: `1px solid ${s.done ? "rgba(76,175,110,0.25)" : "var(--border-gold)"}`,
          }}>
            <div style={{
              width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: "800",
              background: s.done ? "rgba(76,175,110,0.15)" : "rgba(212, 175, 55,0.1)",
              color: s.done ? "#4caf6e" : "var(--gold-mid)",
              border: `1px solid ${s.done ? "rgba(76,175,110,0.3)" : "rgba(212, 175, 55,0.2)"}`,
            }}>
              {s.done ? "✓" : s.n}
            </div>
            <span style={{ fontSize: "12px", color: s.done ? "#4caf6e" : "var(--text-bright)" }}>
              {s.label}
            </span>
            {status === "pending" && (
              (s.n === 1 && step === "connecting") ||
              (s.n === 2 && step === "signing")    ||
              (s.n === 3 && step === "storing")
            ) && (
              <span style={{
                marginLeft: "auto", display: "inline-block",
                width: "12px", height: "12px",
                border: "2px solid rgba(212, 175, 55,0.2)",
                borderTop: "2px solid var(--gold-mid)",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
          border: "1px solid rgba(217,48,37,0.25)",
          display: "flex", alignItems: "center", gap: "8px"
        }}><AlertCircle size={14} /> {error}</div>
      )}

      {/* Current wallet */}
      {walletAddress && (
        <div style={{
          padding: "8px 14px", borderRadius: "8px", marginBottom: "14px",
          background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
          fontSize: "12px", color: "#4caf6e",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <img src="https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg" alt="MetaMask" style={{ width: "16px", height: "16px" }} />
          <span style={{ fontFamily: "Courier New, monospace" }}>{shortAddress(walletAddress)}</span>
          <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>
            · {getChainName(chainId)}
          </span>
        </div>
      )}

      {/* Verify button */}
      <button
        onClick={handleVerify}
        disabled={status === "pending" || !walletAvailable}
        style={{
          padding: "11px 24px", borderRadius: "10px", cursor: "pointer",
          background: walletAvailable
            ? "linear-gradient(135deg, var(--gold-rich), var(--gold-light))"
            : "rgba(212, 175, 55,0.1)",
          border: walletAvailable ? "none" : "1px solid rgba(212, 175, 55,0.2)",
          color: walletAvailable ? "var(--bg-body)" : "var(--text-muted)",
          fontSize: "13px", fontFamily: "Raleway, sans-serif", fontWeight: "700",
          boxShadow: walletAvailable ? "0 2px 12px rgba(212, 175, 55,0.3)" : "none",
          opacity: status === "pending" ? 0.7 : 1,
          display: "flex", alignItems: "center", gap: "8px",
        }}
      >
        {status === "pending" ? (
          <>
            <span style={{
              display: "inline-block", width: "12px", height: "12px",
              border: "2px solid rgba(0,0,0,0.2)", borderTop: "2px solid #000",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            {step === "connecting" ? "Connecting wallet..."  :
             step === "signing"    ? "Sign in MetaMask..."   :
             step === "storing"    ? "Storing identity..."   : "Verifying..."}
          </>
        ) : (
          <><LinkIcon size={16} /> Verify with Ethereum Wallet</>
        )}
      </button>
    </div>
  )
}
