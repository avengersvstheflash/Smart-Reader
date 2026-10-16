const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function main() {
  const src = path.join(__dirname, '..', 'assets', 'app-icon-source.png');
  const out = path.join(__dirname, '..', 'assets', 'app-icon-1024.png');

  if (!fs.existsSync(src)) {
    throw new Error(`Source icon not found at: ${src}`);
  }

  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 1. Detect bounding box of emblem
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (r > 25 || g > 25 || b > 25 || lum > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  console.log(`[build-icons] Detected Bounding Box: [${minX}, ${minY}, ${maxX}, ${maxY}] (${bboxW}x${bboxH})`);

  // 2. Square 904x904 centered crop (Option 1)
  const cropSize = 904;
  const centerX = Math.round((minX + maxX) / 2);
  const centerY = Math.round((minY + maxY) / 2);

  let left = centerX - Math.floor(cropSize / 2);
  let top = centerY - Math.floor(cropSize / 2);

  // Clamp within canvas boundaries
  left = Math.max(0, Math.min(width - cropSize, left));
  top = Math.max(0, Math.min(height - cropSize, top));

  console.log(`[build-icons] Final 904x904 Crop Rectangle: left=${left}, top=${top}, width=${cropSize}, height=${cropSize}`);

  // 3. Squircle mask (rx=180 at 1024x1024)
  const squircleSvg = Buffer.from(
    '<svg width="1024" height="1024"><rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="white"/></svg>'
  );

  // 4. Crop, resize to 1024x1024, composite squircle mask, and write
  await sharp(src)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(1024, 1024)
    .composite([{ input: squircleSvg, blend: 'dest-in' }])
    .png()
    .toFile(out);

  console.log(`[build-icons] Rendered ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
