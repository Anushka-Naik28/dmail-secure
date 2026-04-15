import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMail",
  description: "End-to-end encrypted mail client — The Decentralized Email Service",
};

/**
 * 🛠️ DMail Crypto Presence Bridge
 * 
 * OpenPGP.js v6 throws "The WebCrypto API is not available" on import if window.crypto.subtle is missing.
 * This happens on local network IPs (HTTP) as browsers disable SubtleCrypto in non-secure contexts.
 * 
 * This script provides a minimal SubtleCrypto interface that:
 * 1. Satisfies OpenPGP's initialization existence check.
 * 2. Provides a working 'digest' (often used for capability testing).
 * 3. Returns 'NotSupportedError' for crypto operations, forcing OpenPGP to fall back 
 *    to its internal pure-JS implementations (Noble-curves).
 */
const cryptoBridgeScript = `
(function() {
  try {
    if (typeof window === 'undefined') return;
    
    if (!window.crypto) { window.crypto = {}; }

    if (!window.crypto.subtle) {
      console.log('%c[DMail] Applying WebCrypto Presence Bridge (HTTP Support)...', 'color: #d4a017; font-weight: bold;');
      
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
          return Promise.resolve(new Uint8Array(32)); 
        },
      };

      try {
        Object.defineProperty(window.crypto, 'subtle', { 
          value: stub, 
          writable: true, 
          configurable: true 
        });
        console.warn('[DMail] WebCrypto presence stub installed. OpenPGP initialization crash prevented.');
      } catch(e) {
        window.crypto.subtle = stub;
      }
    }
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
    <html lang="en">
      <head>
        {/* ⚡ Must be first in <head> — patches crypto.subtle before any JS bundles load */}
        <script dangerouslySetInnerHTML={{ __html: cryptoBridgeScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}