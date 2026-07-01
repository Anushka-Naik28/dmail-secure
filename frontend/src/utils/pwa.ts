// ── Install prompt ──────────────────────────────────────────
let deferredPrompt: any = null

export const initInstallPrompt = () => {
  if (typeof window === "undefined") return
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferredPrompt = e
  })
}

export const canInstall = (): boolean => !!deferredPrompt

export const installPWA = async (): Promise<boolean> => {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  return outcome === "accepted"
}

export const isInstalled = (): boolean => {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
}

// ── Service Worker registration ──────────────────────────────
export const registerServiceWorker = async (): Promise<void> => {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    console.log("✅ Service Worker registered:", reg.scope)

    // Listen for queue process messages from SW
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "PROCESS_QUEUE") {
        window.dispatchEvent(new Event("online"))
      }
    })
  } catch (err) {
    console.warn("SW registration failed:", err)
  }
}

// ── Push notifications ────────────────────────────────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false
  if (!("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  const permission = await Notification.requestPermission()
  return permission === "granted"
}

export const showLocalNotification = (title: string, body: string, url?: string) => {
  if (typeof window === "undefined") return
  if (Notification.permission !== "granted") return
  const n = new Notification(title, {
    body,
    icon:    "/icons/icon-192.png",
    badge:   "/icons/icon-72.png",
    tag:     "dmail-notification",
  })
  if (url) n.onclick = () => { window.focus(); window.location.href = url }
}

// ── Biometric authentication (WebAuthn) ──────────────────────
export const isBiometricAvailable = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export const registerBiometric = async (userEmail: string): Promise<boolean> => {
  if (!window.PublicKeyCredential) return false
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId    = new TextEncoder().encode(userEmail)

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp:   { name: "DMail", id: window.location.hostname },
        user: { id: userId, name: userEmail, displayName: userEmail },
        pubKeyCredParams: [
          { type: "public-key", alg: -7  },  // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification:        "required",
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential

    if (credential) {
      localStorage.setItem(
        `biometric_${userEmail}`,
        JSON.stringify({ credentialId: Array.from(new Uint8Array(credential.rawId)) })
      )
      return true
    }
    return false
  } catch (err) {
    console.warn("Biometric registration failed:", err)
    return false
  }
}

export const verifyBiometric = async (userEmail: string): Promise<boolean> => {
  if (!window.PublicKeyCredential) return false
  try {
    const stored = localStorage.getItem(`biometric_${userEmail}`)
    if (!stored) return false

    const { credentialId } = JSON.parse(stored)
    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: "public-key",
          id:   new Uint8Array(credentialId),
          transports: ["internal"],
        }],
        userVerification: "required",
        timeout: 60000,
      },
    })

    return !!assertion
  } catch {
    return false
  }
}

export const hasBiometricRegistered = (userEmail: string): boolean => {
  if (typeof window === "undefined") return false
  return !!localStorage.getItem(`biometric_${userEmail}`)
}

// ── Mobile detection ──────────────────────────────────────────
export const isMobile = (): boolean => {
  if (typeof window === "undefined") return false
  return window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export const isIOS = (): boolean => {
  if (typeof window === "undefined") return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// ── Background sync registration ────────────────────────────
export const registerBackgroundSync = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if ("sync" in reg) {
      await (reg as any).sync.register("sync-mail-queue")
      console.log("✅ Background sync registered")
    }
  } catch (err) {
    console.warn("Background sync not supported:", err)
  }
}
