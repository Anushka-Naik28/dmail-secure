const DB_NAME = "securemail_cache"
const DB_VERSION = 1
const STORE_NAME = "mails"

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("receiverEmail", "receiverEmail", { unique: false })
        store.createIndex("status", "status", { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Save a mail to local cache (full content including decrypted body if available)
export const cacheMail = async (mail: any): Promise<void> => {
  if (!mail || !mail.id) return // 🛡️ Safety guard for IndexedDB keyPath

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put({
      ...mail,
      cachedAt: Date.now(),
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.error("Failed to cache mail:", err)
  }
}

// Get all cached mails for a user
export const getCachedMails = async (receiverEmail: string): Promise<any[]> => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readonly")
    const index = tx.objectStore(STORE_NAME).index("receiverEmail")
    const request = index.getAll(receiverEmail)
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

// Get a single cached mail by id
export const getCachedMail = async (id: string): Promise<any | null> => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).get(id)
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

// Update a cached mail (e.g. after decryption — save plaintext for offline reading)
export const updateCachedMail = async (id: string, updates: any): Promise<void> => {
  try {
    const existing = await getCachedMail(id)
    if (existing) {
      await cacheMail({ ...existing, ...updates })
    }
  } catch (err) {
    console.error("Failed to update cached mail:", err)
  }
}

// Delete a cached mail
export const deleteCachedMail = async (id: string): Promise<void> => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(id)
  } catch (err) {
    console.error("Failed to delete cached mail:", err)
  }
}

// Get cache stats
export const getCacheStats = async (): Promise<{ count: number; sizeKB: number }> => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).getAll()
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const mails = request.result || []
        const sizeBytes = new Blob([JSON.stringify(mails)]).size
        resolve({ count: mails.length, sizeKB: Math.round(sizeBytes / 1024) })
      }
      request.onerror = () => resolve({ count: 0, sizeKB: 0 })
    })
  } catch {
    return { count: 0, sizeKB: 0 }
  }
}
