// Gemeinsame Datenformate für Pixelgrafik (Schriften, Icons) und Framebuffer.

/** LCD-Punktmatrix: Breite × Höhe in Punkten. */
export const LCD_WIDTH = 192;
export const LCD_HEIGHT = 64;

/**
 * Ein Bitmap als Zeilen aus '#' (Punkt an) und '.' (Punkt aus).
 * Alle Zeilen haben dieselbe Länge.
 */
export type Bitmap = readonly string[];

/** Ein Glyph einer Pixelschrift. `rows.length` entspricht immer `PixelFont.height`. */
export interface Glyph {
  /** Breite der Bitmap in Punkten (ohne Zeichenabstand). */
  w: number;
  rows: Bitmap;
}

export interface PixelFont {
  /** Höhe jeder Glyph-Bitmap in Punkten. */
  height: number;
  /** Zeile (0-basiert) der Grundlinie: unterste Zeile von Großbuchstaben und Ziffern. */
  baseline: number;
  /** Abstand in Punkten, den der Renderer nach jedem Glyph einfügt. */
  spacing: number;
  /** Feste Vorschubbreite (Monospace) oder undefined für proportionale Schrift. */
  advance?: number;
  glyphs: Readonly<Record<string, Glyph>>;
}
