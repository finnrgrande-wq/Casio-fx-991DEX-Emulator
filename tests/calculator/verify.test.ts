import { describe, expect, it } from 'vitest';
import { VerifyScreen } from '../../src/modes/verify/verifyScreen';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const MODE_C: KeyId[] = ['MENU', 'INV'];
const calc = (...keys: KeyId[]) => press(newCalc(), ...MODE_C, ...keys);
const st = (c: Calculator) => (c.top as VerifyScreen).state;
// OPTN-Menü der Vergleichszeichen
const EQ: KeyId[] = ['OPTN', 'D1'];
const NE: KeyId[] = ['OPTN', 'D2'];
const GT: KeyId[] = ['OPTN', 'D3'];
const LT: KeyId[] = ['OPTN', 'D4'];
const GE: KeyId[] = ['OPTN', 'D5'];
const LE: KeyId[] = ['OPTN', 'D6'];
const PI: KeyId[] = ['SHIFT', 'EXP'];

describe('Berechn. prüfen (Bedienungsanleitung S. 37)', () => {
  it('√4 = 2 (natürliche Eingabe) → Wahr, Ans = 1', () => {
    const c = calc('SQRT', 'D4', 'RIGHT', ...EQ, 'D2', 'EQ');
    expect(st(c).text).toBe('Wahr');
    expect(toNumber(deserialize(c.state.ans))).toBe(1);
  });

  it('4 ≠ 3, π > 3, 1+2 ≤ 5 → Wahr', () => {
    expect(st(calc('D4', ...NE, 'D3', 'EQ')).text).toBe('Wahr');
    expect(st(calc(...PI, ...GT, 'D3', 'EQ')).text).toBe('Wahr');
    expect(st(calc('D1', 'ADD', 'D2', ...LE, 'D5', 'EQ')).text).toBe('Wahr');
  });

  it('3×6 < 2+6×2 → Falsch, Ans = 0', () => {
    const c = calc('D3', 'MUL', 'D6', ...LT, 'D2', 'ADD', 'D6', 'MUL', 'D2', 'EQ');
    expect(st(c).text).toBe('Falsch');
    expect(toNumber(deserialize(c.state.ans))).toBe(0);
  });

  it('Ketten: 1 ≤ 1 < 1+1 und 3 < π < 4 → Wahr; 1 < 1 < 2 → Falsch', () => {
    expect(st(calc('D1', ...LE, 'D1', ...LT, 'D1', 'ADD', 'D1', 'EQ')).text).toBe('Wahr');
    expect(st(calc('D3', ...LT, ...PI, ...LT, 'D4', 'EQ')).text).toBe('Wahr');
    expect(st(calc('D1', ...LT, 'D1', ...LT, 'D2', 'EQ')).text).toBe('Falsch');
  });

  it('gemischte Richtungen und ≠ mit < → Syntaxfehler', () => {
    expect(st(calc('D5', ...LE, 'D6', ...GE, 'D4', 'EQ')).error).toBe('Syntaxfehler');
    expect(st(calc('D4', ...LT, 'D6', ...NE, 'D8', 'EQ')).error).toBe('Syntaxfehler');
    expect(st(calc('D4', 'EQ')).error).toBe('Syntaxfehler');
  });

  it('(x+1)(x+5) = x²+x+5x+5 mit gespeichertem x → Wahr; dann = setzt rechte Seite fort', () => {
    const c = newCalc();
    press(c, 'D3', 'STO', 'X', ...MODE_C);
    press(c, 'LPAREN', 'X', 'ADD', 'D1', 'RPAREN', 'LPAREN', 'X', 'ADD', 'D5', 'RPAREN', ...EQ);
    press(c, 'X', 'SQUARE', 'ADD', 'X', 'ADD', 'D5', 'X', 'ADD', 'D5', 'EQ');
    expect(st(c).text).toBe('Wahr');
    press(c, 'EQ');
    expect(st(c).phase).toBe('edit');
    press(c, 'X', 'SQUARE', 'ADD', 'D6', 'X', 'ADD', 'D5', 'EQ');
    expect(st(c).text).toBe('Wahr');
    press(c, 'AC', 'D1', ...EQ, 'D2', 'EQ');
    expect(st(c).text).toBe('Falsch');
  });
});
