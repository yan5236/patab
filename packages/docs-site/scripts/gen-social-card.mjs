// One-off generator for static/img/social-card.png (pure Node, no deps).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1200, H = 630;
const data = Buffer.alloc(W * H * 3);

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// Brand gradient: deep blue (top-left) -> teal (bottom-right)
const cA = [38, 92, 196];   // #265cc4
const cB = [38, 178, 170];  // #26b2aa
// Accent glow colors
const glowTeal = [90, 220, 210];
const glowPurple = [150, 130, 250];

function roundedRect(x, y, w, h, r, color, alpha) {
  for (let j = Math.max(0, y | 0); j < Math.min(H, y + h); j++) {
    for (let i = Math.max(0, x | 0); i < Math.min(W, x + w); i++) {
      const dx = Math.max(x + r - i, 0, i - (x + w - r - 1));
      const dy = Math.max(y + r - j, 0, j - (y + h - r - 1));
      if (dx * dx + dy * dy <= r * r) {
        const o = (j * W + i) * 3;
        for (let k = 0; k < 3; k++) data[o + k] = lerp(data[o + k], color[k], alpha);
      }
    }
  }
}

// Base gradient + soft glows
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const t = (i / W + j / H) / 2;
    let [r, g, b] = mix(cA, cB, t);
    // teal glow top-right
    let d = Math.hypot(i - W * 0.85, j - H * 0.15) / (W * 0.5);
    let gA = Math.max(0, 1 - d) ** 2 * 0.35;
    r = lerp(r, glowTeal[0], gA); g = lerp(g, glowTeal[1], gA); b = lerp(b, glowTeal[2], gA);
    // purple glow bottom-left
    d = Math.hypot(i - W * 0.12, j - H * 0.9) / (W * 0.45);
    gA = Math.max(0, 1 - d) ** 2 * 0.3;
    r = lerp(r, glowPurple[0], gA); g = lerp(g, glowPurple[1], gA); b = lerp(b, glowPurple[2], gA);
    const o = (j * W + i) * 3;
    data[o] = r; data[o + 1] = g; data[o + 2] = b;
  }
}

// Widget-tile mosaic on the right, echoing the PaTab logo grid
const white = [255, 255, 255];
roundedRect(760, 130, 340, 84, 40, white, 0.28);           // search bar
const tileColors = [
  [139, 195, 240], [94, 216, 206], [170, 152, 250], [140, 190, 235],
  [245, 165, 105], [250, 205, 110], [235, 245, 252], [200, 170, 240],
];
let idx = 0;
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 4; col++) {
    roundedRect(760 + col * 92, 240 + row * 100, 76, 76, 20, tileColors[idx++], 0.85);
  }
}
// todo-card
roundedRect(760, 448, 248, 60, 16, white, 0.3);

// PNG encode
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, payload) {
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type), payload]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let j = 0; j < H; j++) {
  raw[j * (W * 3 + 1)] = 0; // filter: none
  data.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../static/img/social-card.png', import.meta.url), png);
console.log('social-card.png written:', png.length, 'bytes');
