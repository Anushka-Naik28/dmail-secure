import { gun, db } from "@/utils/gun"
import { getCachedMails, cacheMail } from "@/utils/mailCache"
import { filterIncomingMail } from "@/utils/spamFilter"

let allMails: any[] = []
let currentEmail = ""
let isListening = false
const listeners: Set<() => void> = new Set()
const processedIds = new Set<string>()

const notify = () => listeners.forEach((fn) => fn())

const dedup = () => {
  allMails = allMails.filter(
    (mail, index, self) => index === self.findIndex((m) => m.id === mail.id)
  )
}

export const initMailStore = (userEmail: string) => {
  if (isListening && currentEmail === userEmail) return
  currentEmail = userEmail
  isListening = true

  // 1. Load IndexedDB cache instantly
  getCachedMails(userEmail).then((cached) => {
    cached.forEach((mail) => {
      if (!allMails.find((m) => m.id === mail.id)) {
        allMails.push({ ...mail, fromCache: true })
        processedIds.add(mail.id)
      }
    })
    dedup()
    notify()
  })

  // 2. Optimized GunDB Sync (Cross-device reliable)
  db.listenUserMails(userEmail, async (mail: any) => {
    if (!mail || !mail.id) return

    console.log(`📥 [Raw Incoming] ID: ${mail.id} | From: ${mail.senderEmail} | Status: ${mail.status}`)

    const idx = allMails.findIndex((m) => m.id === mail.id)

    const isNewIncoming =
      mail.receiverEmail === userEmail &&
      ["inbox", "request", "spam"].includes(mail.status) &&
      !processedIds.has(mail.id)

    if (isNewIncoming) {
      processedIds.add(mail.id)
      
      // 🚀 Proactive Content Sync: Fetch full body from IPFS if missing
      // This ensures we have the body for spam filtering and immediate display in all folders
      if (mail.cid && !mail.message) {
        try {
          const { fetchFromIPFS } = await import("@/utils/ipfs")
          const ipfsData = await fetchFromIPFS(mail.cid)
          mail = { ...mail, ...ipfsData }
          console.log("📥 Background body sync complete for:", mail.id)
        } catch (e) {
          console.warn("⚠️ Background content fetch failed for", mail.id, e)
        }
      }

      try {
        const decision = await filterIncomingMail(mail, userEmail)
        if (decision.status !== "inbox") {
          const filtered = { ...mail, status: decision.status, flaggedReason: decision.flaggedReason, spamScore: decision.spamScore, fromCache: false }
          updateMailInStore(mail.id, filtered)
          return
        }
      } catch (err) {
        console.warn("Spam filter failed for", mail.id, err)
      }
    }

    // ── Normal update / insert ──
    if (idx >= 0) {
      const existing = allMails[idx]
      const protectedStatuses = ["archived", "trash", "purged", "spam"]
      const keepStatus = protectedStatuses.includes(existing.status)

      allMails[idx] = {
        ...existing,
        ...mail,
        fromCache: false,
        status: keepStatus ? existing.status : (mail.status ?? existing.status),
        senderStatus: mail.senderEmail === userEmail ? "sent" : existing.senderStatus,
      }
    } else {
      allMails.push({
        ...mail,
        fromCache: false,
        senderStatus: mail.senderEmail === userEmail ? "sent" : undefined,
      })
    }

    await cacheMail(mail)
    dedup()
    notify()
  })
}

export const getMails = (status: string) => {
  const newestFirst = (a: any, b: any) => {
    const ta = Date.parse(a.time) || 0
    const tb = Date.parse(b.time) || 0
    return tb - ta
  }

  if (status === "starred")
    return allMails
      .filter((m) => m.isStarred && m.status !== "trash")
      .sort(newestFirst)

  if (status === "sent")
    return allMails
      .filter((m) => m.senderEmail === currentEmail && m.status !== "draft")
      .sort(newestFirst)

  if (status === "queued")
    return allMails.filter((m) => m.status === "queued").sort(newestFirst)

  if (status === "all")
    return allMails
      .filter((m) => m.status !== "trash" && m.status !== "purged")
      .sort(newestFirst)

  if (status === "request")
    return allMails.filter((m) => m.status === "request").sort(newestFirst)

  return allMails.filter((m) => m.status === status).sort(newestFirst)
}

const normalizeSubject = (s: string) =>
  (s || "(No subject)")
    .replace(/^((Re|Fwd):\s*)+/i, "")
    .trim()

export interface Thread {
  id: string
  subject: string
  messages: any[]
  lastMessage: any
  count: number
  isRead: boolean
  isStarred: boolean
  isPinned: boolean
}

export const getThreads = (status: string | string[]): Thread[] => {
  const statuses = Array.isArray(status) ? status : [status]
  let filtered: any[] = []

  if (statuses.includes("starred")) {
    filtered = allMails.filter((m) => m.isStarred)

    // ✅ Fixed: "sent" thread grouping uses getMails("sent") logic
  } else if (statuses.includes("sent")) {
    filtered = allMails.filter(
      (m) =>
        m.senderEmail === currentEmail &&
        (statuses.includes(m.status) ||
          m.senderEmail === currentEmail) &&
        m.status !== "draft"
    )
    // Also include queued if requested
    if (statuses.includes("queued")) {
      const queued = allMails.filter((m) => m.status === "queued")
      filtered = [...filtered, ...queued].filter(
        (m, i, self) => i === self.findIndex((x) => x.id === m.id)
      )
    }
  } else {
    filtered = allMails.filter((m) => statuses.includes(m.status || "inbox"))
  }

  const threadMap: Record<string, any[]> = {}
  filtered.forEach((m) => {
    const norm = normalizeSubject(m.subject)
    if (!threadMap[norm]) threadMap[norm] = []
    threadMap[norm].push(m)
  })

  return Object.values(threadMap)
    .map((msgs) => {
      const sorted = msgs.sort(
        (a, b) => new Date(a.time).getTime() - new Date(a.time).getTime()
      )
      const latest = sorted[sorted.length - 1]
      return {
        id: latest.id,
        subject: normalizeSubject(latest.subject),
        messages: sorted,
        lastMessage: latest,
        count: sorted.length,
        isRead: sorted.every(
          (m) => m.senderEmail === currentEmail || m.isRead
        ),
        isStarred: sorted.some((m) => m.isStarred),
        isPinned: sorted.some((m) => m.isPinned),
      }
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessage.time).getTime() -
        new Date(a.lastMessage.time).getTime()
    )
}

export const getAllRaw = () => allMails

export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const updateMailInStore = (id: string, updates: any) => {
  const idx = allMails.findIndex((m) => m.id === id)
  const mail = idx >= 0 ? allMails[idx] : null
  
  if (idx >= 0) {
    allMails[idx] = { ...allMails[idx], ...updates }
    cacheMail(allMails[idx])
  } else {
    allMails.push({ id, ...updates })
  }

  // Sync to GunDB across all indices
  gun.get("securemail_mails").get(id).put(updates)
  if (mail) {
    if (mail.senderEmail) gun.get(`user_mail_index:${mail.senderEmail}`).get(id).put(updates)
    if (mail.receiverEmail) gun.get(`user_mail_index:${mail.receiverEmail}`).get(id).put(updates)
  }
  
  dedup()
  notify()
}

export const pinMailInStore = (id: string, isPinned: boolean) => {
  updateMailInStore(id, { isPinned })
}

export const getCounts = (userEmail: string) => ({
  inbox: allMails.filter(
    (m) => m.receiverEmail === userEmail && m.status === "inbox" && !m.isRead
  ).length,
  // ✅ Fixed: count sent by senderEmail, not status
  sent: allMails.filter(
    (m) => m.senderEmail === userEmail && m.status !== "draft"
  ).length,
  starred: allMails.filter(
    (m) => m.receiverEmail === userEmail && m.isStarred && m.status !== "trash"
  ).length,
  spam: allMails.filter(
    (m) => m.receiverEmail === userEmail && m.status === "spam"
  ).length,
  request: allMails.filter(
    (m) => m.receiverEmail === userEmail && m.status === "request"
  ).length,
  drafts: allMails.filter(
    (m) => m.senderEmail === userEmail && m.status === "draft"
  ).length,
  trash: allMails.filter(
    (m) => m.receiverEmail === userEmail && m.status === "trash"
  ).length,
})

export const clearStore = () => {
  allMails = []
  currentEmail = ""
  isListening = false
  processedIds.clear()
  listeners.clear()
}