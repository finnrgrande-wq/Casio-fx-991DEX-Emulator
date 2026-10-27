// Generates the PWA icons (original artwork: a stylized calculator) into public/icons/.
// Run: node scripts/build-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const C = {
  bg: '#e4e8df',        // full-bleed background (maskable / apple)
  bgDark: '#cfd6c8',
  body: '#2b2d31',
  bodyEdge: '#44474d',
  lcdFrame: '#17181b',
  lcd: '#c9d6c1',
  ink: '#1f2a1c',
  key: '#e9e7e1',
  keyShade: '#bdbab0',
  keyAccent: '#e3a857',
  keyEq: '#79b895',
};

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// LCD content: radical sign + empty box ("√▫"), as dot-matrix pixels (16 x 8).
const LCD_PIXELS = [
  '......#########.',
  '......##........',
  '.....##..#####..',
  '.....##..#...#..',
  '#...##...#...#..',
  '##..##...#...#..',
  '.#####...#...#..',
  '..###....#####..',
];

/**
 * Draws the calculator centred in a size x size canvas.
 * opts.w / opts.h : body size as a fraction of `size`
 * opts.simple     : fewer details (favicon)
 */
function drawCalc(ctx, size, { w, h, simple = false }) {
  const bw = size * w, bh = size * h;
  const bx = (size - bw) / 2, by = (size - bh) / 2;
  const rad = bw * 0.11;

  // soft drop shadow
  if (!simple) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = size * 0.03;
    ctx.shadowOffsetY = size * 0.012;
    ctx.fillStyle = C.body;
    rr(ctx, bx, by, bw, bh, rad); ctx.fill();
    ctx.restore();
  }
  // body
  ctx.fillStyle = C.body;
  rr(ctx, bx, by, bw, bh, rad); ctx.fill();
  if (!simple) {
    ctx.lineWidth = Math.max(1, size * 0.006);
    ctx.strokeStyle = C.bodyEdge;
    rr(ctx, bx + ctx.lineWidth / 2, by + ctx.lineWidth / 2, bw - ctx.lineWidth, bh - ctx.lineWidth, rad); ctx.stroke();
  }

  const pad = bw * (simple ? 0.12 : 0.085);
  // LCD
  const lx = bx + pad, ly = by + pad;
  const lw = bw - pad * 2, lh = bh * (simple ? 0.27 : 0.25);
  ctx.fillStyle = C.lcdFrame;
  rr(ctx, lx, ly, lw, lh, rad * 0.45); ctx.fill();
  const ip = lw * 0.04;
  ctx.fillStyle = C.lcd;
  rr(ctx, lx + ip, ly + ip, lw - ip * 2, lh - ip * 2, rad * 0.3); ctx.fill();

  // LCD pixels
  const cols = LCD_PIXELS[0].length, rows = LCD_PIXELS.length;
  const innerW = lw - ip * 2, innerH = lh - ip * 2;
  const cell = Math.min((innerW * 0.78) / cols, (innerH * 0.8) / rows);
  const px0 = lx + ip + (innerW - cell * cols) / 2 + innerW * 0.03;
  const py0 = ly + ip + (innerH - cell * rows) / 2;
  ctx.fillStyle = C.ink;
  const gap = simple ? 0 : Math.max(0.6, cell * 0.1);
  LCD_PIXELS.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '#') ctx.fillRect(px0 + i * cell, py0 + j * cell, cell - gap, cell - gap);
  }));

  // keys: 4 columns x rows
  const kTop = ly + lh + bh * 0.055;
  const kBottom = by + bh - pad;
  const kCols = 4, kRows = simple ? 3 : 4;
  const kGapX = bw * (simple ? 0.05 : 0.045), kGapY = bh * (simple ? 0.04 : 0.032);
  const kw = (lw - kGapX * (kCols - 1)) / kCols;
  const kh = (kBottom - kTop - kGapY * (kRows - 1)) / kRows;
  for (let r = 0; r < kRows; r++) {
    for (let c = 0; c < kCols; c++) {
      const x = lx + c * (kw + kGapX), y = kTop + r * (kh + kGapY);
      const last = r === kRows - 1;
      ctx.fillStyle = (r === 0 && c === kCols - 1) ? C.keyAccent : (last && c === kCols - 1) ? C.keyEq : C.key;
      if (!simple) {
        ctx.fillStyle = C.keyShade;
        rr(ctx, x, y + kh * 0.08, kw, kh, kh * 0.28); ctx.fill();
        ctx.fillStyle = (r === 0 && c === kCols - 1) ? C.keyAccent : (last && c === kCols - 1) ? C.keyEq : C.key;
      }
      rr(ctx, x, y, kw, kh * (simple ? 1 : 0.92), kh * 0.28); ctx.fill();
    }
  }
}

function render({ size, bg, w, h, simple = false, name }) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (bg === 'full') {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, C.bg); g.addColorStop(1, C.bgDark);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  }
  drawCalc(ctx, size, { w, h, simple });
  fs.writeFileSync(path.join(outDir, name), canvas.toBuffer('image/png'));
  console.log('wrote', path.relative(root, path.join(outDir, name)));
}

// "any" icons: transparent background, calculator fills most of the canvas.
render({ size: 192, bg: 'none', w: 0.66, h: 0.86, name: 'icon-192.png' });
render({ size: 512, bg: 'none', w: 0.66, h: 0.86, name: 'icon-512.png' });
// maskable: full-bleed background, content inside the central safe zone.
render({ size: 512, bg: 'full', w: 0.52, h: 0.68, name: 'icon-maskable-512.png' });
// apple touch icon: opaque, slightly larger content (iOS rounds the corners itself).
render({ size: 180, bg: 'full', w: 0.58, h: 0.76, name: 'apple-touch-icon-180.png' });
// favicon: simplified.
render({ size: 32, bg: 'none', w: 0.74, h: 0.94, simple: true, name: 'favicon-32.png' });
