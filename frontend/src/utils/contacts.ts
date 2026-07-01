import { gun, getOpenPGP, isKeyValid, repairPublicKeyFromPrivate, sanitizeArmoredKey, decryptVaultKey, derivePGPPassphrase } from "@/utils/gun"

const CONTACTS_KEY = "securemail_contacts"

export interface Contact {
  id: string
  name: string
  email: string
  publicKey?: string   // ← NEW — PGP public key from GunDB
  addedAt: number
}

const encryptContacts = async (
  contacts: Contact[], 
  publicKey: string,
  privateKeyArmored?: string
): Promise<string> => {
  const openpgp = await getOpenPGP();
  
  let validKey = sanitizeArmoredKey(publicKey);
  
  // 🛡️ [Self-Healing] If key is invalid/truncated, attempt repair via private key
  if (!(await isKeyValid(validKey)) && privateKeyArmored) {
    console.warn("🛡️ [Contacts] Degraded public key detected. Attempting repair...");
    // Use password from localStorage if available for repair
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const repaired = await repairPublicKeyFromPrivate(privateKeyArmored, user.password);
    if (repaired) {
      console.log("✅ [Contacts] Identity repaired successfully.");
      validKey = repaired;
      // Update local storage to prevent future failures
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.email) {
        user.publicKey = repaired;
        localStorage.setItem("user", JSON.stringify(user));
      }
    }
  }

  const pubKey = await openpgp.readKey({ armoredKey: validKey });

  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: JSON.stringify(contacts) }),
    encryptionKeys: pubKey,
    format: 'armored',
  });

  return btoa(encrypted as string);
}

const decryptContacts = async (
  base64Encrypted: string,
  privateKeyArmored: string,
  password: string
): Promise<Contact[]> => {
  const openpgp = await getOpenPGP()
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ 
      armoredKey: decryptVaultKey(privateKeyArmored, password) 
    }),
    passphrase: derivePGPPassphrase(password),
  })

  let armored;
  try {
    armored = atob(base64Encrypted)
  } catch {
    armored = base64Encrypted // Fallback for old data if any
  }

  const message = await openpgp.readMessage({ armoredMessage: armored })
  const { data: decrypted } = await openpgp.decrypt({
    message, decryptionKeys: privateKey,
  })
  return JSON.parse(decrypted as string)
}

export const saveContacts = async (
  contacts: Contact[],
  userEmail: string,
  publicKey: string,
  privateKeyArmored?: string
): Promise<void> => {
  try {
    const encrypted = await encryptContacts(contacts, publicKey, privateKeyArmored)
    gun.get(CONTACTS_KEY).get(userEmail).put({ encrypted, updatedAt: Date.now() })
    localStorage.setItem(`contacts_${userEmail}`, JSON.stringify(contacts))
  } catch (err) {
    console.error("Failed to save contacts:", err)
    throw err
  }
}

export const loadContacts = (
  userEmail: string,
  privateKeyArmored: string,
  password: string,
  cb: (contacts: Contact[]) => void
): void => {
  gun.get(CONTACTS_KEY).get(userEmail).once(async (data: any) => {
    if (!data?.encrypted) {
      try {
        const cached = localStorage.getItem(`contacts_${userEmail}`)
        cb(cached ? JSON.parse(cached) : [])
      } catch { cb([]) }
      return
    }
    try {
      const contacts = await decryptContacts(data.encrypted, privateKeyArmored, password)
      localStorage.setItem(`contacts_${userEmail}`, JSON.stringify(contacts))
      cb(contacts)
    } catch {
      try {
        const cached = localStorage.getItem(`contacts_${userEmail}`)
        cb(cached ? JSON.parse(cached) : [])
      } catch { cb([]) }
    }
  })
}

// ── Fetch public key from GunDB for a given email ──
export const fetchPublicKey = (email: string): Promise<string | null> => {
  return new Promise((resolve) => {
    gun.get("securemail_users").get(email).once((data: any) => {
      resolve(data?.publicKey || null)
    })
    setTimeout(() => resolve(null), 3000)
  })
}

export const addContact = async (
  contact: Omit<Contact, "id" | "addedAt">,
  userEmail: string,
  publicKey: string,
  privateKeyArmored: string,
  password: string
): Promise<Contact[]> => {
  return new Promise((resolve) => {
    loadContacts(userEmail, privateKeyArmored, password, async (existing) => {
      const alreadyExists = existing.find(
        (c) => c.email.toLowerCase() === contact.email.toLowerCase()
      )
      if (alreadyExists) { resolve(existing); return }

      // Auto-fetch public key from GunDB
      const recipientPublicKey = await fetchPublicKey(contact.email)

      const newContact: Contact = {
        id:        `contact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name:      contact.name,
        email:     contact.email,
        publicKey: contact.publicKey || recipientPublicKey || undefined,
        addedAt:   Date.now(),
      }
      const updated = [...existing, newContact]
      await saveContacts(updated, userEmail, publicKey, privateKeyArmored)
      resolve(updated)
    })
  })
}

export const deleteContact = async (
  contactId: string,
  userEmail: string,
  publicKey: string,
  privateKeyArmored: string,
  password: string
): Promise<Contact[]> => {
  return new Promise((resolve) => {
    loadContacts(userEmail, privateKeyArmored, password, async (existing) => {
      const updated = existing.filter((c) => c.id !== contactId)
      await saveContacts(updated, userEmail, publicKey, privateKeyArmored)
      resolve(updated)
    })
  })
}

export const autoSaveContact = async (
  name: string,
  email: string,
  userEmail: string,
  publicKey: string,
  privateKeyArmored: string,
  password: string
): Promise<void> => {
  try {
    await addContact({ name, email }, userEmail, publicKey, privateKeyArmored, password)
  } catch {
    // Silently fail
  }
}
