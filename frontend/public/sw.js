const CACHE_NAME = "dmail-v1"
const STATIC_ASSETS = [
  "/",
  "/dashboard/inbox",
  "/dashboard/compose",
  "/dashboard/sent",
  "/dashboard/contacts",
  "/dashboard/settings",
]

// ── Install — cache static assets ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail if some assets not available
      })
    })
  )
  self.skipWaiting()
})

// ── Activate — clean old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch — network first, cache fallback ──
self.addEventListener("fetch", (event) => {
  // Skip non-GET and cross-origin requests
  if (event.request.method !== "GET") return
  if (!event.request.url.startsWith(self.location.origin)) return

  // Skip IPFS and GunDB API calls — never cache these
  if (
    event.request.url.includes("localhost:5001") ||
    event.request.url.includes("localhost:8765") ||
    event.request.url.includes("localhost:9094") ||
    event.request.url.includes("ipfs.io")
  ) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then(
          (cached) => cached || caches.match("/dashboard/inbox")
        )
      })
  )
})

// ── Push notifications ──
self.addEventListener("push", (event) => {
  let data = { title: "DMail", body: "You have a new message", icon: "/icons/icon-192.png" }

  try {
    data = { ...data, ...event.data.json() }
  } catch { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || "/icons/icon-192.png",
      badge:   "/icons/icon-72.png",
      vibrate: [200, 100, 200],
      tag:     "dmail-notification",
      data:    { url: data.url || "/dashboard/inbox" },
      actions: [
        { action: "open",    title: "Open Inbox" },
        { action: "dismiss", title: "Dismiss"    },
      ],
    })
  )
})

// ── Notification click ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  if (event.action === "dismiss") return

  const url = event.notification.data?.url || "/dashboard/inbox"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((c) => c.url.includes(url))
      if (existingClient) return existingClient.focus()
      return clients.openWindow(url)
    })
  )
})

// ── Background sync — process offline mail queue ──
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-mail-queue") {
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: "PROCESS_QUEUE" })
        })
      })
    )
  }
})