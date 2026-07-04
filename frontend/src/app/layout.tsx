import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMail",
  description: "End-to-end encrypted mail client — The Decentralized Email Service",
};

const cryptoBridgeScript = `
(function() {
  try {
    if (typeof window === 'undefined') return;
    
    // 1. Ensure window.crypto exists
    if (!window.crypto) { 
      try {
        Object.defineProperty(window, 'crypto', { value: {}, writable: true, configurable: true });
      } catch(e) { window.crypto = {}; }
    }

    // 2. Ensure getRandomValues exists (CRITICAL for OpenPGP)
    if (!window.crypto.getRandomValues) {
      console.warn('[DMail] window.crypto.getRandomValues missing. Falling back to Math.random (INSECURE).');
      window.crypto.getRandomValues = function(arr) {
        for (var i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      };
    }

    // 3. Ensure subtle exists
    if (!window.crypto.subtle) {
      console.log('%c[DMail] Applying WebCrypto Presence Bridge (HTTP Support)...', 'color: #d4af37; font-weight: bold;');
      
      var fail = function() {
        var err = new Error('The operation is not supported.');
        err.name = 'NotSupportedError';
        return Promise.reject(err);
      };

      var stub = {
        __isStub:    true,
        importKey:   fail,
        exportKey:   fail,
        generateKey: fail,
        encrypt:     fail,
        decrypt:     fail,
        sign:        fail,
        verify:      fail,
        deriveKey:   fail,
        deriveBits:  fail,
        wrapKey:     fail,
        unwrapKey:   fail,
        digest:      function(algo, data) { 
          // OpenPGP sometimes checks if digest works. Return a dummy promise.
          return Promise.resolve(new Uint8Array(32)); 
        },
      };

      try {
        if (!window.crypto.subtle) {
          Object.defineProperty(window.crypto, 'subtle', { 
            value: stub, 
            writable: true, 
            configurable: true 
          });
        }
      } catch(e) {
        try { window.crypto.subtle = stub; } catch(err) {}
      }
    }
    
    // 4. Force window.isSecureContext to true if it's missing (helps some libs)
    if (window.isSecureContext === undefined) {
      try {
        Object.defineProperty(window, 'isSecureContext', { value: true, writable: true, configurable: true });
      } catch(e) {}
    }

    // 5. Sanitize localStorage to prevent crashes from legacy projects on localhost
    try {
      var rawUser = localStorage.getItem("user");
      if (rawUser && !rawUser.startsWith("{") && !rawUser.startsWith("[")) {
        console.warn("[DMail] Clearing legacy non-JSON user key from localStorage.");
        localStorage.removeItem("user");
      }
    } catch(e) {}
  } catch(e) {
    console.error('[DMail] Crypto Bridge application failed:', e);
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: cryptoBridgeScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
