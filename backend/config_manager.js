import fs from "fs"
import path from "path"
import CryptoJS from "crypto-js"

const CONFIG_PATH = path.join(process.cwd(), "gateway_config.json")
// Fallback to static encryption key if CONFIG_ENCRYPTION_KEY is not defined in process.env
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || "dmail-secure-gateway-default-key-321"

/**
 * Reads, decrypts, and parses the gateway configuration from disk.
 * Returns an empty object if no configuration exists or decryption fails.
 */
export const getGatewayConfig = () => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {}
    }
    const encryptedData = fs.readFileSync(CONFIG_PATH, "utf8")
    if (!encryptedData.trim()) return {}
    
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY)
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    if (!decrypted) return {}
    
    return JSON.parse(decrypted)
  } catch (err) {
    console.error("❌ Failed to read or decrypt gateway config:", err.message)
    return {}
  }
}

/**
 * Encrypts and writes the gateway configuration to disk.
 */
export const saveGatewayConfig = (config) => {
  try {
    const dataString = JSON.stringify(config)
    const encrypted = CryptoJS.AES.encrypt(dataString, ENCRYPTION_KEY).toString()
    fs.writeFileSync(CONFIG_PATH, encrypted, "utf8")
    return true
  } catch (err) {
    console.error("❌ Failed to save or encrypt gateway config:", err.message)
    return false
  }
}
