// Erzeugt src/display/fonts/large.ts: die große LCD-Schrift (11×16 Punkte, Monospace).
//
// Quelle: Courier Prime (SIL Open Font License 1.1, siehe LICENSE-FONTS.md),
// gerastert mit @napi-rs/canvas, auf 1 Bit geschwellt und nachbearbeitet.
// Glyphen, die Courier Prime nicht enthält (Griechisch, Rechenzeichen, Pfeile …),
// sind in OVERRIDES von Hand gezeichnet.
//
// Aufruf: npm run font
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'courier-prime', 'files');
const OUT_FILE = path.join(ROOT, 'src', 'display', 'fonts', 'large.ts');

// ---------------------------------------------------------------------------
// Parameter
// ---------------------------------------------------------------------------
const CELL_W = 11; // Zellbreite inkl. Zeichenabstand (Spalte 10 bleibt möglichst leer)
const HEIGHT = 16;
const BASELINE = 12; // unterste Zeile von Großbuchstaben/Ziffern
/** Schriftgröße in px: Versalhöhe 0,58 em → genau 10 Zeilen (Zeilen 3..12). */
const FONT_SIZE = 17.24;
/** Horizontale Streckung (1 = Courier-Prime-Vorschub 0,6 em → 10,3 px). */
const SCALE_X_CANDIDATES = [1.0, 0.97, 0.94];
/** Teilpixel-Verschiebungen in x, aus denen pro Glyph die beste gewählt wird. */
const DX_CANDIDATES = [];
for (let i = -6; i <= 8; i++) DX_CANDIDATES.push(i / 10);
/** Schwellwerte (Flächenanteil eines Punkts, ab dem er „an“ ist). */
/** Vertikale Teilpixel-Verschiebungen (Rundungen überschwingen sonst in Zeile 13). */
const DY_CANDIDATES = [-0.25, -0.12, 0];
const THRESHOLDS = [0.45, 0.5, 0.55];
const SS = 8; // Supersampling je Achse
const MARGIN = 3; // zusätzliche Spalten links/rechts beim Rastern

// ---------------------------------------------------------------------------
// Zeichen, die gerastert werden
// ---------------------------------------------------------------------------
const RASTER_CHARS = [];
for (let c = 0x20; c <= 0x7e; c++) RASTER_CHARS.push(String.fromCharCode(c));
RASTER_CHARS.push(...'ÄÖÜäöüßÅ×÷−±°′″·µ¹²³');

/** Kursive Variablen: Zeichen → Basisbuchstabe in Courier Prime Italic. */
const ITALIC = { '𝑥': 'x', '𝑦': 'y' };

// ---------------------------------------------------------------------------
// Handgezeichnete Glyphen
// ---------------------------------------------------------------------------
/** Zeilen ab `start` in die 16-Zeilen-Zelle einsetzen (Rest leer). */
const at = (start, rows) => {
  const out = Array.from({ length: HEIGHT }, () => '');
  rows.forEach((r, i) => {
    out[start + i] = r;
  });
  return out;
};

/**
 * Handgezeichnete Glyphen: Zeichen → 16 Zeilen (oder Funktion `(get) => Zeilen`,
 * wobei get(ch) die fertige Bitmap eines anderen Zeichens liefert).
 * Zeilen dürfen kürzer als 11 sein (rechts wird mit '.' aufgefüllt).
 * Grundlinie = Zeile 12, Versalhöhe Zeilen 3..12, x-Höhe Zeilen 5..12.
 */
const OVERRIDES = {
  // --- Pixelgrafik von Hand -------------------------------------------------
  '"': at(3, ['...#...#...', '...#...#...', '...#...#...']),
  Å: (get) => {
    const a = get('A').slice();
    a[0] = '....##.....';
    a[1] = '...#..#....';
    a[2] = '....##.....';
    return a;
  },
  'μ': (get) => get('µ'), // Griechisches my = Mikro-Zeichen
  'π': at(5, [
    '.#########.',
    '..#....#...',
    '..#....#...',
    '..#....#...',
    '..#....#...',
    '..#....#...',
    '..#....#...',
    '..#....##..',
  ]),
  '√': at(3, [
    '.....######',
    '.....#.....',
    '.....#.....',
    '....#......',
    '....#......',
    '....#......',
    '#...#......',
    '.#..#......',
    '..##.......',
    '...#.......',
  ]),
  '∫': at(1, [
    '.....###...',
    '....#...#..',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '....#......',
    '#...#......',
    '.###.......',
  ]),
  '∠': at(5, [
    '.......#...',
    '......#....',
    '.....#.....',
    '....#......',
    '...#.......',
    '..#........',
    '.#.........',
    '.#########.',
  ]),
  '≈': (get) => {
    const t = get('~');
    const out = Array(HEIGHT).fill('.'.repeat(CELL_W));
    out[5] = t[7];
    out[6] = t[8];
    out[9] = t[7];
    out[10] = t[8];
    return out;
  },
  '≠': (get) => {
    const out = get('=').map((r) => r.split(''));
    for (let r = 4; r <= 11; r++) out[r][Math.round(7 - (r - 4) * (4 / 7))] = '#';
    return out.map((r) => r.join(''));
  },
  '≤': at(4, [
    '........#..',
    '......##...',
    '....##.....',
    '..##.......',
    '....##.....',
    '......##...',
    '........#..',
    '...........',
    '..#######..',
  ]),
  '≥': at(4, [
    '..#........',
    '...##......',
    '.....##....',
    '.......##..',
    '.....##....',
    '...##......',
    '..#........',
    '...........',
    '..#######..',
  ]),
  '←': at(6, ['...#.......', '..#........', '.#########.', '..#........', '...#.......']),
  '→': at(6, ['.......#...', '........#..', '.#########.', '........#..', '.......#...']),
  '⇔': at(6, [
    '...#...#...',
    '..#######..',
    '.#.......#.',
    '..#######..',
    '...#...#...',
  ]),
  '‾': at(1, ['###########']),
  '⁻': at(5, ['..######...']),
  '⌟': at(7, ['......#....', '......#....', '......#....', '......#....', '......#....', '...####....']),
  'ʳ': at(2, ['...#.##....', '...##......', '...#.......', '...#.......', '...#.......']),
  'ᵍ': at(2, ['....####...', '...#...#...', '...#...#...', '....####...', '.......#...', '....###....']),
  'ⁿ': at(4, ['..####.....', '..#...#....', '..#...#....', '..#...#....', '..#...#....']),
  '□': at(3, [
    '..#######..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#######..',
  ]),
  'θ': at(3, [
    '...#####...',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#######..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '..#.....#..',
    '...#####...',
  ]),
  '∞': at(6, [
    '..##...##..',
    '.#..#.#..#.',
    '.#...#...#.',
    '.#..#.#..#.',
    '..##...##..',
  ]),
  '▶': at(4, [
    '.#.........',
    '.###.......',
    '.#####.....',
    '.#######...',
    '.########..',
    '.#######...',
    '.#####.....',
    '.###.......',
    '.#.........',
  ]),
  '◀': at(4, [
    '.........#.',
    '.......###.',
    '.....#####.',
    '...#######.',
    '..########.',
    '...#######.',
    '.....#####.',
    '.......###.',
    '.........#.',
  ]),
  '▸': at(6, ['...#.......', '...###.....', '...#####...', '...###.....', '...#.......']),
  '▲': at(5, [
    '.....#.....',
    '....###....',
    '....###....',
    '...#####...',
    '...#####...',
    '..#######..',
    '..#######..',
    '.#########.',
  ]),
  '▼': at(5, [
    '.#########.',
    '..#######..',
    '..#######..',
    '...#####...',
    '...#####...',
    '....###....',
    '....###....',
    '.....#.....',
  ]),
  '■': at(5, Array(8).fill('.########..')),
  'ε': at(5, [
    '...#####...',
    '..#.....#..',
    '..#........',
    '...####....',
    '..#........',
    '..#........',
    '..#.....#..',
    '...#####...',
  ]),
};

// ---------------------------------------------------------------------------
// Vektorglyphen: werden mit demselben Raster-/Schwellverfahren in Punkte umgesetzt.
// Koordinaten in Punkten; Mittelpunkt von Punkt (Spalte c, Zeile r) = (c + 0,5; r + 0,5).
// ---------------------------------------------------------------------------
const ln = (c, x1, y1, x2, y2) => {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
};
const ell = (c, cx, cy, rx, ry) => {
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.stroke();
};
const poly = (c, pts, fill = false) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) c.fill();
  else c.stroke();
};

const VECTOR = {
  'σ': {
    draw: (c) => {
      ell(c, 4.5, 9, 3, 3.5);
      ln(c, 4.5, 5.5, 9.5, 5.5);
    },
  },
  'α': {
    draw: (c) => {
      ell(c, 4.5, 9, 3, 3.5);
      ln(c, 7.5, 5.5, 7.5, 12.5);
      ln(c, 7.5, 12.5, 9.5, 12.5);
    },
  },
  'ρ': {
    draw: (c) => {
      ell(c, 5.5, 9, 3, 3.5);
      ln(c, 2.5, 7.5, 2.5, 15.5);
    },
  },
  'γ': {
    draw: (c) => {
      ln(c, 1.5, 5.5, 5.5, 11.5);
      ln(c, 9.5, 5.5, 5.5, 11.5);
      ln(c, 5.5, 11.5, 4.5, 15.5);
    },
  },
  'λ': {
    draw: (c) => {
      ln(c, 1.5, 3.5, 8.5, 12.5);
      ln(c, 4.9, 8.1, 2.5, 12.5);
    },
  },
  'Δ': {
    draw: (c) => {
      c.lineJoin = 'bevel';
      poly(c, [
        [5.5, 3.5],
        [9.5, 12.5],
        [1.5, 12.5],
      ]);
    },
  },
  'Ω': {
    draw: (c) => {
      c.beginPath();
      c.moveTo(1.5, 12.5);
      c.lineTo(3.5, 12.5);
      c.ellipse(5.5, 7.5, 4, 4, 0, 2.2, Math.PI * 2 + 0.94, false);
      c.lineTo(7.5, 12.5);
      c.lineTo(9.5, 12.5);
      c.stroke();
    },
  },
  'Φ': {
    draw: (c) => {
      ln(c, 5.5, 3.5, 5.5, 12.5);
      ell(c, 5.5, 8, 4, 2.5);
      ln(c, 3.5, 3.5, 7.5, 3.5);
      ln(c, 3.5, 12.5, 7.5, 12.5);
    },
  },
  'Σ': {
    draw: (c) => {
      ln(c, 1.5, 3.5, 9.5, 3.5);
      ln(c, 1.5, 12.5, 9.5, 12.5);
      c.beginPath();
      c.moveTo(1.5, 3.5);
      c.lineTo(5.5, 7.5);
      c.lineTo(1.5, 12.5);
      c.stroke();
      ln(c, 9.5, 3.5, 9.5, 4.5);
      ln(c, 9.5, 11.5, 9.5, 12.5);
    },
  },
  'Π': {
    draw: (c) => {
      ln(c, 1.5, 3.5, 9.5, 3.5);
      ln(c, 2.5, 3.5, 2.5, 12.5);
      ln(c, 8.5, 3.5, 8.5, 12.5);
      ln(c, 1.5, 12.5, 3.5, 12.5);
      ln(c, 7.5, 12.5, 9.5, 12.5);
    },
  },
};

// ---------------------------------------------------------------------------
// Rasterung
// ---------------------------------------------------------------------------
const FILES = {
  CPNormal: 'courier-prime-latin-400-normal.woff',
  CPItalic: 'courier-prime-latin-400-italic.woff',
};
for (const [family, file] of Object.entries(FILES)) {
  const p = path.join(FONT_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Schriftdatei fehlt: ${p}`);
  if (!GlobalFonts.registerFromPath(p, family)) throw new Error(`Kann ${file} nicht laden`);
}

const WIDE = CELL_W + 2 * MARGIN;

/**
 * Skia setzt die Grundlinie nicht exakt dort, wo man sie angibt. Wir messen daher einmal,
 * wo die Unterkante von „H“ landet, und verschieben so, dass sie genau auf Zeile BASELINE endet.
 */
function calibrateBaseline() {
  const canvas = createCanvas(WIDE * SS, HEIGHT * SS);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = `${FONT_SIZE}px CPNormal`;
  ctx.setTransform(SS, 0, 0, SS, MARGIN * SS, (BASELINE + 1) * SS);
  ctx.fillText('H', 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4] > 128) bottom = y + 1;
  }
  return (BASELINE + 1) - bottom / SS;
}
const BASE_SHIFT = calibrateBaseline();

/** Zeichnet ein Zeichen und liefert die Flächenanteile je Punkt (Float32Array WIDE×HEIGHT). */
function coverage(ch, family, dx, dy, sx) {
  const canvas = createCanvas(WIDE * SS, HEIGHT * SS);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = `${FONT_SIZE}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.setTransform(SS * sx, 0, 0, SS, (MARGIN + dx) * SS, (BASELINE + 1 + BASE_SHIFT + dy) * SS);
  ctx.fillText(ch, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const cov = new Float32Array(WIDE * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDE; x++) {
      let sum = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          sum += data[((y * SS + j) * canvas.width + (x * SS + i)) * 4];
        }
      }
      cov[y * WIDE + x] = sum / (255 * SS * SS);
    }
  }
  return cov;
}

function components(bits, w, h) {
  const seen = new Uint8Array(w * h);
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!bits[s] || seen[s]) continue;
    n++;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dxx = -1; dxx <= 1; dxx++) {
          const nx = px + dxx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (bits[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
  }
  return n;
}

/** Bewertet eine Schwellung: kleiner = besser. */
function cost(cov, thr) {
  const bits = new Uint8Array(WIDE * HEIGHT);
  let err = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDE; x++) {
      const v = cov[y * WIDE + x];
      const on = v >= thr;
      bits[y * WIDE + x] = on ? 1 : 0;
      const inside = x >= MARGIN && x < MARGIN + CELL_W;
      // Abweichung von der „wahren“ Form; Tinte außerhalb der Zelle zählt dreifach.
      err += Math.abs((on ? 1 : 0) - v) * (inside ? 1 : 3);
      // Spalte 10 (Zeichenabstand) möglichst leer lassen.
      if (on && x === MARGIN + CELL_W - 1) err += 1.5;
      // Schwache Punkte (Überschwinger, Ausläufer) meiden, unter der Grundlinie besonders.
      if (on && v < 0.6) err += y > BASELINE ? 2 : 0.4;
    }
  }
  // Streifen/Lücken: Zahl der Zusammenhangskomponenten soll zur feinen Referenz passen.
  const ref = new Uint8Array(WIDE * HEIGHT);
  for (let i = 0; i < ref.length; i++) ref[i] = cov[i] >= 0.2 ? 1 : 0;
  err += 2.5 * Math.abs(components(bits, WIDE, HEIGHT) - components(ref, WIDE, HEIGHT));
  // Klumpen: volle 2×2-Blöcke vermeiden (Strichstärke ~1 px).
  for (let y = 0; y < HEIGHT - 1; y++) {
    for (let x = 0; x < WIDE - 1; x++) {
      const i = y * WIDE + x;
      if (bits[i] && bits[i + 1] && bits[i + WIDE] && bits[i + WIDE + 1]) {
        const full = cov[i] > 0.92 && cov[i + 1] > 0.92 && cov[i + WIDE] > 0.92 && cov[i + WIDE + 1] > 0.92;
        err += full ? 0.2 : 0.9;
      }
    }
  }
  return { err, bits };
}

function rasterize(ch, family) {
  let best = null;
  for (const sx of SCALE_X_CANDIDATES) {
    for (const dx of DX_CANDIDATES) {
     for (const dy of DY_CANDIDATES) {
      const cov = coverage(ch, family, dx, dy, sx);
      for (const thr of THRESHOLDS) {
        const c = cost(cov, thr);
        // Leichte Bevorzugung des Standardmaßstabs und kleiner Verschiebungen.
        const err = c.err + (1 - sx) * 20 + Math.abs(dx) * 0.4 + Math.abs(dy) * 1;
        if (!best || err < best.err) best = { err, bits: c.bits, dx, dy, sx, thr };
      }
     }
    }
  }
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    let s = '';
    for (let x = 0; x < CELL_W; x++) s += best.bits[y * WIDE + MARGIN + x] ? '#' : '.';
    rows.push(s);
  }
  return { rows, info: best };
}

function rasterizeVector(spec) {
  const canvas = createCanvas(CELL_W * SS, HEIGHT * SS);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  spec.draw(ctx);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const thr = spec.thr ?? 0.4;
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    let s = '';
    for (let x = 0; x < CELL_W; x++) {
      let sum = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) sum += data[((y * SS + j) * canvas.width + (x * SS + i)) * 4];
      s += sum / (255 * SS * SS) >= thr ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Zusammenbau
// ---------------------------------------------------------------------------
function normalize(rows, ch) {
  if (rows.length !== HEIGHT) throw new Error(`Glyph ${ch}: ${rows.length} statt ${HEIGHT} Zeilen`);
  return rows.map((r) => {
    if (r.length > CELL_W) throw new Error(`Glyph ${ch}: Zeile "${r}" länger als ${CELL_W}`);
    if (/[^#.]/.test(r)) throw new Error(`Glyph ${ch}: ungültige Zeichen in "${r}"`);
    return r.padEnd(CELL_W, '.');
  });
}

const done = new Map();
const infos = new Map();
const get = (ch) => {
  if (done.has(ch)) return done.get(ch);
  if (ch in OVERRIDES) {
    const o = OVERRIDES[ch];
    const rows = normalize(typeof o === 'function' ? o(get) : o, ch);
    done.set(ch, rows);
    return rows;
  }
  if (ch in VECTOR) {
    const rows = rasterizeVector(VECTOR[ch]);
    done.set(ch, rows);
    return rows;
  }
  if (ch in ITALIC) {
    const r = rasterize(ITALIC[ch], 'CPItalic');
    infos.set(ch, r.info);
    done.set(ch, r.rows);
    return r.rows;
  }
  if (RASTER_CHARS.includes(ch)) {
    const r = ch === ' ' ? { rows: Array(HEIGHT).fill('.'.repeat(CELL_W)), info: null } : rasterize(ch, 'CPNormal');
    if (r.info) infos.set(ch, r.info);
    done.set(ch, r.rows);
    return r.rows;
  }
  throw new Error(`Kein Glyph für ${JSON.stringify(ch)} (weder gerastert noch Override)`);
};

const ORDER = [...new Set([...RASTER_CHARS, ...Object.keys(ITALIC), ...Object.keys(VECTOR), ...Object.keys(OVERRIDES)])];
const lines = [];
lines.push('// Generiert von scripts/build-font.mjs aus Courier Prime (SIL Open Font License 1.1) – nachbearbeitet.');
lines.push("import type { PixelFont } from '../types';");
lines.push('');
lines.push(`export const LARGE_FONT: PixelFont = {`);
lines.push(`  height: ${HEIGHT},`);
lines.push(`  baseline: ${BASELINE},`);
lines.push('  spacing: 0,');
lines.push(`  advance: ${CELL_W},`);
lines.push('  glyphs: {');
for (const ch of ORDER) {
  const rows = get(ch);
  const key = JSON.stringify(ch).replace(/^"|"$/g, '');
  const name = ch.codePointAt(0) > 0xffff ? `\\u{${ch.codePointAt(0).toString(16)}}` : key;
  lines.push(`    '${name.replace(/'/g, "\\'")}': {`);
  lines.push(`      w: ${CELL_W},`);
  lines.push('      rows: [');
  for (const r of rows) lines.push(`        '${r}',`);
  lines.push('      ],');
  lines.push('    },');
}
lines.push('  },');
lines.push('};');
lines.push('');
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');

console.log(`${ORDER.length} Glyphen -> ${path.relative(ROOT, OUT_FILE)}`);
console.log(`Schrift ${FONT_SIZE}px, Streckung ${SCALE_X_CANDIDATES.join('/')}, Schwellen ${THRESHOLDS.join('/')}`);
console.log(`Handgezeichnet: ${[...Object.keys(VECTOR), ...Object.keys(OVERRIDES)].join(' ') || '-'}`);
