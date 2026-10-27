// Entwicklerhilfe: listet Zeichen aus Menütexten, die in den Pixelschriften fehlen.
import { CONST_CATEGORIES } from '../src/data/constants';
import { CONV_CATEGORIES } from '../src/data/conversions';
import { LARGE_FONT } from '../src/display/fonts/large';
import { SMALL_FONT } from '../src/display/fonts/small';
import { splitGlyphs } from '../src/display/framebuffer';

const texts = [
  ...CONST_CATEGORIES.flatMap((c) => [c.title, ...c.items.map((i) => i.symbol)]),
  ...CONV_CATEGORIES.flatMap((c) => [c.title, ...c.items.map((i) => i.label)]),
];
for (const [name, font] of [['L', LARGE_FONT], ['S', SMALL_FONT]] as const) {
  const missing = new Set<string>();
  for (const t of texts) for (const g of splitGlyphs(t)) if (!font.glyphs[g]) missing.add(g);
  console.log(name, [...missing].join(' ') || '(keine)');
}
