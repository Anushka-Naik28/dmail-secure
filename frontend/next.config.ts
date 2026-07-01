import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["openpgp"],
  serverExternalPackages: ["kubo-rpc-client"],
  // 🚀 Removing custom webpack config to fix 500 Internal Server Error
}

export default nextConfig