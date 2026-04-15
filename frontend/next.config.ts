import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // ⚠️ Turbopack removed — it breaks OpenPGP.js v6 EdDSA key generation
  // (crypto.subtle.generateKey is not correctly resolved for Ed25519 under Turbopack)
  transpilePackages: ["openpgp"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ]
  },
  serverExternalPackages: ["kubo-rpc-client"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure Node.js crypto builtins are not polyfilled incorrectly in browser bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false, // Let the browser use its native window.crypto
        stream: false,
        buffer: false,
      }
    }
    return config
  },
}

export default nextConfig