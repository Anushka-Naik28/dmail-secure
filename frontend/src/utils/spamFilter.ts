import { gun } from "@/utils/gun"

const SPAM_KEYWORDS = [
  "win", "winner", "prize", "lottery", "claim", "free money", "urgent",
  "act now", "limited offer", "click here", "verify your account",
  "congratulations", "selected", "reward", "bitcoin", "crypto offer",
  "make money", "earn fast", "100% free", "no risk", "guaranteed",
  "dear friend", "nigerian", "inheritance", "bank transfer", "wire transfer",
]

const isTrustedSender = (senderEmail: string, userEmail: string): boolean => {
  try {
    const cached = localStorage.getItem(`contacts_${userEmail}`)
    if (!cached) return false
    const contacts = JSON.parse(cached)
    return contacts.some(
      (c: any) => c.email?.toLowerCase() === senderEmail?.toLowerCase()
    )
  } catch {
    return false
  }
}

const hasPreviousConversation = (
  senderEmail: string,
  userEmail: string
): Promise<boolean> => {
  return new Promise((resolve) => {
    let found = false
    const timeout = setTimeout(() => resolve(found), 500)

    const cleanSender = senderEmail?.trim().toLowerCase()
    const cleanUser = userEmail?.trim().toLowerCase()

    gun.get(`user_mail_index:${cleanUser}`).map().once((mail: any) => {
      if (
        mail &&
        mail.senderEmail?.trim().toLowerCase() === cleanUser &&
        mail.receiverEmail?.trim().toLowerCase() === cleanSender
      ) {
        found = true
        clearTimeout(timeout)
        resolve(true)
      }
    })
  })
}

const scoreSpam = (mail: any): { score: number; reasons: string[] } => {
  let score = 0
  const reasons: string[] = []

  const subject  = (mail.subject  || "").toLowerCase()
  const message  = (mail.message  || "").toLowerCase()
  const combined = subject + " " + message

  const matchedKeywords = SPAM_KEYWORDS.filter((kw) => combined.includes(kw))
  if (matchedKeywords.length > 0) {
    score += matchedKeywords.length * 15
    reasons.push(`Spam keywords: ${matchedKeywords.slice(0, 3).join(", ")}`)
  }

  if (mail.subject && mail.subject === mail.subject.toUpperCase() && mail.subject.length > 5) {
    score += 20
    reasons.push("All-caps subject")
  }

  const exclamations = (combined.match(/!/g) || []).length
  if (exclamations >= 3) {
    score += 10
    reasons.push("Excessive exclamation marks")
  }

  const emailUser = (mail.senderEmail || "").split("@")[0]
  if (/\d{4,}/.test(emailUser)) {
    score += 10
    reasons.push("Suspicious sender pattern")
  }

  if (!mail.subject || mail.subject.trim().length < 3) {
    score += 10
    reasons.push("Empty or very short subject")
  }

  return { score, reasons }
}

export type FilterResult = "inbox" | "spam" | "request"

export interface FilterDecision {
  status:        FilterResult
  flaggedReason: string
  spamScore:     number
}

export const filterIncomingMail = async (
  mail: any,
  userEmail: string
): Promise<FilterDecision> => {

  // ── Step 0: Ignore outgoing mails ──
  if (mail.senderEmail?.toLowerCase() === userEmail?.toLowerCase()) {
    return { status: "inbox", flaggedReason: "", spamScore: 0 }
  }

  // ── Step 1: Trusted sender (in contacts) → always inbox ──
  const trusted = isTrustedSender(mail.senderEmail, userEmail)
  if (trusted) {
    return { status: "inbox", flaggedReason: "", spamScore: 0 }
  }

  // ── Step 2: Score the mail content ──
  const { score, reasons } = scoreSpam(mail)

  // ── Step 3: High spam score → spam immediately ──
  if (score >= 40) {
    return {
      status:        "spam",
      flaggedReason: reasons.slice(0, 2).join(" · ") || "High spam score",
      spamScore:     score,
    }
  }

  // ── Step 4: Check previous conversation ──
  const hasConvo = await hasPreviousConversation(mail.senderEmail, userEmail)
  if (hasConvo) {
    return { status: "inbox", flaggedReason: "", spamScore: score }
  }

  // ── Step 5: Medium score → spam ──
  if (score >= 15) {
    return {
      status:        "spam",
      flaggedReason: reasons.slice(0, 2).join(" · ") || "Possible spam",
      spamScore:     score,
    }
  }

  // ── Step 6: Unknown sender, low score → request folder ──
  return {
    status:        "request",
    flaggedReason: "Unknown sender",
    spamScore:     score,
  }
}

export const trustSender = (senderEmail: string, userEmail: string) => {
  try {
    const cached   = localStorage.getItem(`contacts_${userEmail}`)
    const contacts = cached ? JSON.parse(cached) : []
    const exists   = contacts.find((c: any) => c.email === senderEmail)
    if (!exists) {
      contacts.push({
        id:      `contact_${Date.now()}`,
        name:    senderEmail.split("@")[0],
        email:   senderEmail,
        addedAt: Date.now(),
      })
      localStorage.setItem(`contacts_${userEmail}`, JSON.stringify(contacts))
    }
  } catch {
    console.error("Failed to trust sender")
  }
}
