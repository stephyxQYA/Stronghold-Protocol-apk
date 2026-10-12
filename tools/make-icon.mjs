#!/usr/bin/env node
// tools/make-icon.mjs — regenerate the Android launcher icon set from a source PNG.
// Pure Node (zlib), no dependencies. Usage: node tools/make-icon.mjs [source.png]
// Default source: tools/icon-src.png (a 512×512 RGBA/RGB drawing).
//
// Outputs (area-average downscale for smooth edges):
//   drawable-{dpi}/ic_launcher_foreground.png   adaptive foreground (full image)
//   drawable-{dpi}/ic_launcher_monochrome.png   themed-icon layer (white, alpha = luminance)
//   drawable-{dpi}/ic_stat_stronghold.png       notification glyph (white silhouette)
//   mipmap-{dpi}/ic_launcher.png                legacy square icon (full image)
//   mipmap-{dpi}/ic_launcher_round.png          legacy round icon (full image, circular mask)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tools', 'icon-src.png');

// --- PNG decode (8-bit RGB type 2 / RGBA type 6) --------------------------
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bd !== 8) throw new Error(`only 8-bit PNG supported (got ${bd})`);
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : (() => { throw new Error(`unsupported color type ${ct}`); })();
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = row[x]; break;
        case 1: v = (row[x] + a) & 0xff; break;
        case 2: v = (row[x] + b) & 0xff; break;
        case 3: v = (row[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = (row[x] + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff; break; }
        default: throw new Error(`bad filter ${f}`);
      }
      px[y * stride + x] = v;
    }
    prev = px.subarray(y * stride, (y + 1) * stride);
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (bpp === 3) { rgba[i * 4] = px[i * 3]; rgba[i * 4 + 1] = px[i * 3 + 1]; rgba[i * 4 + 2] = px[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    else { rgba[i * 4] = px[i * 4]; rgba[i * 4 + 1] = px[i * 4 + 1]; rgba[i * 4 + 2] = px[i * 4 + 2]; rgba[i * 4 + 3] = px[i * 4 + 3]; }
  }
  return { w, h, rgba };
}

// --- PNG encode (RGBA) ----------------------------------------------------
let CRC_TABLE = null;
function crc32(b) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < b.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ b[i]) & 0xff];
  return (c ^ -1) >>> 0;
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- resampling -----------------------------------------------------------
// Area-average downscale (box filter) — smooth for both painted and pixel art.
function resize(src, sw, sh, size) {
  const out = new Uint8Array(size * size * 4);
  const sx = sw / size, sy = sh / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++)
        for (let xx = x0; xx < x1 && xx < sw; xx++) { const i = (yy * sw + xx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++; }
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n); out[i + 1] = Math.round(g / n); out[i + 2] = Math.round(b / n); out[i + 3] = Math.round(a / n);
    }
  }
  return out;
}
// White silhouette where alpha = luminance (dark bg → transparent, bright art → opaque).
function silhouette(src, sw, sh, size) {
  const lum = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) { const j = i * 4; lum[i] = Math.round(0.299 * src[j] + 0.587 * src[j + 1] + 0.114 * src[j + 2]); }
  const out = new Uint8Array(size * size * 4);
  const sx = sw / size, sy = sh / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++) for (let xx = x0; xx < x1 && xx < sw; xx++) { s += lum[yy * sw + xx]; n++; }
      const i = (y * size + x) * 4;
      out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = Math.round(s / n);
    }
  }
  return out;
}
function applyCircle(canvas, size) {
  const c = (size - 1) / 2, r = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c);
    const a = Math.max(0, Math.min(1, r - d + 0.5)); // 1px anti-alias
    const i = (y * size + x) * 4 + 3;
    canvas[i] = Math.round((canvas[i] * a) / 255) * 255;
  }
}

// --- diagnostics ----------------------------------------------------------
function diagnose(w, h, rgba) {
  const hex = (v) => v.toString(16).padStart(2, '0');
  let r = 0, g = 0, b = 0, n = 0;
  for (let x = 0; x < w; x++) for (const y of [0, 1, 2, h - 1, h - 2, h - 3]) { const i = (y * w + x) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
  for (let y = 0; y < h; y++) for (const x of [0, 1, 2, w - 1, w - 2, w - 3]) { const i = (y * w + x) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
  const bg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  console.log(`[make-icon] source ${w}×${h}`);
  console.log(`[make-icon] border-ring avg rgb(${bg.join(',')}) → suggested colors.xml #${bg.map(hex).join('')}`);
  const px = (x, y) => { const i = (y * w + x) * 4; return `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`; };
  console.log(`[make-icon] edge mids  top=${px(w >> 1, 4)} bottom=${px(w >> 1, h - 5)} left=${px(4, h >> 1)} right=${px(w - 5, h >> 1)}`);
  let bright = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (lum > 128) bright++;
    if (lum > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  console.log(`[make-icon] bright (lum>128) coverage ${(100 * bright / (w * h)).toFixed(1)}%`);
  console.log(`[make-icon] content (lum>40) bbox  x ${(100 * minX / w).toFixed(1)}–${(100 * maxX / w).toFixed(1)}%  y ${(100 * minY / h).toFixed(1)}–${(100 * maxY / h).toFixed(1)}%`);
}

// --- generate -------------------------------------------------------------
const DRAWABLE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const MIPMAP = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const STAT = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

function write(name, size, rgba) {
  const p = path.join(RES, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, encodePNG(size, size, rgba));
}

const { w, h, rgba } = decodePNG(fs.readFileSync(SRC));
diagnose(w, h, rgba);

let count = 0;
for (const [dpi, size] of Object.entries(DRAWABLE)) {
  write(`drawable-${dpi}/ic_launcher_foreground.png`, size, resize(rgba, w, h, size));
  write(`drawable-${dpi}/ic_launcher_monochrome.png`, size, silhouette(rgba, w, h, size));
  count += 2;
}
for (const [dpi, size] of Object.entries(MIPMAP)) {
  write(`mipmap-${dpi}/ic_launcher.png`, size, resize(rgba, w, h, size));
  const round = resize(rgba, w, h, size);
  applyCircle(round, size);
  write(`mipmap-${dpi}/ic_launcher_round.png`, size, round);
  count += 2;
}
for (const [dpi, size] of Object.entries(STAT)) {
  write(`drawable-${dpi}/ic_stat_stronghold.png`, size, silhouette(rgba, w, h, size));
  count += 1;
}

console.log(`[make-icon] wrote ${count} PNGs under ${RES}`);
console.log('[make-icon] remember: set colors.xml ic_launcher_background to the border-ring color above (see suggested hex).');
