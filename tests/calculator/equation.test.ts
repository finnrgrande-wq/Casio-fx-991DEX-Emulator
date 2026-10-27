import { describe, expect, it } from 'vitest';
import { EquationScreen } from '../../src/modes/equation/equationScreen';
import { formToText } from '../../src/display/resultForm';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press } from '../helpers';

const MODE_A: KeyId[] = ['MENU', 'NEG'];
const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);
const st = (c: Calculator) => (c.top as EquationScreen).state;
const shown = (c: Calculator) => {
  const s = st(c);
  return s.result ? `${s.label}${formToText(s.result)}` : undefined;
};

/** Ziffernfolge mit optionalem Minus als Tasten, gefolgt von = */
function value(v: number): KeyId[] {
  const keys: KeyId[] = v < 0 ? ['NEG'] : [];
  for (const ch of String(Math.abs(v))) keys.push(ch === '.' ? 'COMMA' : (`D${ch}` as KeyId));
  return [...keys, 'EQ'];
}
const values = (...vs: number[]) => vs.flatMap(value);

describe('Polynomgleichungen (Kurzanleitung S. 6)', () => {
  it('4x²−5x−7 = 0: x₂ = (5−√137)/8, danach Scheitelpunkt', () => {
    const c = calc(...MODE_A, 'D2', 'D2', ...values(4, -5, -7), 'EQ');
    expect(shown(c)).toBe('𝑥₁=(5+√137)/8');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑥₂=(5-√137)/8');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑥-Wert Minimum=5/8');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑦-Wert Minimum=-137/16');
    press(c, 'EQ');
    expect(st(c).phase).toBe('editor');
  });

  it('x² + 2x − 2 = 0 → −1+√3, −1−√3; Minimum (−1; −3) (Bedienungsanleitung)', () => {
    const c = calc(...MODE_A, 'D2', 'D2', ...values(1, 2, -2), 'EQ');
    expect(shown(c)).toBe('𝑥₁=-1+√3');
    press(c, 'EQ');
    expect(shown(c)).toBe('𝑥₂=-1-√3');
    press(c, 'EQ', 'EQ');
    expect(shown(c)).toBe('𝑦-Wert Minimum=-3');
  });

  it('2x² + x − 3 = 0 → 1 und −3/2; doppelte Lösung nur einmal', () => {
    const c = calc(...MODE_A, 'D2', 'D2', ...values(2, 1, -3), 'EQ');
    expect(shown(c)).toBe('𝑥₁=1');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑥₂=-3/2');
    const d = calc(...MODE_A, 'D2', 'D2', ...values(1, -2, 1), 'EQ');
    expect(shown(d)).toBe('𝑥=1');
  });

  it('x² + 1 = 0: komplexe Lösungen ±i bzw. Meldung ohne komplexe Lösungen', () => {
    const c = calc(...MODE_A, 'D2', 'D2', ...values(1, 0, 1), 'EQ');
    expect(shown(c)).toBe('𝑥₁=i');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑥₂=-i');
    const d = calc('SHIFT', 'MENU', 'DOWN', 'DOWN', 'D1', 'D2', ...MODE_A, 'D2', 'D2', ...values(1, 0, 1), 'EQ');
    expect(st(d).message).toEqual(['Keine reell. Lösg']);
  });

  it('x² − 2x + 5 = 0 → 1 ± 2i', () => {
    const c = calc(...MODE_A, 'D2', 'D2', ...values(1, -2, 5), 'EQ');
    expect(shown(c)).toBe('𝑥₁=1+2i');
  });

  it('Grad 3: x³ − 6x² + 11x − 6 → 3, 2, 1; Grad 4: x⁴ − 1', () => {
    const c = calc(...MODE_A, 'D2', 'D3', ...values(1, -6, 11, -6), 'EQ');
    expect(shown(c)).toBe('𝑥₁=3');
    press(c, 'DOWN', 'DOWN');
    expect(shown(c)).toBe('𝑥₃=1');
    const d = calc(...MODE_A, 'D2', 'D4', ...values(1, 0, 0, 0, -1), 'EQ');
    expect(shown(d)).toBe('𝑥₁=1');
    press(d, 'DOWN', 'DOWN');
    expect(shown(d)).toBe('𝑥₃=i');
  });

  it('Grad 3 mit rationaler Lösung zeigt einen Bruch: 2x³ − x² = 0 → 1/2', () => {
    const c = calc(...MODE_A, 'D2', 'D3', ...values(2, -1, 0, 0), 'EQ');
    expect(shown(c)).toBe('𝑥₁=1/2');
  });
});

describe('Gleichungssysteme', () => {
  it('x + 2y = 3; 2x + 3y = 4 → x = −1, y = 2 (Bedienungsanleitung)', () => {
    const c = calc(...MODE_A, 'D1', 'D2', ...values(1, 2, 3, 2, 3, 4), 'EQ');
    expect(shown(c)).toBe('𝑥=-1');
    press(c, 'DOWN');
    expect(shown(c)).toBe('𝑦=2');
  });

  it('3 Unbekannte mit Bruchlösung', () => {
    // x+y+z=1; x−y=0; 2z=1 → x = y = 1/4, z = 1/2
    const c = calc(...MODE_A, 'D1', 'D3', ...values(1, 1, 1, 1, 1, -1, 0, 0, 0, 0, 2, 1), 'EQ');
    expect(shown(c)).toBe('𝑥=1/4');
    press(c, 'DOWN', 'DOWN');
    expect(shown(c)).toBe('z=1/2');
  });

  it('unendlich viele / keine Lösung', () => {
    const c = calc(...MODE_A, 'D1', 'D2', ...values(1, 1, 2, 2, 2, 4), 'EQ');
    expect(st(c).message).toEqual(['Unendlich viele', 'Lösungen']);
    const d = calc(...MODE_A, 'D1', 'D2', ...values(1, 1, 2, 2, 2, 5), 'EQ');
    expect(st(d).message).toEqual(['Keine Lösung']);
  });

  it('STO speichert die angezeigte Lösung, AC setzt Koeffizienten auf 0', () => {
    const c = calc(...MODE_A, 'D1', 'D2', ...values(1, 2, 3, 2, 3, 4), 'EQ', 'DOWN', 'STO', 'NEG');
    expect(toNumber(deserialize(c.state.vars.A))).toBe(2);
    press(c, 'AC', 'AC', 'EQ');
    expect(st(c).phase).toBe('message');
  });

  it('Koeffizienten bleiben über einen Neustart erhalten', () => {
    const store = memStore();
    press(newCalc(store), ...MODE_A, 'D2', 'D2', ...values(4, -5, -7));
    const c = newCalc(store);
    press(c, 'EQ');
    expect(shown(c)).toBe('𝑥₁=(5+√137)/8');
  });
});
