import { describe, expect, it } from 'vitest';
import { RatioScreen } from '../../src/modes/ratio/ratioScreen';
import { formToText } from '../../src/display/resultForm';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const MODE_D: KeyId[] = ['MENU', 'SIN'];
const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);
const st = (c: Calculator) => (c.top as RatioScreen).state;
const x = (c: Calculator) => {
  const r = st(c).result;
  return r && formToText(r);
};

function values(...vs: number[]): KeyId[] {
  return vs.flatMap((v) => [...String(v)].map((ch) => `D${ch}` as KeyId).concat('EQ'));
}

describe('Verhältnisse', () => {
  it('3:8 = X:12 → X = 9/2', () => {
    const c = calc(...MODE_D, 'D1', ...values(3, 8, 12), 'EQ');
    expect(x(c)).toBe('9/2');
  });

  it('1:2 = X:10 → X = 5; = kehrt zum Editor zurück', () => {
    const c = calc(...MODE_D, 'D1', ...values(1, 2, 10), 'EQ');
    expect(x(c)).toBe('5');
    press(c, 'EQ');
    expect(st(c).phase).toBe('editor');
  });

  it('A:B = C:X → X = B·C/A', () => {
    const c = calc(...MODE_D, 'D2', ...values(3, 8, 12), 'EQ');
    expect(x(c)).toBe('32');
  });

  it('Koeffizient 0 → Mathem. Fehler; AC setzt alle auf 1', () => {
    const c = calc(...MODE_D, 'D1', ...values(0, 2, 3), 'EQ');
    expect(st(c).phase).toBe('error');
    press(c, 'AC', 'AC', 'EQ');
    expect(x(c)).toBe('1');
  });

  it('OPTN wechselt den Typ', () => {
    const c = calc(...MODE_D, 'D1', 'OPTN', 'D1', 'D2');
    expect(st(c).type).toBe(2);
    expect(st(c).phase).toBe('editor');
  });
});
