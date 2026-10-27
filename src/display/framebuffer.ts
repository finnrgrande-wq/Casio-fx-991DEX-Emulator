// 1-Bit-Framebuffer der LCD-Punktmatrix und Rasterung einer Scene.

import { LARGE_FONT } from './fonts/large';
import { SMALL_FONT } from './fonts/small';
import type { DrawOp, FontId, Scene } from './scene';
import { LCD_HEIGHT, LCD_WIDTH, type Bitmap, type Glyph, type PixelFont } from './types';

export const FONTS: Record<FontId, PixelFont> = { L: LARGE_FONT, S: SMALL_FONT };

/** Zerlegt Text in Glyph-Schlüssel; kombinierende Zeichen (z. B. Überstrich U+0304) bleiben am Basiszeichen. */
export function splitGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    if (/\p{M}/u.test(ch) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

function glyphFor(font: PixelFont, key: string): Glyph {
  return font.glyphs[key] ?? font.glyphs['?'] ?? { w: 1, rows: Array(font.height).fill('.') };
}

function advanceOf(font: PixelFont, g: Glyph): number {
  return font.advance ?? g.w + font.spacing;
}

export function textWidth(text: string, fontId: FontId): number {
  const font = FONTS[fontId];
  const keys = splitGlyphs(text);
  let w = 0;
  for (const k of keys) w += advanceOf(font, glyphFor(font, k));
  // Der Zeichenabstand nach dem letzten Glyph zählt nicht zur sichtbaren Breite.
  return font.advance === undefined && keys.length > 0 ? w - font.spacing : w;
}

export class Framebuffer {
  readonly pixels: Uint8Array;

  constructor(
    readonly width = LCD_WIDTH,
    readonly height = LCD_HEIGHT,
  ) {
    this.pixels = new Uint8Array(width * height);
  }

  clear(): void {
    this.pixels.fill(0);
  }

  get(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.pixels[y * this.width + x] === 1;
  }

  set(x: number, y: number, on = true): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = on ? 1 : 0;
  }

  fillRect(x: number, y: number, w: number, h: number, on = true): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, on);
  }

  invertRect(x: number, y: number, w: number, h: number): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, !this.get(i, j));
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.line(x, y, x + w - 1, y);
    this.line(x, y + h - 1, x + w - 1, y + h - 1);
    this.line(x, y, x, y + h - 1);
    this.line(x + w - 1, y, x + w - 1, y + h - 1);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    // Bresenham
    const dx = Math.abs(x2 - x1);
    const dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x1, y1);
      if (x1 === x2 && y1 === y2) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  bitmap(x: number, y: number, bmp: Bitmap, invert = false): void {
    bmp.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const on = row[i] === '#';
        if (invert) this.set(x + i, y + j, !on);
        else if (on) this.set(x + i, y + j);
      }
    });
  }

  /** Zeichnet Text; y ist die Oberkante der Glyph-Zelle. Liefert die Breite. */
  text(x: number, y: number, text: string, fontId: FontId, invert = false): number {
    const font = FONTS[fontId];
    let cx = x;
    for (const key of splitGlyphs(text)) {
      const g = glyphFor(font, key);
      const adv = advanceOf(font, g);
      if (invert) this.fillRect(cx, y, adv, font.height);
      g.rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') this.set(cx + i, y + j, !invert);
      });
      cx += adv;
    }
    return cx - x;
  }

  draw(op: DrawOp): void {
    switch (op.kind) {
      case 'text': {
        const x = op.align === 'right' ? op.x - textWidth(op.text, op.font) : op.x;
        this.text(x, op.y, op.text, op.font, op.invert);
        return;
      }
      case 'rect':
        if (op.erase) this.fillRect(op.x, op.y, op.w, op.h, false);
        else if (op.invert) this.invertRect(op.x, op.y, op.w, op.h);
        else if (op.fill) this.fillRect(op.x, op.y, op.w, op.h);
        else this.strokeRect(op.x, op.y, op.w, op.h);
        return;
      case 'bitmap':
        this.bitmap(op.x, op.y, op.bitmap, op.invert);
        return;
      case 'line':
        this.line(op.x1, op.y1, op.x2, op.y2);
    }
  }

  render(scene: Scene): void {
    this.clear();
    for (const op of scene.ops) this.draw(op);
  }
}
