const fs = require('fs');
const path = require('path');

async function dumpPageMetadata(pdfPath, targetPageNums) {
  // Use the legacy build for Node.js
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  console.log(`[Diagnostic] Total PDF pages: ${doc.numPages}\n`);

  for (const pageNum of targetPageNums) {
    if (pageNum > doc.numPages) {
      console.log(`[Diagnostic] Page ${pageNum} out of range.`);
      continue;
    }

    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    console.log(`================================================================`);
    console.log(`PAGE ${pageNum} DUMP (${textContent.items.length} items)`);
    console.log(`================================================================`);

    // Group items by vertical position (transform[5] is Y coordinate)
    const lines = [];
    let currentLine = [];
    let lastY = null;

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;

      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const height = Math.round(item.height);
      const fontName = item.fontName;

      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(currentLine);
        currentLine = [];
      }

      currentLine.push({
        text: item.str,
        x,
        y,
        height,
        fontName,
      });
      lastY = y;
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Sort lines top to bottom (descending Y)
    lines.sort((a, b) => b[0].y - a[0].y);

    for (const line of lines) {
      const lineText = line.map((item) => item.text).join(' ');
      const heights = [...new Set(line.map((i) => i.height))].join(', ');
      const fonts = [...new Set(line.map((i) => i.fontName))].join(', ');
      const y = line[0].y;
      console.log(`[Y: ${y.toString().padStart(3, ' ')} | H: ${heights.padStart(2, ' ')}pt | Font: ${fonts}] ${lineText}`);
    }
    console.log('\n');
  }
}

const pdfPath = process.argv[2] || path.join(__dirname, '../backend/tests/fixtures/practical_machine_learning.pdf');
const pages = [6, 14, 31];

dumpPageMetadata(pdfPath, pages).catch((err) => {
  console.error('Error running PDF diagnostic:', err);
  process.exit(1);
});
