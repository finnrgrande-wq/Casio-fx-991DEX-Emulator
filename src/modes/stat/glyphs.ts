// Zeichen der Statistik (x̄, ȳ, x̂, ŷ, ⁴), die die Pixelschriften nicht mitbringen.
// Sie werden aus vorhandenen Glyphen abgeleitet und nur ergänzt, falls die Schrift sie nicht selbst enthält.

import { LARGE_FONT } from '../../display/fonts/large';
import { SMALL_FONT } from '../../display/fonts/small';
import type { Glyph, PixelFont } from '../../display/types';

function add(font: PixelFont, key: string, glyph: Glyph | undefined): void {
  const glyphs = font.glyphs as Record<string, Glyph>;
  if (glyph && !glyphs[key]) glyphs[key] = glyph;
}

/** Kopie von `base`, bei der einzelne Zeilen ersetzt sind. */
function patched(base: Glyph | undefined, rows: Record<number, string>): Glyph | undefined {
  return base && { w: base.w, rows: base.rows.map((r, i) => rows[i] ?? r) };
}

let done = false;

export function registerStatGlyphs(): void {
  if (done) return;
  done = true;
  const g = LARGE_FONT.glyphs;
  for (const ch of ['x', 'y']) {
    add(LARGE_FONT, `${ch}̄`, patched(g[ch], { 3: '..#######..' }));
    add(LARGE_FONT, `${ch}̂`, patched(g[ch], { 2: '.....#.....', 3: '....#.#....' }));
  }
  add(LARGE_FONT, '⁴', patched(g['³'], {
    2: '....##.....', 3: '...#.#.....', 4: '..#..#.....', 5: '..#####....', 6: '.....#.....', 7: '.....#.....', 8: '.....#.....',
  }));
  add(SMALL_FONT, '⁴', patched(SMALL_FONT.glyphs['³'], { 0: '#.#', 1: '#.#', 2: '###', 3: '..#' }));
}
