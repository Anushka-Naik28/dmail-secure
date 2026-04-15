/**
 * Finds a nonce such that SHA-256(challenge + nonce) starts with `difficulty` zeros.
 * Runs in the browser using Web Crypto API — no server needed.
 */
export const computePoW = async (
  challenge: string,
  difficulty: number = 3,
  onProgress?: (nonce: number) => void
): Promise<{ nonce: number; hash: string }> => {
  const prefix = "0".repeat(difficulty)
  let nonce = 0

  while (true) {
    const input = `${challenge}:${nonce}`
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input)
    )
    const hashArray = Array.from(new Uint8Array(buffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

    if (hashHex.startsWith(prefix)) {
      return { nonce, hash: hashHex }
    }

    nonce++
    if (nonce % 500 === 0 && onProgress) onProgress(nonce)

    // Yield to UI every 1000 iterations to avoid freezing
    if (nonce % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    
    // Safety break
    if (nonce > 1000000) throw new Error("PoW computation took too long")
  }
}

/**
 * Verifies that a given nonce solves the PoW challenge for a specific difficulty.
 */
export const verifyPoW = async (
  challenge: string,
  nonce: number,
  difficulty: number = 3
): Promise<boolean> => {
  const prefix = "0".repeat(difficulty)
  const input = `${challenge}:${nonce}`
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  const hashArray = Array.from(new Uint8Array(buffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return hashHex.startsWith(prefix)
}

/**
 * Creates a unique challenge string for a message.
 */
export const createChallenge = async (
  sender: string,
  content: string,
  timestamp: string
): Promise<string> => {
  const data = `${sender}:${content.slice(0, 50)}:${timestamp}`
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  )
  const hashArray = Array.from(new Uint8Array(buffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
