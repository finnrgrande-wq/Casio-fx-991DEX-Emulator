import { describe, expect, it } from 'vitest';
import { ComplexScreen } from '../../src/modes/complex/complexScreen';
import type { CalcPrompt } from '../../src/modes/calc/calcPrompt';
import { formToText } from '../../src/display/resultForm';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const I: KeyId[] = ['ALPHA', 'ENG'];
const ANGLE: KeyId[] = ['SHIFT', 'ENG'];

/** Komplexe-Zahlen-Modus (MENU 2), dann die Tasten. */
function calc(...keys: KeyId[]): Calculator {
  return press(newCalc(), 'MENU', 'D2', ...keys);
}

const scr = (c: Calculator) => c.top as ComplexScreen;
const result = (c: Calculator) => {
  const r = scr(c).currentResult;
  return r && formToText(r);
};

describe('Komplexe Zahlen (Bedienungsanleitung)', () => {
  it('(1+i)⁴ + (1−i)² = −4−2i', () => {
    const c = calc('LPAREN', 'D1', 'ADD', ...I, 'RPAREN', 'POWER', 'D4', 'RIGHT', 'ADD', 'LPAREN', 'D1', 'SUB', ...I, 'RPAREN', 'SQUARE', 'EQ');
    expect(result(c)).toBe('-4-2i');
  });

  it('2∠45 = √2+√2i', () => {
    expect(result(calc('D2', ...ANGLE, 'D4', 'D5', 'EQ'))).toBe('√2+√2i');
  });

  it('2+2i ▸r∠θ = 2√2∠45 und ▸a+bi zurück', () => {
    const c = calc('D2', 'ADD', 'D2', ...I, 'OPTN', 'DOWN', 'D1', 'EQ');
    expect(result(c)).toBe('2√2∠45');
    const d = calc('D2', ...ANGLE, 'D4', 'D5', 'OPTN', 'DOWN', 'D2', 'EQ');
    expect(result(d)).toBe('√2+√2i');
  });

  it('Polarausgabe nach SETUP', () => {
    const c = newCalc();
    c.state.settings.complex = 'polar';
    press(c, 'MENU', 'D2', 'D1', 'ADD', ...I, 'EQ');
    expect(result(c)).toBe('√2∠45');
  });

  it('Conjg, Abs, arg, ReP, ImP', () => {
    expect(result(calc('OPTN', 'D2', 'D2', 'ADD', 'D3', ...I, 'RPAREN', 'EQ'))).toBe('2-3i');
    expect(result(calc('SHIFT', 'LPAREN', 'D1', 'ADD', ...I, 'EQ'))).toBe('√2');
    expect(result(calc('OPTN', 'D1', 'D1', 'ADD', ...I, 'RPAREN', 'EQ'))).toBe('45');
    expect(result(calc('OPTN', 'D3', 'D2', 'ADD', 'D3', ...I, 'RPAREN', 'EQ'))).toBe('2');
    expect(result(calc('OPTN', 'D4', 'D2', 'ADD', 'D3', ...I, 'RPAREN', 'EQ'))).toBe('3');
  });

  it('1÷i = −i, √(−4) = 2i, i² = −1', () => {
    expect(result(calc('D1', 'DIV', ...I, 'EQ'))).toBe('-i');
    expect(result(calc('SQRT', 'NEG', 'D4', 'EQ'))).toBe('2i');
    expect(result(calc(...I, 'SQUARE', 'EQ'))).toBe('-1');
  });

  it('(3+4i)÷(1−2i) = −1+2i', () => {
    const c = calc('LPAREN', 'D3', 'ADD', 'D4', ...I, 'RPAREN', 'DIV', 'LPAREN', 'D1', 'SUB', 'D2', ...I, 'RPAREN', 'EQ');
    expect(result(c)).toBe('-1+2i');
  });

  it('x⁻¹ und negative Potenz', () => {
    expect(result(calc('D2', 'ADD', ...I, 'INV', 'EQ'))).toBe('2-i');
  });

  it('Dezimalform per S⇔D', () => {
    const c = calc('D2', ...ANGLE, 'D4', 'D5', 'EQ', 'SD');
    expect(result(c)).toBe('1,414213562+1,414213562i');
  });
});

describe('Ablaufspeicher, Ans, STO, Fehler', () => {
  it('Ans mit komplexem Wert', () => {
    const c = calc('D3', 'ADD', 'D4', ...I, 'EQ', 'MUL', ...I, 'EQ');
    expect(result(c)).toBe('-4+3i');
    press(c, 'ADD', 'D1', 'EQ');
    expect(result(c)).toBe('-3+3i');
  });

  it('STO speichert komplex, ALPHA A ruft ab', () => {
    const c = calc('D3', 'ADD', 'D4', ...I, 'STO', 'NEG');
    expect(result(c)).toBe('3+4i');
    press(c, 'ALPHA', 'NEG', 'MUL', ...I, 'EQ');
    expect(result(c)).toBe('-4+3i');
  });

  it('▲ blättert zurück', () => {
    const c = calc('D1', 'ADD', ...I, 'EQ', 'D2', 'EQ', 'UP');
    expect(result(c)).toBe('1+i');
  });

  it('√ einer komplexen Zahl und Division durch 0 sind Fehler', () => {
    expect(scr(calc('SQRT', ...I, 'EQ')).currentError).toBeDefined();
    expect(scr(calc('D1', 'DIV', 'D0', 'EQ')).currentError).toBeDefined();
  });
});

describe('CALC in Komplexe Zahlen', () => {
  const A: KeyId[] = ['ALPHA', 'NEG'];
  const B: KeyId[] = ['ALPHA', 'DMS'];
  const out = (c: Calculator) => {
    const r = (c.top as unknown as CalcPrompt).state.result;
    return r && formToText(r);
  };

  it('3A+B mit A=5, B=10 → 25 (Anleitung)', () => {
    const c = calc('D3', ...A, 'ADD', ...B, 'CALC');
    expect((c.top as unknown as CalcPrompt).state.variable).toBe('A');
    press(c, 'D5', 'EQ', 'D1', 'D0', 'EQ');
    expect(out(c)).toBe('25');
  });

  it('A+Bi mit A=1, B=2 → 1+2i; CALC startet neu, AC zurück zur Eingabe', () => {
    const c = calc(...A, 'ADD', ...B, ...I, 'CALC');
    press(c, 'D1', 'EQ', 'D2', 'EQ');
    expect(out(c)).toBe('1+2i');
    press(c, 'CALC');
    expect((c.top as unknown as CalcPrompt).state.variable).toBe('A');
    press(c, 'AC');
    expect(c.top).toBeInstanceOf(ComplexScreen);
  });

  it('(x+i)² mit x=1 → 2i, auch komplexer Wert x=2+3i', () => {
    const c = calc('LPAREN', 'X', 'ADD', ...I, 'RPAREN', 'SQUARE', 'CALC');
    press(c, 'D1', 'EQ');
    expect(out(c)).toBe('2i');
    press(c, 'CALC', 'D2', 'ADD', 'D3', ...I, 'EQ');
    // (2+4i)² = −12+16i
    expect(out(c)).toBe('-12+16i');
  });

  it('SHIFT CALC (SOLVE) tut in Komplexe Zahlen nichts', () => {
    const c = calc('X', 'ADD', 'D1', 'SHIFT', 'CALC');
    expect(c.top).toBeInstanceOf(ComplexScreen);
  });
});
