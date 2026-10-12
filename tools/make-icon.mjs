#!/usr/bin/env node
// tools/make-icon.mjs — regenerate the Android launcher icon set as a pixel-art Rhodes Island rook
// (a chess castle / tower — fitting the auto-chess + tower-defense mode — with the Rhodes Island
// rhombus emblem and the Arknights navy/amber palette). Pure Node (zlib), no dependencies.
//
// Outputs (all nearest-neighbour, crisp pixels):
//   drawable-{dpi}/ic_launcher_foreground.png   adaptive foreground (transparent bg)
//   drawable-{dpi}/ic_launcher_monochrome.png   themed-icon layer (white, diamond as a cut-out)
//   drawable-{dpi}/ic_stat_stronghold.png       notification glyph (white silhouette)
//   mipmap-{dpi}/ic_launcher.png                legacy square icon (navy bg)
//   mipmap-{dpi}/ic_launcher_round.png          legacy round icon (navy, circular mask)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Palette (RGBA). D is the navy used for the legacy background and colors.xml ic_launcher_background.
const PAL = {
  W: [232, 237, 246, 255], // light steel
  S: [150, 165, 190, 255], // silver shade (base)
  A: [244, 181, 63, 255],  // amber (Rhodes Island rhombus)
  D: [22, 34, 46, 255],    // navy background
};

// 24×24 grid; '.' transparent. Symmetric about the centre column.
const ART = [
  '........................',
  '......WW..WW..WW........',
  '......WW..WW..WW........',
  '......WWWWWWWWWWWW......',
  '.......WWWWWWWWWW.......',
  '.......WWWWWWWWWW.......',
  '.......WWWWWWWWWW.......',
  '.......WWWWWWWWWW.......',
  '.......WWWWAAWWWW.......',
  '.......WWWAAAAWWW.......',
  '.......WWAAAAAAWW.......',
  '.......WWWAAAAWWW.......',
  '.......WWWWAAWWWW.......',
  '.......WWWWWWWWWW.......',
  '.......WWWWWWWWWW.......',
  '.......WWWWWWWWWW.......',
  '......WWWWWWWWWWWW......',
  '.....WWWWWWWWWWWWWW.....',
  '.....WWWWWWWWWWWWWW.....',
  '....WWWWWWWWWWWWWWWW....',
  '....WWWWWWWWWWWWWWWW....',
  '...SSSSSSSSSSSSSSSSSS...',
  '...SSSSSSSSSSSSSSSSSS...',
  '........................',
];
const AH = ART.length;
const AW = ART[0].length;

// --- minimal PNG encoder -------------------------------------------------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- rendering -----------------------------------------------------------
// Nearest-neighbour upscale of the art onto a `size`×`size` RGBA canvas, centred.
// `map(ch, pal)` returns the RGBA for an art cell (or null to skip); `bg` fills the canvas first.
function render(size, artTarget, { bg = null, map = (ch) => PAL[ch] } = {}) {
  const out = new Uint8Array(size * size * 4);
  if (bg) for (let i = 0; i < size * size; i++) out.set(bg, i * 4);
  const ox = Math.floor((size - artTarget) / 2);
  const oy = Math.floor((size - artTarget) / 2);
  for (let y = 0; y < artTarget; y++) {
    const sy = Math.floor((y * AH) / artTarget);
    for (let x = 0; x < artTarget; x++) {
      const sx = Math.floor((x * AW) / artTarget);
      const px = map(ART[sy][sx]);
      if (!px || px[3] === 0) continue;
      out.set(px, ((oy + y) * size + ox + x) * 4);
    }
  }
  return out;
}
function applyCircle(canvas, size) {
  const c = (size - 1) / 2;
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = Math.max(0, Math.min(1, r - d + 0.5)); // 1px anti-alias
      const i = (y * size + x) * 4 + 3;
      canvas[i] = Math.round((canvas[i] * a) / 255) * 255;
    }
  }
}
const WHITE = [255, 255, 255, 255];
const monochromeMap = (ch) => (ch === '.' || ch === 'A' ? null : WHITE); // rhombus = cut-out
const silhouetteMap = (ch) => (ch === '.' ? null : WHITE);

// Size tables (Android density buckets).
const DRAWABLE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const MIPMAP = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const STAT = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

function write(name, size, rgba) {
  const p = path.join(RES, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, encodePNG(size, size, rgba));
}

let count = 0;
for (const [dpi, size] of Object.entries(DRAWABLE)) {
  const fg = Math.round(size * 0.61); // content ≈ 0.56·size, inside the adaptive safe zone
  write(`drawable-${dpi}/ic_launcher_foreground.png`, size, render(size, fg, {}));
  write(`drawable-${dpi}/ic_launcher_monochrome.png`, size, render(size, fg, { map: monochromeMap }));
  count += 2;
}
for (const [dpi, size] of Object.entries(MIPMAP)) {
  const fg = Math.round(size * 0.74); // content ≈ 0.68·size
  write(`mipmap-${dpi}/ic_launcher.png`, size, render(size, fg, { bg: PAL.D }));
  const round = render(size, fg, { bg: PAL.D });
  applyCircle(round, size);
  write(`mipmap-${dpi}/ic_launcher_round.png`, size, round);
  count += 2;
}
for (const [dpi, size] of Object.entries(STAT)) {
  write(`drawable-${dpi}/ic_stat_stronghold.png`, size, render(size, Math.round(size * 0.98), { map: silhouetteMap }));
  count += 1;
}

console.log(`[make-icon] wrote ${count} PNGs under ${RES}`);
console.log('[make-icon] art preview (W steel · S silver · A amber · . transparent):\n');
console.log(ART.join('\n'));
console.log('\n[make-icon] remember: colors.xml ic_launcher_background should be #16222E (navy) to match the legacy bg.');
