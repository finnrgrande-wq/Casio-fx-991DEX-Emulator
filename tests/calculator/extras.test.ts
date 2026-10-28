import { describe, expect, it } from 'vitest';
import { CalcPrompt } from '../../src/modes/calc/calcPrompt';
import { CalcScreen } from '../../src/modes/calc/calcScreen';
import { GraphScreen } from '../../src/modes/table/tableGraph';
import { formToText } from '../../src/display/resultForm';
import { Framebuffer } from '../../src/display/framebuffer';
import { deserialize, toNumber } from '../../src/core/value';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);

describe('QR-Ersatz in Berechnungen', () => {
  it('SHIFT OPTN zeigt den Graphen der Eingabe, AC schließt ihn', () => {
    const c = calc('X', 'SQUARE', 'SUB', 'D4', 'SHIFT', 'OPTN');
    expect(c.top).toBeInstanceOf(GraphScreen);
    const fb = new Framebuffer();
    fb.render(c.render().scene);
    expect(fb.pixels.filter((p) => p === 1).length).toBeGreaterThan(200);
    press(c, 'AC');
    expect(c.top).toBeInstanceOf(CalcScreen);
    expect((c.top as CalcScreen).editor.root.length).toBe(4);
  });

  it('ohne Eingabe passiert nichts', () => {
    const c = calc('SHIFT', 'OPTN');
    expect(c.top).toBeInstanceOf(CalcScreen);
  });
});

describe('Randfälle', () => {
  it('CALC mit y=… im Modus Komplexe Zahlen weist y zu', () => {
    // y = x + i mit x = 2 → 2+i, y erhält den Realteil 2
    const c = calc('MENU', 'D2', 'ALPHA', 'SD', 'ALPHA', 'CALC', 'X', 'ADD', 'ALPHA', 'ENG', 'CALC');
    expect(c.top).toBeInstanceOf(CalcPrompt);
    press(c, 'D2', 'EQ');
    const r = (c.top as CalcPrompt).state.result;
    expect(r && formToText(r)).toBe('2+i');
    expect(toNumber(deserialize(c.state.vars.y))).toBe(2);
  });
});
