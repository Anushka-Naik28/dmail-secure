/**
 * src/utils/identity.ts
 * 
 * CORE IDENTITY ENGINE: 
 * Converts Email + Password into a Sovereign PGP Identity.
 */
import * as openpgp from 'openpgp';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { derivePGPPassphrase } from './gun';

// 🛡️ Helper: Convert Hex string to Uint8Array
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const ITERATIONS = 150000; // High iterations to protect against GPU brute-forcing

/**
 * Derives a deterministic 64-byte seed from user credentials.
 */
export async function deriveSeed(email: string, password: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  
  // Try native Web Crypto API first (nearly instantaneous)
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    try {
      const passwordBuffer = new TextEncoder().encode(password);
      const saltBuffer = new TextEncoder().encode(cleanEmail);

      const baseKey = await window.crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: ITERATIONS,
          hash: "SHA-512"
        },
        baseKey,
        512 // 512 bits = 64 bytes
      );

      // Convert ArrayBuffer to Hex string
      const hashArray = Array.from(new Uint8Array(derivedBits));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn("⚠️ Native Web Crypto PBKDF2 failed, falling back to CryptoJS:", e);
    }
  }

  // Fallback to CryptoJS
  const salt = CryptoJS.enc.Utf8.parse(cleanEmail);
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: 512 / 32,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA512
  });

  return derived.toString();
}

/**
 * Generates a human-readable 12-word mnemonic from the derived seed.
 * (Simplified implementation for the project presentation)
 */
export function generateMnemonic(seedHex: string): string {
  // In a production app, we would use a BIP39 wordlist.
  // For the Viva, we'll demonstrate the concept by selecting words from a stable list.
  const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray", "yankee", "zulu"];
  
  let mnemonic = [];
  for (let i = 0; i < 12; i++) {
    const chunk = seedHex.substring(i * 4, (i * 4) + 4);
    const index = parseInt(chunk, 16) % words.length;
    mnemonic.push(words[index]);
  }
  return mnemonic.join(" ");
}

/**
 * REVOLUTIONARY: Generates the EXACT same PGP key on any device.
 * By combining a high-entropy seed with a fixed creation date and AEAD settings,
 * we ensure that the same credentials always produce the same PGP fingerprint.
 */
export async function generateSovereignIdentity(email: string, password: string) {
  const seedHex = await deriveSeed(email, password);
  const cleanEmail = email.trim().toLowerCase();
  
  // 🛡️ [Fingerprint Parity]
  // In PGP, the fingerprint is a hash of the public key packets, which includes the creation time.
  // By fixing the date, the fingerprint remains identical across all devices and browser sessions.
  const fixedDate = new Date(1704067200000); // 2024-01-01 00:00:00 UTC

  // 🛡️ [Insecure Context Fallback]
  const openpgpAny = openpgp as any;
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    if (openpgpAny.config) {
      openpgpAny.config.use_native = false;
      openpgpAny.config.use_native_hw = false;
      openpgpAny.config.use_web_worker = false;
    }
  }

  // 🛡️ [AEAD Alignment]
  // Force Authenticated Encryption with Associated Data (AEAD) to ensure parity across all browser versions.
  if (openpgpAny.config) {
    openpgpAny.config.aead_protect = true;
  }

  // 🛡️ [Truly Deterministic RNG]
  // OpenPGP.js uses WebCrypto's getRandomValues. To ensure identical keys on all devices,
  // we temporarily override the RNG with one seeded by our high-entropy seed.
  const oldGetRandomValues = typeof window !== 'undefined' ? window.crypto.getRandomValues.bind(window.crypto) : null;
  
  if (typeof window !== 'undefined') {
    let offset = 0;
    const entropy = hexToBytes(seedHex);
    
    window.crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (!array) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < view.length; i++) {
        // Simple but effective: Use XOR with seed chunks to generate deterministic entropy
        view[i] = entropy[(offset + i) % entropy.length] ^ ((offset + i) & 0xFF);
      }
      offset += view.length;
      return array;
    };
  }

  let keys;
  try {
    keys = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519', 
      userIDs: [{ name: cleanEmail.split('@')[0], email: cleanEmail }],
      passphrase: derivePGPPassphrase(password),
      date: fixedDate,
      format: 'armored'
    });
  } catch (e) {
    console.error("❌ [Identity] Key generation failed:", e);
    throw e;
  } finally {
    // 🛡️ Restore original RNG immediately
    if (typeof window !== 'undefined' && oldGetRandomValues) {
      window.crypto.getRandomValues = oldGetRandomValues;
    }
  }

  const { privateKey, publicKey } = keys;

  // 🛡️ [Vault Encryption]
  const encryptedVault = CryptoJS.AES.encrypt(privateKey, password).toString();

  // ⚡ [Fast Identity]
  let fastPublicKey = ""
  let fastPrivateKey = ""
  try {
    const { deriveFastIdentity, exportKey } = await import("./crypto")
    const fastKeys = await deriveFastIdentity(seedHex)
    fastPublicKey = await exportKey(fastKeys.publicKey)
    fastPrivateKey = await exportKey(fastKeys.privateKey)
  } catch (e) {
    console.warn("⚠️ [Identity] Fast Identity derivation failed:", e)
  }

  // 🔗 [Web3 Identity]
  const wallet = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(seedHex)));

  // 🎯 [Stable Identifier]
  // This DID is mathematically bound to the password and email, NOT the PGP fingerprint.
  // This ensures the user's "Inbox Path" remains constant even if they rotate PGP keys.
  const stableDID = `did:dmail:${CryptoJS.SHA256(seedHex).toString().slice(0, 32)}`;

  return {
    name: cleanEmail.split('@')[0],
    publicKey,
    privateKey: encryptedVault,
    fastPublicKey,
    fastPrivateKey,
    mnemonic: generateMnemonic(seedHex),
    ethAddress: wallet.address,
    did: stableDID
  };
}
