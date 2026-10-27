import { describe, expect, it } from 'vitest';
import { TensorScreen } from '../../src/modes/tensor/tensorScreen';
import { formToText } from '../../src/display/resultForm';
import { toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press } from '../helpers';

const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);
const st = (c: Calculator) => (c.top as TensorScreen).state;
const result = (c: Calculator) => {
  const r = st(c).result;
  return r && formToText(r);
};
const ans = (c: Calculator) => st(c).ans?.map((row) => row.map(toNumber));

function values(...vs: number[]): KeyId[] {
  return vs.flatMap((v) => {
    const keys: KeyId[] = v < 0 ? ['NEG'] : [];
    for (const ch of String(Math.abs(v))) keys.push(`D${ch}` as KeyId);
    return [...keys, 'EQ'];
  });
}

// OPTN-Seiten (je 4 Einträge): Seite 1 Definieren, Bearbeiten, A, B; Seite 2 C, D, Ans, Det/Skalarprodukt; Seite 3 Rest
const MAT_A: KeyId[] = ['OPTN', 'D3'];
const MAT_B: KeyId[] = ['OPTN', 'D4'];
const DET: KeyId[] = ['OPTN', 'DOWN', 'D4'];
const DEFINE: KeyId[] = ['OPTN', 'D1'];

describe('Matrizen (Kurzanleitung S. 12)', () => {
  it('Det(MatA) = 27 für [[2,1,−1],[5,3,0],[4,−2,5]]', () => {
    const c = calc('MENU', 'D4', 'D1', 'D3', 'D3', ...values(2, 1, -1, 5, 3, 0, 4, -2, 5), 'AC', ...DET, ...MAT_A, 'RPAREN', 'EQ');
    expect(result(c)).toBe('27');
  });

  it('MatA × MatB = [[3,0],[1,1]] (Bedienungsanleitung), dann Inverse und Quadrat', () => {
    const c = calc('MENU', 'D4', 'D1', 'D2', 'D2', ...values(2, 1, 1, 1), ...DEFINE, 'D2', 'D2', 'D2', ...values(2, -1, -1, 2), 'AC');
    press(c, ...MAT_A, 'MUL', ...MAT_B, 'EQ');
    expect(st(c).phase).toBe('ans');
    expect(ans(c)).toEqual([[3, 0], [1, 1]]);
    press(c, 'AC', ...MAT_A, 'INV', 'EQ');
    expect(ans(c)).toEqual([[1, -1], [-1, 2]]);
    press(c, 'SQUARE', 'EQ');
    expect(ans(c)).toEqual([[2, -3], [-3, 5]]);
  });

  it('Dimensionsfehler bei unpassenden Matrizen, undefinierte Matrix', () => {
    const c = calc('MENU', 'D4', 'D1', 'D2', 'D3', ...values(1, 2, 3, 4, 5, 6), 'AC', ...MAT_A, 'MUL', ...MAT_A, 'EQ');
    expect(st(c).phase).toBe('error');
    press(c, 'AC', ...MAT_B, 'EQ');
    expect(st(c).phase).toBe('error');
  });

  it('Matrizen bleiben über einen Neustart erhalten', () => {
    const store = memStore();
    press(newCalc(store), 'MENU', 'D4', 'D1', 'D2', 'D2', ...values(2, 1, 1, 1));
    const c = newCalc(store);
    press(c, 'AC', ...DET, ...MAT_A, 'EQ');
    expect(result(c)).toBe('1');
  });
});

describe('Vektoren (Kurzanleitung S. 13)', () => {
  const setup = (): Calculator =>
    calc('MENU', 'D5', 'D1', 'D3', ...values(3, -2, 1), ...DEFINE, 'D2', 'D3', ...values(1, 2, -2), 'AC');

  it('VctA · VctB = −3', () => {
    const c = setup();
    press(c, ...MAT_A, 'OPTN', 'DOWN', 'D4', ...MAT_B, 'EQ');
    expect(result(c)).toBe('-3');
  });

  it('VctA × VctB = Kreuzprodukt', () => {
    const c = setup();
    press(c, ...MAT_A, 'MUL', ...MAT_B, 'EQ');
    // (3,−2,1) × (1,2,−2) = (2, 7, 8)
    expect(ans(c)).toEqual([[2], [7], [8]]);
  });

  it('Winkel und Einheitsvektor (Bedienungsanleitung)', () => {
    const c = calc('MENU', 'D5', 'D1', 'D2', ...values(1, 2), ...DEFINE, 'D2', 'D2', ...values(3, 4), 'AC');
    press(c, 'OPTN', 'DOWN', 'DOWN', 'D1', ...MAT_A, 'SHIFT', 'RPAREN', ...MAT_B, 'RPAREN', 'EQ');
    expect(Number(result(c)!.replace(',', '.'))).toBeCloseTo(10.30484647, 8);
    press(c, 'AC', 'OPTN', 'DOWN', 'DOWN', 'D2', ...MAT_B, 'RPAREN', 'EQ');
    expect(ans(c)).toEqual([[0.6], [0.8]]);
  });

  it('Betrag eines Vektors mit Abs', () => {
    const c = calc('MENU', 'D5', 'D1', 'D3', ...values(2, -1, 2), 'AC', 'SHIFT', 'LPAREN', ...MAT_A, 'EQ');
    expect(result(c)).toBe('3');
  });
});
