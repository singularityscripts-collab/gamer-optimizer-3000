// Gera build/icon.png e build/icon.ico sem dependências externas.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const buf = Buffer.alloc(S * S * 4);
const bolt = [[150, 30], [66, 144], [118, 144], [100, 226], [190, 108], [138, 108]];

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function roundRectAlpha(x, y, r) {
  const cx = Math.abs(x - S / 2) - (S / 2 - 8 - r);
  const cy = Math.abs(y - S / 2) - (S / 2 - 8 - r);
  const d = Math.hypot(Math.max(cx, 0), Math.max(cy, 0)) + Math.min(Math.max(cx, cy), 0) - r;
  return Math.min(1, Math.max(0, 0.5 - d));
}
const A = [124, 58, 237], B = [6, 182, 212];
for (let py = 0; py < S; py++) {
  for (let px = 0; px < S; px++) {
    let a = 0, boltCov = 0;
    const N = 3;
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      const x = px + (sx + 0.5) / N, y = py + (sy + 0.5) / N;
      a += roundRectAlpha(x, y, 56);
      if (inPoly(x, y, bolt)) boltCov++;
    }
    a /= N * N; boltCov /= N * N;
    const t = (px + py) / (2 * S);
    let rgb = A.map((v, i) => v + (B[i] - v) * t);
    rgb = rgb.map((v) => v + (255 - v) * boltCov);
    const o = (py * S + px) * 4;
    buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = Math.round(a * 255);
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico[8] = 0; ico[9] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png);
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([ico, png]));
console.log('Ícones gerados em', out);
