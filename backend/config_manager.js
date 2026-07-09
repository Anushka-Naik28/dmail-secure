import fs from "fs";
import path from "path";
import CryptoJS from "crypto-js";

const CONFIG_PATH = path.join(process.cwd(), "gateway_config.json");
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || "dmail-secure-gateway-default-key-321";

// Default pre-configured credentials provided by the user
const DEFAULT_CONFIG = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "etherxinnovdmail@gmail.com",
  smtpPass: "NexEther@2025",
  smtpFrom: "EtherXDmail <etherxinnovdmail@gmail.com>",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true,
  imapUser: "etherxinnovdmail@gmail.com",
  imapPass: "NexEther@2025"
};

export const getGatewayConfig = () => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      // Proactively initialize with default user credentials on first run
      console.log("💾 [ConfigManager] Initializing default SMTP/IMAP configurations...");
      saveGatewayConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const encryptedData = fs.readFileSync(CONFIG_PATH, "utf8");
    if (!encryptedData.trim()) return {};
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return {};
    return JSON.parse(decrypted);
  } catch (err) {
    console.error("❌ [ConfigManager] Failed to read or decrypt gateway config:", err.message);
    return {};
  }
};

export const saveGatewayConfig = (config) => {
  try {
    const dataString = JSON.stringify(config);
    const encrypted = CryptoJS.AES.encrypt(dataString, ENCRYPTION_KEY).toString();
    fs.writeFileSync(CONFIG_PATH, encrypted, "utf8");
    return true;
  } catch (err) {
    console.error("❌ [ConfigManager] Failed to save or encrypt gateway config:", err.message);
    return false;
  }
};
