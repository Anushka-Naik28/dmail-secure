import { gun } from "@/utils/gun"

// ── Types ─────────────────────────────────────────────────────
export interface BlockchainIdentity {
  walletAddress: string
  signature:     string
  message:       string
  verifiedAt:    number
  chainId:       number
  txHash?:       string
}

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "failed"

// ── MetaMask detection ────────────────────────────────────────
export const isMetaMaskAvailable = (): boolean => {
  if (typeof window === "undefined") return false
  return !!(window as any).ethereum?.isMetaMask
}

export const isCoinbaseWalletAvailable = (): boolean => {
  if (typeof window === "undefined") return false
  return !!(window as any).ethereum?.isCoinbaseWallet
}

export const isAnyWalletAvailable = (): boolean => {
  if (typeof window === "undefined") return false
  return !!(window as any).ethereum
}

// ── Get connected accounts ────────────────────────────────────
export const getConnectedAccounts = async (): Promise<string[]> => {
  if (!isAnyWalletAvailable()) return []
  try {
    return await (window as any).ethereum.request({ method: "eth_accounts" })
  } catch {
    return []
  }
}

// ── Connect wallet ────────────────────────────────────────────
export const connectWallet = async (): Promise<string | null> => {
  if (!isAnyWalletAvailable()) return null
  try {
    const accounts = await (window as any).ethereum.request({
      method: "eth_requestAccounts",
    })
    return accounts[0] || null
  } catch (err: any) {
    if (err.code === 4001) throw new Error("User rejected wallet connection.")
    throw err
  }
}

// ── Get current chain ─────────────────────────────────────────
export const getChainId = async (): Promise<number> => {
  if (!isAnyWalletAvailable()) return 0
  const chainHex = await (window as any).ethereum.request({ method: "eth_chainId" })
  return parseInt(chainHex, 16)
}

export const getChainName = (chainId: number): string => {
  const chains: Record<number, string> = {
    1:     "Ethereum Mainnet",
    5:     "Goerli Testnet",
    11155111: "Sepolia Testnet",
    137:   "Polygon Mainnet",
    80001: "Mumbai Testnet",
    56:    "BNB Smart Chain",
    43114: "Avalanche",
  }
  return chains[chainId] || `Chain ${chainId}`
}

// ── Sign message to prove wallet ownership ────────────────────
export const signIdentityMessage = async (
  walletAddress: string,
  userEmail:     string
): Promise<{ signature: string; message: string }> => {
  const timestamp = Date.now()
  const message   = [
    "SecureMail Identity Verification",
    "DMail Identity Verification",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Email:   ${userEmail}`,
    `Wallet:  ${walletAddress}`,
    `Time:    ${new Date(timestamp).toISOString()}`,
    `Nonce:   ${timestamp}`,
    "",
    "By signing this message you link your",
    "Ethereum wallet to your DMail identity.",
    "This does NOT cost gas or send a transaction.",
  ].join("\n")

  const signature = await (window as any).ethereum.request({
    method:  "personal_sign",
    params:  [message, walletAddress],
  })

  return { signature, message }
}

// ── Store verified identity on GunDB ─────────────────────────
export const storeIdentityOnChain = async (
  userEmail:  string,
  identity:   BlockchainIdentity
): Promise<void> => {
  gun.get("securemail_identities").get(userEmail).put({
    walletAddress: identity.walletAddress,
    signature:     identity.signature,
    verifiedAt:    identity.verifiedAt,
    chainId:       identity.chainId,
    chainName:     getChainName(identity.chainId),
  })
  console.log("✅ Identity stored on GunDB:", identity.walletAddress)
}

// ── Load verified identity from GunDB ────────────────────────
export const loadIdentity = (
  userEmail: string,
  cb: (identity: BlockchainIdentity | null) => void
): void => {
  gun.get("securemail_identities").get(userEmail).once((data: any) => {
    if (data?.walletAddress) {
      cb({
        walletAddress: data.walletAddress,
        signature:     data.signature,
        message:       data.message || "",
        verifiedAt:    data.verifiedAt,
        chainId:       data.chainId,
        txHash:        data.txHash,
      })
    } else {
      cb(null)
    }
  })
}

// ── Verify another user's identity ───────────────────────────
export const verifyUserIdentity = (
  userEmail: string
): Promise<BlockchainIdentity | null> => {
  return new Promise((resolve) => {
    gun.get("securemail_identities").get(userEmail).once((data: any) => {
      if (data?.walletAddress) {
        resolve({
          walletAddress: data.walletAddress,
          signature:     data.signature || "",
          message:       data.message   || "",
          verifiedAt:    data.verifiedAt,
          chainId:       data.chainId   || 1,
        })
      } else {
        resolve(null)
      }
    })
    setTimeout(() => resolve(null), 3000)
  })
}

// ── Shorten wallet address for display ───────────────────────
export const shortAddress = (address: string): string => {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// ── Format verification time ──────────────────────────────────
export const formatVerifiedAt = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year:  "numeric",
    month: "short",
    day:   "numeric",
  })
}

// ── Etherscan link ────────────────────────────────────────────
export const getEtherscanLink = (
  address: string,
  chainId: number
): string => {
  const explorers: Record<number, string> = {
    1:        "https://etherscan.io/address/",
    5:        "https://goerli.etherscan.io/address/",
    11155111: "https://sepolia.etherscan.io/address/",
    137:      "https://polygonscan.com/address/",
    80001:    "https://mumbai.polygonscan.com/address/",
    56:       "https://bscscan.com/address/",
  }
  const base = explorers[chainId] || "https://etherscan.io/address/"
  return `${base}${address}`
}
