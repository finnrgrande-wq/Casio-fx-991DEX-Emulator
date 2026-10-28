import { describe, expect, it } from 'vitest';
import { BaseNScreen } from '../../src/modes/basen/baseNScreen';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press, screen } from '../helpers';

const DEC: KeyId[] = ['SQUARE'];
const HEX: KeyId[] = ['POWER'];
const BIN: KeyId[] = ['LOGAB'];
const OCT: KeyId[] = ['LN'];
const calc = (...keys: KeyId[]) => press(newCalc(), 'MENU', 'D3', ...keys);
const lines = (c: Calculator) => (c.top as BaseNScreen).resultLines;
const err = (c: Calculator) => (c.top as BaseNScreen).currentError?.message;

describe('Basis-N', () => {
  it('BIN: 11 + 1 = 100 (32 Bit, zwei Zeilen)', () => {
    const c = calc(...BIN, 'D1', 'D1', 'ADD', 'D1', 'EQ');
    expect(lines(c)).toEqual(['0000 0000 0000 0000', '0000 0000 0000 0100']);
    expect(screen(c)[0]).toBe('[Bin]');
  });

  it('DEC: d10 + h10 + b10 + o10 = 36', () => {
    const c = calc(
      ...DEC, 'OPTN', 'DOWN', 'D1', 'D1', 'D0', 'ADD', 'OPTN', 'DOWN', 'D2', 'D1', 'D0', 'ADD',
      'OPTN', 'DOWN', 'D3', 'D1', 'D0', 'ADD', 'OPTN', 'DOWN', 'D4', 'D1', 'D0', 'EQ',
    );
    expect(lines(c)).toEqual(['36']);
  });

  it('DEC 15×37 = 555, danach HEX = 0000022B', () => {
    const c = calc(...DEC, 'D1', 'D5', 'MUL', 'D3', 'D7', 'EQ');
    expect(lines(c)).toEqual(['555']);
    press(c, ...HEX);
    expect(lines(c)).toEqual(['0000022B']);
    press(c, ...OCT);
    expect(lines(c)).toEqual(['00000001053']);
    press(c, ...DEC);
    expect(lines(c)).toEqual(['555']);
  });

  it('BIN: 1010 and 1100 = 1000', () => {
    const c = calc(...BIN, 'D1', 'D0', 'D1', 'D0', 'OPTN', 'D3', 'D1', 'D1', 'D0', 'D0', 'EQ');
    expect(lines(c)).toEqual(['0000 0000 0000 0000', '0000 0000 0000 1000']);
  });

  it('BIN: Not(1010) = ...0101', () => {
    const c = calc(...BIN, 'OPTN', 'D2', 'D1', 'D0', 'D1', 'D0', 'RPAREN', 'EQ');
    expect(lines(c)).toEqual(['1111 1111 1111 1111', '1111 1111 1111 0101']);
  });

  it('HEX: Neg(1) = FFFFFFFF, Ziffern A–F', () => {
    const c = calc(...HEX, 'OPTN', 'D1', 'D1', 'RPAREN', 'EQ');
    expect(lines(c)).toEqual(['FFFFFFFF']);
    const d = calc(...HEX, 'TAN', 'ADD', 'D1', 'EQ'); // F + 1
    expect(lines(d)).toEqual(['00000010']);
  });

  it('Überlauf und Fehler', () => {
    // 2147483647 + 1
    const c = calc(...DEC, ...'2147483647'.split('').map((d) => `D${d}` as KeyId), 'ADD', 'D1', 'EQ');
    expect(err(c)).toBe('Mathem. Fehler');
    expect(err(calc(...DEC, 'D1', 'DIV', 'D0', 'EQ'))).toBe('Mathem. Fehler');
    expect(err(calc(...DEC, 'D1', 'COMMA', 'D5', 'EQ'))).toBe('Syntaxfehler');
    expect(err(calc(...BIN, 'D2', 'EQ'))).toBe('Syntaxfehler');
    expect(err(calc(...BIN, ...Array<KeyId>(33).fill('D1'), 'EQ'))).toBe('Mathem. Fehler');
  });

  it('Division wird abgeschnitten; negative Zahlen; Priorität', () => {
    expect(lines(calc(...DEC, 'D7', 'DIV', 'D2', 'EQ'))).toEqual(['3']);
    expect(lines(calc(...DEC, 'SUB', 'D7', 'DIV', 'D2', 'EQ'))).toEqual(['-3']);
    expect(lines(calc(...DEC, 'D2', 'ADD', 'D3', 'MUL', 'D4', 'EQ'))).toEqual(['14']);
    expect(lines(calc(...BIN, 'SUB', 'D1', 'EQ'))).toEqual(['1111 1111 1111 1111', '1111 1111 1111 1111']);
    expect(lines(calc(...HEX, 'D8', 'D0', 'D0', 'D0', 'D0', 'D0', 'D0', 'D0', 'EQ'))).toEqual(['80000000']);
    expect(lines(calc(...DEC, 'SUB', ...'2147483648'.split('').map((d) => `D${d}` as KeyId), 'EQ'))).toEqual(['-2147483648']);
  });

  it('Ans und Fortsetzung mit Operator', () => {
    const c = calc(...DEC, 'D5', 'EQ', 'MUL', 'D3', 'EQ');
    expect(lines(c)).toEqual(['15']);
    press(c, 'ANS', 'ADD', 'D1', 'EQ');
    expect(lines(c)).toEqual(['16']);
  });
});
