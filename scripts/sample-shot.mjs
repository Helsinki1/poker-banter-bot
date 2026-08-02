// Print hex colors from a screenshot over a pixel rect.
// Usage: node scripts/sample-shot.mjs <png> <x> <y> <w> <h> [step]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [file, x0, y0, w, h, step = 1] = process.argv.slice(2);
const png = readFileSync(file);
const dataUrl = 'data:image/png;base64,' + png.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ dataUrl, x0, y0, w, h, step }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const lines = [];
  for (let y = +y0; y < +y0 + +h; y += +step) {
    const row = [];
    for (let x = +x0; x < +x0 + +w; x += +step) {
      const d = g.getImageData(x, y, 1, 1).data;
      row.push('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
    lines.push(`y=${y} ` + row.join(' '));
  }
  return lines;
}, { dataUrl, x0, y0, w, h, step });
await browser.close();
console.log(out.join('\n'));
