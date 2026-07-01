/**
 * src/utils/cryptoHybrid.ts
 * 
 * HYBRID CRYPTOGRAPHY ENGINE:
 * Combines OpenPGP (Asymmetric) with Web Crypto API (Symmetric) for performance.
 * 
 * Flow:
 * 1. Generate a random AES-256-GCM key.
 * 2. Encrypt the payload using native SubtleCrypto (fast).
 * 3. Encrypt the AES key using OpenPGP with the recipient's public key.
 * 4. Return a combined package.
 */

import * as openpgp from 'openpgp';

const AES_ALGO = "AES-GCM";
const KEY_LEN = 256;

/**
 * Encrypts data using a hybrid approach.
 * @param data The data to encrypt (string or Uint8Array)
 * @param publicKeys Recipients' PGP public keys
 */
export async function hybridEncrypt(
  data: string | Uint8Array,
  publicKeys: string | string[]
) {
  const encoder = new TextEncoder();
  const binaryData = typeof data === 'string' ? encoder.encode(data) : data;

  // 1. Generate random symmetric key and IV
  const aesKey = await window.crypto.subtle.generateKey(
    { name: AES_ALGO, length: KEY_LEN },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 2. Encrypt payload with Web Crypto API (AES-GCM)
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    aesKey,
    binaryData as any
  );

  // 3. Export the raw AES key to encrypt it with PGP
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const aesKeyHex = Array.from(new Uint8Array(rawAesKey))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // 4. Encrypt the AES key + IV with PGP
  const keyPackage = JSON.stringify({
    k: aesKeyHex,
    i: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  });

  const armoredPublicKeys = Array.isArray(publicKeys) ? publicKeys : [publicKeys];
  const encryptionKeys = await Promise.all(
    armoredPublicKeys.map(k => openpgp.readKey({ armoredKey: k }))
  );

  const encryptedKeyPackage = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: keyPackage }),
    encryptionKeys
  });

  // 5. Return the hybrid package
  return {
    v: "1.0",
    key: encryptedKeyPackage, // PGP encrypted AES key
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) // Base64 ciphertext
  };
}

/**
 * Decrypts data using a hybrid approach.
 * @param packageData The hybrid package { v, key, data }
 * @param privateKey Recipient's PGP private key
 * @param passphrase PGP private key passphrase
 */
export async function hybridDecrypt(
  packageData: { v: string; key: string; data: string },
  privateKeyArmored: string,
  passphrase?: string
) {
  // 1. Decrypt the key package using PGP
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });

  const { data: decryptedKeyPackage } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: packageData.key as string }),
    decryptionKeys: privateKey
  });

  const { k: aesKeyHex, i: ivHex } = JSON.parse(decryptedKeyPackage as string);

  // 2. Reconstruct AES key and IV
  const aesKeyBytes = new Uint8Array(aesKeyHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    { name: AES_ALGO },
    false,
    ["decrypt"]
  );

  // 3. Decrypt payload using Web Crypto API
  const binaryCiphertext = new Uint8Array(
    atob(packageData.data).split("").map(c => c.charCodeAt(0))
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: AES_ALGO, iv },
    aesKey,
    binaryCiphertext
  );

  return new TextDecoder().decode(decrypted);
}
