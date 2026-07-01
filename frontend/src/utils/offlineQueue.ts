const QUEUE_KEY = "securemail_offline_queue"

export interface QueuedMail {
  id: string
  mail: any
  queuedAt: string
  retries: number
}

export const getQueue = (): QueuedMail[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]")
  } catch {
    return []
  }
}

export const addToQueue = (mail: any): string => {
  const queue = getQueue()
  const id = `queued_${Date.now()}_${Math.random().toString(36).slice(2)}`
  queue.push({ id, mail, queuedAt: new Date().toLocaleString(), retries: 0 })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  console.log("📥 Mail queued:", id)
  return id
}

export const removeFromQueue = (id: string) => {
  const queue = getQueue().filter((q) => q.id !== id)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export const updateRetries = (id: string) => {
  const queue = getQueue().map((q) =>
    q.id === id ? { ...q, retries: q.retries + 1 } : q
  )
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

const getLocalRelay = () => {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:8765/gun`;
  }
  return "http://localhost:8765/gun";
};

export const isOnline = async (): Promise<boolean> => {
  if (!navigator.onLine) return false
  try {
    const response = await fetch(getLocalRelay(), {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    })
    return response.ok || response.status > 0
  } catch {
    return false
  }
}
