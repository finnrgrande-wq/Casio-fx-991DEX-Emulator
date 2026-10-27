import { describe, expect, it } from 'vitest';
import { CalcScreen } from '../../src/modes/calc/calcScreen';
import { CalcPrompt } from '../../src/modes/calc/calcPrompt';
import { SolveScreen } from '../../src/modes/calc/solveScreen';
import { formToText } from '../../src/display/resultForm';
import { deserialize, toNumber } from '../../src/core/value';
import { CONV_CATEGORIES } from '../../src/data/conversions';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);
const result = (c: Calculator) => {
  const r = (c.top as CalcScreen).currentResult;
  return r && formToText(r);
};
const solve = (c: Calculator) => (c.top as SolveScreen).state;
const prompt = (c: Calculator) => (c.top as CalcPrompt).state;
const varOf = (c: Calculator, name: 'x' | 'y' | 'A') => toNumber(deserialize(c.state.vars[name]));

/** Tasten für „Gleichheitszeichen“ (ALPHA CALC) und SOLVE (SHIFT CALC). */
const EQ_SIGN: KeyId[] = ['ALPHA', 'CALC'];
const SOLVE: KeyId[] = ['SHIFT', 'CALC'];

describe('SOLVE (Kurzanleitung S. 7)', () => {
  it('ln(x) = x/4: Start 0 → 1,429611825, Start 8 → 8,613169456, L−R = 0', () => {
    const c = calc('LN', 'X', 'RPAREN', ...EQ_SIGN, 'FRAC', 'X', 'DOWN', 'D4', ...SOLVE);
    expect(c.top).toBeInstanceOf(SolveScreen);
    expect(solve(c).variable).toBe('x');
    press(c, 'D0', 'EQ');
    expect(solve(c).phase).toBe('result');
    expect(solve(c).x).toBeCloseTo(1.429611825, 9);
    expect(solve(c).lr).toBe(0);
    press(c, 'EQ', 'D8', 'EQ');
    expect(solve(c).x).toBeCloseTo(8.613169456, 9);
    expect(solve(c).lr).toBe(0);
  });

  it('y = −2x³+4x² mit y = 2: Lösungen 1; −0,62; 1,62', () => {
    const c = calc('ALPHA', 'SD', ...EQ_SIGN, 'NEG', 'D2', 'X', 'SHIFT', 'SQUARE', 'ADD', 'D4', 'X', 'SQUARE', ...SOLVE);
    expect(solve(c).variable).toBe('y');
    press(c, 'D2', 'DOWN');
    expect(solve(c).variable).toBe('x');
    press(c, 'D1', 'EQ');
    expect(solve(c).x).toBeCloseTo(1, 9);
    press(c, 'EQ', 'NEG', 'D1', 'EQ');
    expect(solve(c).x).toBeCloseTo(-0.6180339887, 9);
    press(c, 'EQ', 'D2', 'EQ');
    expect(solve(c).x).toBeCloseTo(1.6180339887, 9);
    expect(varOf(c, 'y')).toBe(2);
  });

  it('0 = d/dx(−2x³+4x²)|x=x, Start 1 → 1,333333…', () => {
    const c = calc('D0', ...EQ_SIGN, 'SHIFT', 'INTEGRAL', 'NEG', 'D2', 'X', 'SHIFT', 'SQUARE', 'ADD', 'D4', 'X', 'SQUARE', 'RIGHT', 'X', ...SOLVE);
    press(c, 'D1', 'EQ');
    expect(solve(c).x).toBeCloseTo(4 / 3, 7);
  });

  it('x² + B = 0 mit B = −2 (Bedienungsanleitung): Liste x, B; Lösung √2', () => {
    const c = calc('X', 'SQUARE', 'ADD', 'ALPHA', 'DMS', ...EQ_SIGN, 'D0', ...SOLVE);
    press(c, 'D1', 'DOWN', 'NEG', 'D2', 'UP', 'EQ');
    expect(solve(c).variable).toBe('x');
    expect(solve(c).x).toBeCloseTo(Math.SQRT2, 9);
  });

  it('Term ohne Variable → Variablenfehler; AC kehrt zur Eingabe zurück', () => {
    const c = calc('D2', 'ADD', 'D3', ...SOLVE);
    expect((c.top as CalcScreen).currentError?.message).toBe('Variablenfehler');
    const d = calc('X', 'SUB', 'D3', ...SOLVE, 'AC');
    expect(d.top).toBeInstanceOf(CalcScreen);
    expect((d.top as CalcScreen).editor.root.length).toBe(3);
  });

  it('x² + 1 = 0 hat keine reelle Lösung → Fortfahren:[=]', () => {
    const c = calc('X', 'SQUARE', 'ADD', 'D1', ...SOLVE, 'D1', 'EQ');
    expect(solve(c).phase).toBe('continue');
    press(c, 'AC');
    expect(solve(c).phase).toBe('list');
  });
});

describe('CALC (Kurzanleitung S. 8)', () => {
  it('y = 2x²−3x mit x = 2 → 2, y wird zugewiesen', () => {
    const c = calc('ALPHA', 'SD', ...EQ_SIGN, 'D2', 'X', 'SQUARE', 'SUB', 'D3', 'X', 'CALC');
    expect(prompt(c).variable).toBe('x');
    press(c, 'D2', 'EQ');
    expect(prompt(c).phase).toBe('result');
    expect(formToText(prompt(c).result!)).toBe('2');
    expect(varOf(c, 'y')).toBe(2);
  });

  it('Σ mit Parameter A = 17: x ist gebunden, nur A wird abgefragt', () => {
    const c = calc(
      'SHIFT', 'X', 'ALPHA', 'NEG', 'SHIFT', 'DIV', 'X', 'MUL', 'D0', 'COMMA', 'D2', 'D5', 'POWER', 'X', 'RIGHT',
      'MUL', 'D0', 'COMMA', 'D7', 'D5', 'POWER', 'ALPHA', 'NEG', 'SUB', 'X', 'RIGHT', 'RIGHT', 'D1', 'RIGHT', 'ALPHA', 'NEG', 'CALC',
    );
    expect(prompt(c).variable).toBe('A');
    press(c, 'D1', 'D7', 'EQ');
    const r = prompt(c).result!;
    expect(Number(formToText(r).replace(',', '.'))).toBeCloseTo(1 - 0.75 ** 17, 9);
  });

  it('Ax²+Bx+C: ▲▼ wählen den Parameter, CALC fragt erneut', () => {
    const c = calc('ALPHA', 'NEG', 'X', 'SQUARE', 'ADD', 'ALPHA', 'DMS', 'X', 'ADD', 'ALPHA', 'INV', 'CALC');
    expect(prompt(c).variable).toBe('A');
    // Abfrage in Reihenfolge des Auftretens: A, x, B, C
    press(c, 'D1', 'EQ', 'D3', 'EQ', 'NEG', 'D2', 'EQ');
    expect(prompt(c).variable).toBe('C');
    press(c, 'UP');
    expect(prompt(c).variable).toBe('B');
    press(c, 'DOWN', 'D1', 'EQ');
    // x = 3: 9 − 6 + 1
    expect(formToText(prompt(c).result!)).toBe('4');
    press(c, 'CALC');
    expect(prompt(c).variable).toBe('A');
  });
});

describe('Konstanten, Umrechnung, FACT', () => {
  it('12,5 ft ▸ m = 3,81 (Kurzanleitung S. 3)', () => {
    const length = CONV_CATEGORIES.findIndex((cat) => cat.title === 'Länge');
    const idx = CONV_CATEGORIES[length].items.findIndex((it) => it.label === 'ft▸m');
    expect(idx).toBeGreaterThanOrEqual(0);
    const down: KeyId[] = Array(idx).fill('DOWN');
    const c = calc('D1', 'D2', 'COMMA', 'D5', 'SHIFT', 'D8', ...Array<KeyId>(length).fill('DOWN'), 'EQ', ...down, 'EQ', 'EQ');
    expect(result(c)).toBe('3,81');
  });

  it('Lichtgeschwindigkeit c0 = 299792458', () => {
    expect(result(calc('SHIFT', 'D7', 'D1', 'D3', 'EQ'))).toBe('299792458');
  });

  it('FACT: 1014 → 2×3×13², zurück mit FACT', () => {
    const c = calc('D1', 'D0', 'D1', 'D4', 'EQ', 'SHIFT', 'DMS');
    expect(result(c)).toBe('2×3×13²');
    press(c, 'SHIFT', 'DMS');
    expect(result(c)).toBe('1014');
  });

  it('Umrechnung nach einem Ergebnis rechnet mit Ans', () => {
    const length = CONV_CATEGORIES.findIndex((cat) => cat.title === 'Länge');
    const idx = CONV_CATEGORIES[length].items.findIndex((it) => it.label === 'cm▸in');
    const c = calc('D5', 'EQ', 'SHIFT', 'D8', ...Array<KeyId>(length).fill('DOWN'), 'EQ', ...Array<KeyId>(idx).fill('DOWN'), 'EQ', 'EQ');
    expect(Number(result(c)!.replace(',', '.'))).toBeCloseTo(1.968503937, 9);
  });
});
