import { describe, expect, it } from 'vitest';
import { InequalityScreen } from '../../src/modes/inequality/inequalityScreen';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const MODE_B: KeyId[] = ['MENU', 'DMS'];
const calc = (...keys: KeyId[]) => press(newCalc(), ...MODE_B, ...keys);
const st = (c: Calculator) => (c.top as InequalityScreen).state;

function value(v: number): KeyId[] {
  const keys: KeyId[] = v < 0 ? ['NEG'] : [];
  for (const ch of String(Math.abs(v))) keys.push(`D${ch}` as KeyId);
  return [...keys, 'EQ'];
}
const values = (...vs: number[]) => vs.flatMap(value);

// Typ: 1 = >0, 2 = <0, 3 = ≥0, 4 = ≤0
const solve = (n: number, type: number, ...cs: number[]) =>
  st(calc(`D${n}` as KeyId, `D${type}` as KeyId, ...values(...cs), 'EQ')).text;

describe('Ungleichungen (Bedienungsanleitung S. 36)', () => {
  it('x² + 2x − 3 < 0 → −3 < x < 1', () => {
    expect(solve(2, 2, 1, 2, -3)).toBe('-3<𝑥<1');
  });

  it('3x³ + 3x² − x > 0 → exakte Grenzen mit Wurzel', () => {
    expect(solve(3, 1, 3, 3, -1, 0)).toBe('(-3-√21)/6<𝑥<0;(-3+√21)/6<𝑥');
  });

  it('x² ≥ 0 → Alle reell Zahlen; x² < 0 → Keine Lösung', () => {
    expect(solve(2, 3, 1, 0, 0)).toBe('Alle reell Zahlen');
    expect(solve(2, 2, 1, 0, 0)).toBe('Keine Lösung');
  });

  it('x² ≤ 0 → x = 0; x² > 0 → x<0; 0<x', () => {
    expect(solve(2, 4, 1, 0, 0)).toBe('𝑥=0');
    expect(solve(2, 1, 1, 0, 0)).toBe('𝑥<0;0<𝑥');
  });

  it('negativer Leitkoeffizient und nichtstrenge Grenzen', () => {
    expect(solve(2, 3, -1, 0, 4)).toBe('-2≤𝑥≤2');
    expect(solve(2, 1, 1, -3, 2)).toBe('𝑥<1;2<𝑥');
  });

  it('Grad 4: x⁴ − 5x² + 4 ≤ 0 → −2≤x≤−1; 1≤x≤2', () => {
    expect(solve(4, 4, 1, 0, -5, 0, 4)).toBe('-2≤𝑥≤-1;1≤𝑥≤2');
  });

  it('Grad 3 ohne rationale Nullstelle (numerisch)', () => {
    const t = solve(3, 1, 1, 0, 1, -1)!;
    expect(t.startsWith('0.6')).toBe(false);
    expect(t).toMatch(/<𝑥$/);
  });

  it('führender Koeffizient 0 → Mathem. Fehler; OPTN wechselt den Typ und setzt Koeffizienten zurück', () => {
    const c = calc('D2', 'D1', ...values(0, 1, 1), 'EQ');
    expect(st(c).phase).toBe('error');
    press(c, 'AC', 'OPTN', 'D1');
    expect(st(c).phase).toBe('count');
    press(c, 'D3', 'D2');
    expect(st(c)).toMatchObject({ phase: 'editor', n: 3, rel: '<' });
  });
});
