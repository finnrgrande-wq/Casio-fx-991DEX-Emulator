import { describe, expect, it } from 'vitest';
import { LARGE_FONT } from '../../src/display/fonts/large';

const REQUIRED =
  [...Array(0x7e - 0x20 + 1)].map((_, i) => String.fromCharCode(0x20 + i)).join('') +
  'ÄÖÜäöüß' +
  'π√∫ΣΠθ∠×÷−±≈≠≤≥°′″▸▶◀▲▼←→⇔·µσλαγεμρΩΔΦ∞Å‾■□¹²³⁻ⁿ' +
  '\u{1d465}\u{1d466}';

describe('LARGE_FONT', () => {
  it('hat die erwarteten Kenndaten', () => {
    expect(LARGE_FONT.height).toBe(16);
    expect(LARGE_FONT.baseline).toBe(12);
    expect(LARGE_FONT.advance).toBe(11);
    expect(LARGE_FONT.spacing).toBe(0);
  });

  it('enthält alle benötigten Zeichen', () => {
    const missing = [...REQUIRED].filter((ch) => !(ch in LARGE_FONT.glyphs));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(LARGE_FONT.glyphs))('Glyph %j ist wohlgeformt', (_ch, glyph) => {
    expect(glyph.w).toBe(11);
    expect(glyph.rows).toHaveLength(LARGE_FONT.height);
    for (const row of glyph.rows) {
      expect(row).toHaveLength(11);
      expect(row).toMatch(/^[#.]+$/);
    }
  });

  it('Großbuchstaben und Ziffern stehen auf der Grundlinie', () => {
    for (const ch of 'HEILMNTXZ0123456789') {
      const rows = LARGE_FONT.glyphs[ch].rows;
      expect(rows[LARGE_FONT.baseline], ch).toContain('#');
      expect(rows[LARGE_FONT.baseline + 1], ch).not.toContain('#');
    }
  });

  it('das Leerzeichen ist leer, sichtbare Zeichen haben Punkte', () => {
    expect(LARGE_FONT.glyphs[' '].rows.join('')).not.toContain('#');
    for (const ch of REQUIRED) {
      if (ch === ' ') continue;
      expect(LARGE_FONT.glyphs[ch].rows.join(''), ch).toContain('#');
    }
  });

  it('Spalte 10 bleibt bei den ASCII-Buchstaben und Ziffern frei', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
      for (const row of LARGE_FONT.glyphs[ch].rows) expect(row[10], ch).toBe('.');
    }
  });
});
