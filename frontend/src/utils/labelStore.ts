// ─────────────────────────────────────────────────────────
//  Label Store — client-side localStorage-based label system
// ─────────────────────────────────────────────────────────

export interface Label {
  id: string
  name: string
  color: string   // hex, e.g. "#e74c3c"
  emoji?: string  // optional emoji icon
}

const labelsKey  = (email: string) => `labels_${email}`
const taggedKey  = (email: string) => `label_mails_${email}`

// ── CRUD ─────────────────────────────────────────────────

export const getLabels = (email: string): Label[] => {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(labelsKey(email)) || "[]")
  } catch { return [] }
}

export const saveLabel = (email: string, label: Label): Label[] => {
  const labels = getLabels(email)
  const idx = labels.findIndex((l) => l.id === label.id)
  if (idx >= 0) labels[idx] = label
  else          labels.push(label)
  localStorage.setItem(labelsKey(email), JSON.stringify(labels))
  notifyListeners()
  return labels
}

export const deleteLabel = (email: string, id: string): Label[] => {
  const labels = getLabels(email).filter((l) => l.id !== id)
  localStorage.setItem(labelsKey(email), JSON.stringify(labels))
  // also remove from all tagged mails
  const tagged = getTaggedMap(email)
  for (const mailId of Object.keys(tagged)) {
    tagged[mailId] = (tagged[mailId] || []).filter((lid) => lid !== id)
    if (tagged[mailId].length === 0) delete tagged[mailId]
  }
  localStorage.setItem(taggedKey(email), JSON.stringify(tagged))
  notifyListeners()
  return labels
}

// ── Label ↔ Mail mapping ─────────────────────────────────

const getTaggedMap = (email: string): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(taggedKey(email)) || "{}")
  } catch { return {} }
}

export const getMailLabels = (email: string, mailId: string): string[] => {
  const labels = getTaggedMap(email)[mailId] ?? []
  return Array.from(new Set(labels))
}

export const getLabelMails = (email: string, labelId: string): string[] => {
  const map = getTaggedMap(email)
  return Object.keys(map).filter((mid) => map[mid]?.includes(labelId))
}

export const tagMail = (email: string, mailId: string, labelId: string) => {
  const map = getTaggedMap(email)
  if (!map[mailId]) map[mailId] = []
  if (!map[mailId].includes(labelId)) map[mailId].push(labelId)
  localStorage.setItem(taggedKey(email), JSON.stringify(map))
  notifyListeners()
}

export const untagMail = (email: string, mailId: string, labelId: string) => {
  const map = getTaggedMap(email)
  if (map[mailId]) {
    map[mailId] = map[mailId].filter((lid) => lid !== labelId)
    if (map[mailId].length === 0) delete map[mailId]
  }
  localStorage.setItem(taggedKey(email), JSON.stringify(map))
  notifyListeners()
}

export const toggleMailLabel = (email: string, mailId: string, labelId: string): boolean => {
  const map = getTaggedMap(email)
  const tagged = map[mailId]?.includes(labelId) ?? false
  if (tagged) untagMail(email, mailId, labelId)
  else        tagMail(email, mailId, labelId)
  return !tagged
}

// ── Reactive listeners ────────────────────────────────────

const listeners: Set<() => void> = new Set()
export const subscribeLabelStore = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notifyListeners = () => listeners.forEach((fn) => fn())

// ── Helpers ───────────────────────────────────────────────

export const createId = () => `lbl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export const PRESET_COLORS = [
  "#e74c3c", // red
  "#e67e22", // orange
  "#f1c40f", // yellow
  "#2ecc71", // green
  "#1abc9c", // teal
  "#3498db", // blue
  "#9b59b6", // purple
  "#e91e8c", // pink
  "#95a5a6", // grey
  "#d4a017", // gold (brand)
]
