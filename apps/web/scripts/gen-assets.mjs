// Generates the PWA icons and the Burmese title logo into apps/web/public.
// Run: pnpm --filter web gen:assets   (needs `pnpm --filter web exec playwright install chromium`)
// Outputs are committed; re-run only when the artwork changes.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TITLE = 'မိုနိုပိုလီ';

/** Flat icon: maroon field, cream board with four color-group edges, gold die. */
function iconSvg({ scale = 1 } = {}) {
  const s = (v) => 256 + (v - 256) * scale; // scale around the center (maskable safe zone)
  const pip = (x, y) => `<circle cx="${s(x)}" cy="${s(y)}" r="${11 * scale}" fill="#7A1F2B"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#7A1F2B"/>
  <rect x="${s(96)}" y="${s(96)}" width="${320 * scale}" height="${320 * scale}" rx="${28 * scale}" fill="#F6EBD0"/>
  <rect x="${s(144)}" y="${s(116)}" width="${224 * scale}" height="${30 * scale}" rx="${6 * scale}" fill="#D62F2F"/>
  <rect x="${s(366)}" y="${s(144)}" width="${30 * scale}" height="${224 * scale}" rx="${6 * scale}" fill="#F2D338"/>
  <rect x="${s(144)}" y="${s(366)}" width="${224 * scale}" height="${30 * scale}" rx="${6 * scale}" fill="#1F3FA6"/>
  <rect x="${s(116)}" y="${s(144)}" width="${30 * scale}" height="${224 * scale}" rx="${6 * scale}" fill="#2E9E5B"/>
  <rect x="${s(196)}" y="${s(196)}" width="${120 * scale}" height="${120 * scale}" rx="${22 * scale}" fill="#E0A526"/>
  ${pip(226, 226)}${pip(286, 226)}${pip(256, 256)}${pip(226, 286)}${pip(286, 286)}
</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function renderSvg(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: join(pub, file), clip: { x: 0, y: 0, width: size, height: size } });
}

writeFileSync(join(pub, 'icon.svg'), iconSvg());
await renderSvg(iconSvg(), 192, 'icon-192.png');
await renderSvg(iconSvg(), 512, 'icon-512.png');
await renderSvg(iconSvg({ scale: 0.78 }), 512, 'icon-maskable-512.png');
await renderSvg(iconSvg(), 180, 'apple-touch-icon.png');
await renderSvg(iconSvg(), 32, 'favicon-32.png');

// Title logo: rendered once with Noto Sans Myanmar (Unicode) so the app never needs the font.
const logoPage = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 1600, height: 400 },
});
await logoPage.setContent(`<html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@700&display=block">
</head><body style="margin:0;background:transparent">
<div id="t" style="display:inline-block;padding:24px 32px 40px;font:700 144px 'Noto Sans Myanmar';color:#FFF7E6;line-height:1.5">${TITLE}</div>
</body></html>`);
await logoPage.evaluate(() => document.fonts.ready);
const used = await logoPage.evaluate(() => document.fonts.check("700 144px 'Noto Sans Myanmar'"));
if (!used) throw new Error('Noto Sans Myanmar did not load; the logo would use a fallback font');
await logoPage.locator('#t').screenshot({ path: join(pub, 'logo.png'), omitBackground: true });

await browser.close();
console.log('assets written to', pub);
