// Run: node scripts/generate-icons.mjs
// Requires: npm install sharp

import sharp from "sharp"
import fs from "fs"

const sizes = [72, 96, 128, 192, 512]
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#d4a017"/>
  <text x="50" y="68" font-size="55" text-anchor="middle" fill="#000">✉</text>
</svg>`

fs.mkdirSync("public/icons", { recursive: true })

for (const size of sizes) {
  await sharp(Buffer.from(svgIcon))
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`)
  console.log(`✅ Generated icon-${size}.png`)
}