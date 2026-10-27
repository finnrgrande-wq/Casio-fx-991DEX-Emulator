import { describe, it, expect } from 'vitest';
import { SMALL_FONT } from '../../src/display/fonts/small';

const GERMAN = ['Ä', 'Ö', 'Ü', 'ä', 'ö', 'ü', 'ß'];

const MATH_UI = [
  'π', '√', '∫', 'Σ', 'Π', 'θ', '∠', '×', '÷', '−', '±', '≈', '≠', '≤', '≥', '°', '′', '″',
  '▸', '▶', '◀', '▲', '▼', '←', '→', '⇔', '·', '²', '³', '⁻', '¹', 'µ', 'σ', 'λ', 'α', 'γ',
  'ε', 'μ', 'ρ', 'Ω', 'Δ', 'Φ', '∞', 'Å', '‾', '∘', '■', '□', 'ⁿ', 'ᵢ', '⌟', 'ħ', 'τ',
  '\u{1D465}', '\u{1D466}', // 𝑥, 𝑦 (kursiv)
  '₁', '₂', '₃', '₄', // tiefgestellte Ziffern
  'x̄', 'ȳ', // x̄, ȳ
];

const ASCII: string[] = [];
for (let c = 0x20; c <= 0x7e; c++) ASCII.push(String.fromCharCode(c));

const entries = Object.entries(SMALL_FONT.glyphs);

describe('SMALL_FONT', () => {
  it('hat die erwarteten Kopfwerte', () => {
    expect(SMALL_FONT.height).toBe(8);
    expect(SMALL_FONT.baseline).toBe(6);
    expect(SMALL_FONT.spacing).toBe(1);
    expect(SMALL_FONT.advance).toBeUndefined();
  });

  it('jeder Glyph hat genau 8 Zeilen', () => {
    for (const [ch, g] of entries) {
      expect(g.rows.length, `Zeilenzahl von ${JSON.stringify(ch)}`).toBe(SMALL_FONT.height);
    }
  });

  it('jede Zeile ist genau w Zeichen lang (w >= 1)', () => {
    for (const [ch, g] of entries) {
      expect(g.w, `Breite von ${JSON.stringify(ch)}`).toBeGreaterThanOrEqual(1);
      for (const row of g.rows) {
        expect(row.length, `Zeilenlänge in ${JSON.stringify(ch)}: "${row}"`).toBe(g.w);
      }
    }
  });

  it("enthält nur '#' und '.'", () => {
    for (const [ch, g] of entries) {
      for (const row of g.rows) {
        expect(row, `Zeichen in ${JSON.stringify(ch)}`).toMatch(/^[#.]+$/);
      }
    }
  });

  it('alle Ziffern sind 5 Punkte breit', () => {
    for (const d of '0123456789') {
      expect(SMALL_FONT.glyphs[d], `Ziffer ${d}`).toBeDefined();
      expect(SMALL_FONT.glyphs[d]!.w).toBe(5);
    }
  });

  it('das Leerzeichen ist 3 Punkte breit und leer', () => {
    const sp = SMALL_FONT.glyphs[' ']!;
    expect(sp.w).toBe(3);
    expect(sp.rows.every((r) => !r.includes('#'))).toBe(true);
  });

  it('enthält alle druckbaren ASCII-Zeichen 0x20–0x7E', () => {
    for (const ch of ASCII) {
      expect(SMALL_FONT.glyphs[ch], `ASCII ${JSON.stringify(ch)}`).toBeDefined();
    }
  });

  it('enthält die deutschen Sonderzeichen', () => {
    for (const ch of GERMAN) {
      expect(SMALL_FONT.glyphs[ch], `Deutsch ${ch}`).toBeDefined();
    }
  });

  it('enthält alle Mathematik- und Bedienzeichen', () => {
    for (const ch of MATH_UI) {
      expect(SMALL_FONT.glyphs[ch], `Math/UI ${ch}`).toBeDefined();
    }
  });

  it('Großbuchstaben und Ziffern liegen in Zeile 0–6 (Zeile 7 bleibt leer)', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(SMALL_FONT.glyphs[ch]!.rows[7], ch).not.toContain('#');
    }
  });

  it('nur Unterlängen-Zeichen benutzen Zeile 7', () => {
    const allowed = new Set([...'gjpqy,;_₁₂₃₄', '\u{1D466}', 'ȳ', 'ᵢ', 'µ', 'μ', 'γ', 'ρ']);
    for (const [ch, g] of entries) {
      if (g.rows[7]!.includes('#')) expect(allowed.has(ch), `Zeile 7 bei ${JSON.stringify(ch)}`).toBe(true);
    }
  });

  it('Unterlängen-Buchstaben g j p q y haben Punkte in Zeile 7', () => {
    for (const ch of 'gjpqy') {
      expect(SMALL_FONT.glyphs[ch]!.rows[7], ch).toContain('#');
    }
  });

  it('kein Glyph ist leer, außer dem Leerzeichen', () => {
    for (const [ch, g] of entries) {
      if (ch === ' ') continue;
      expect(g.rows.some((r) => r.includes('#')), `leerer Glyph ${JSON.stringify(ch)}`).toBe(true);
    }
  });

  it('□ und ■ sind 5 breit und belegen Zeile 1–6', () => {
    for (const ch of ['□', '■']) {
      const g = SMALL_FONT.glyphs[ch]!;
      expect(g.w).toBe(5);
      expect(g.rows[0]).not.toContain('#');
      expect(g.rows[1]).toBe('#####');
      expect(g.rows[6]).toBe('#####');
      expect(g.rows[7]).not.toContain('#');
    }
    expect(SMALL_FONT.glyphs['□']!.rows[3]).toBe('#...#');
    expect(SMALL_FONT.glyphs['■']!.rows[3]).toBe('#####');
  });

  it('x̄ und ȳ haben den Balken in Zeile 0', () => {
    expect(SMALL_FONT.glyphs['x̄']!.rows[0]).toContain('#');
    expect(SMALL_FONT.glyphs['ȳ']!.rows[0]).toContain('#');
  });
});
