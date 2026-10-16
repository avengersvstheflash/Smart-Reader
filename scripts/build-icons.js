const sharp = require('sharp');
const path = require('path');

async function main() {
  const src = path.join(__dirname, '..', 'assets', 'app-icon.svg');
  const out = path.join(__dirname, '..', 'assets', 'app-icon-1024.png');
  await sharp(src).resize(1024, 1024).png().toFile(out);
  console.log('Rendered', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

