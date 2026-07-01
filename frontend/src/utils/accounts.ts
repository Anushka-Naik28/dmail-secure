export interface SavedAccount {
  email:           string
  name:            string
  password:        string
  publicKey:       string
  privateKey:      string
  fastPublicKey?:  string
  fastPrivateKey?: string
  addedAt:         number
  avatar?:         string 
  did?:            string
  isDeterministic?: boolean
}

const ACCOUNTS_KEY = "securemail_accounts"
const CURRENT_USER_KEY = "user"

export const getSavedAccounts = (): SavedAccount[] => {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]")
  } catch {
    return []
  }
}

export const saveAccount = (user: SavedAccount): void => {
  // 🛡️ [Security Layer] Only allow one account to be saved on this device.
  // Overwrites any previous accounts to ensure a clean, single-identity state.
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([user]))
}

export const removeAccount = (email: string): void => {
  const accounts = getSavedAccounts().filter((a) => a.email !== email)
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY)
  localStorage.removeItem(ACCOUNTS_KEY)
}

export const switchAccount = (account: SavedAccount): void => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account))
}

export const getCurrentAccount = (): SavedAccount | null => {
  if (typeof window === "undefined") return null
  try {
    const userStr = localStorage.getItem(CURRENT_USER_KEY)
    if (!userStr) return null
    const user = JSON.parse(userStr)
    return user.email ? user : null
  } catch {
    return null
  }
}

export const getAvatarColor = (email: string): string => {
  const colors = [
    "linear-gradient(135deg, #1a7a4a, #4caf6e)",
    "linear-gradient(135deg, #1a4a7a, #4e7abf)",
    "linear-gradient(135deg, #7a4a1a, #bf8c4e)",
    "linear-gradient(135deg, #4a1a7a, #8c4ebf)",
    "linear-gradient(135deg, #7a1a4a, #bf4e8c)",
    "linear-gradient(135deg, #1a7a7a, #4ebfbf)",
    "linear-gradient(135deg, #7a7a1a, #bfbf4e)",
  ]
  const charCode = email.length > 0 ? email.charCodeAt(0) : 0
  return colors[charCode % colors.length]
}
