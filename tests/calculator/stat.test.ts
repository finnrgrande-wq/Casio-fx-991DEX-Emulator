import { describe, expect, it } from 'vitest';
import type { StatScreen } from '../../src/modes/stat/statScreen';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press, screen } from '../helpers';

const MODE: KeyId[] = ['MENU', 'D6'];
const st = (c: Calculator) => (c.top as StatScreen).state;

function value(v: number): KeyId[] {
  const keys: KeyId[] = v < 0 ? ['NEG'] : [];
  for (const ch of String(Math.abs(v))) keys.push(ch === '.' ? 'COMMA' : (`D${ch}` as KeyId));
  return [...keys, 'EQ'];
}
const values = (...vs: number[]) => vs.flatMap(value);

/** Zweivariablen-Daten: erst die x-Spalte, dann (▼ springt an den Anfang, ▶) die y-Spalte. */
const pairs = (xs: number[], ys: number[]): KeyId[] => [...values(...xs), 'DOWN', 'RIGHT', ...values(...ys)];

describe('Statistik: Typauswahl und Editor', () => {
  it('Typmenü mit acht Typen, vier je Seite', () => {
    const c = press(newCalc(), ...MODE);
    expect(screen(c)).toEqual(['1:1 Variable', '2:y=a+bx', '3:y=a+bx+cx²', '4:y=a+b·ln(x)']);
    press(c, 'DOWN');
    expect(screen(c)).toEqual(['5:y=a·e^(bx)', '6:y=a·b^x', '7:y=a·x^b', '8:y=a+b/x']);
  });

  it('Zeilen anhängen, DEL löscht die Zeile, Daten bleiben beim Neustart erhalten', () => {
    const store = memStore();
    const c = press(newCalc(store), ...MODE, 'D1', ...values(5, 6, 7));
    expect(st(c).rows).toBe(3);
    press(c, 'UP', 'DEL');
    expect(st(c).rows).toBe(2);
    const d = newCalc(store);
    expect(st(d).phase).toBe('editor');
    expect(st(d).rows).toBe(2);
  });

  it('Verlassen der Anwendung löscht die Daten', () => {
    const store = memStore();
    const c = press(newCalc(store), ...MODE, 'D1', ...values(1, 2));
    press(c, 'MENU', 'D1', 'MENU', 'D6');
    expect(st(c).phase).toBe('type');
    expect(newCalc(store).state.modeData.stat).toBeUndefined();
  });

  it('Typwechsel zwischen 1 Variable und Variablenpaar löscht die Daten', () => {
    const c = press(newCalc(), ...MODE, 'D2', ...values(1, 2, 3));
    press(c, 'OPTN', 'D1', 'D3');
    expect(st(c).rows).toBe(3);
    press(c, 'OPTN', 'D1', 'D1');
    expect(st(c).rows).toBe(0);
  });

  it('OPTN im Editor und im Berechnungsbildschirm', () => {
    const c = press(newCalc(), ...MODE, 'D2', 'OPTN');
    expect(screen(c)).toEqual(['1:Typ auswählen', '2:Editor', '3:2-Variab-Berech', '4:Regression']);
    press(c, 'AC', 'AC', 'OPTN');
    expect(screen(c).slice(0, 4)).toEqual(['1:Typ auswählen', '2:2-Variab-Berech', '3:Regression', '4:Daten']);
  });
});

describe('Statistik: Berechnungen', () => {
  it('Kurzanleitung S. 10: quadratische Regression', () => {
    const c = press(newCalc(), ...MODE, 'D3', ...pairs([-4, -1, 2, 3], [3, 1, 2, 5]), 'OPTN', 'D4');
    expect(st(c).lines).toEqual(['y=a+bx+cx²', 'a=0,8181818182', 'b=0,4575757576', 'c=0,2575757576']);
  });

  it('Bsp. 2: Einzelvariable mit Freq-Spalte, x̄ = 3', () => {
    const c = newCalc();
    c.state.settings.statFreq = true;
    press(c, ...MODE, 'D1', ...values(1, 2, 3, 4, 5), 'DOWN', 'RIGHT', ...values(1, 2, 3, 2, 1));
    press(c, 'AC', 'AC', 'OPTN', 'D5', 'D2', 'EQ');
    expect(st(c).result).toBe('3');
    press(c, 'AC', 'OPTN', 'D2');
    expect(st(c).lines[0]).toBe('x̄=3');
    expect(st(c).lines[7]).toBe('n=9');
  });

  it('1-Variab-Berech aus dem Editor (Bedienungsanleitung S. 26)', () => {
    const c = press(newCalc(), ...MODE, 'D1', ...values(170, 173, 179), 'OPTN', 'D3');
    expect(st(c).lines.slice(0, 6)).toEqual(['x̄=174', 'Σx=522', 'Σx²=90870', 'σ²x=14', 'σx=3,741657387', 's²x=21']);
  });

  it('Bsp. 3/4: logarithmische Regression mit Fix 3, r, a, b und ŷ(160)', () => {
    const c = newCalc();
    c.state.settings.format = { kind: 'fix', n: 3 };
    press(c, ...MODE, 'D4', ...pairs([20, 110, 200, 290], [3150, 7310, 8800, 9310]));
    press(c, 'AC', 'AC', 'OPTN', 'D8', 'D3', 'EQ');
    expect(st(c).result).toBe('0,998');
    press(c, 'AC', 'OPTN', 'D8', 'D1', 'EQ');
    expect(st(c).result).toBe('-3857,984');
    press(c, 'AC', 'OPTN', 'D8', 'D2', 'EQ');
    expect(st(c).result).toBe('2357,532');
    press(c, 'AC', ...values(160).slice(0, -1), 'OPTN', 'D8', 'D5', 'EQ');
    expect(st(c).result).toBe('8106,898');
  });

  it('Normalverteilung: t und P(', () => {
    const c = newCalc();
    c.state.settings.statFreq = true;
    press(c, ...MODE, 'D1', ...values(1, 2, 3, 4, 5), 'DOWN', 'RIGHT', ...values(1, 2, 3, 2, 1));
    press(c, 'AC', 'AC', 'D2', 'OPTN', 'D7', 'D4', 'EQ');
    expect(st(c).result).toBe('-0,8660254038');
    press(c, 'AC', 'OPTN', 'D7', 'D1', 'D0', 'EQ');
    expect(st(c).result).toBe('0,5');
  });

  it('Fehler: Regression mit zu wenigen Punkten', () => {
    const c = press(newCalc(), ...MODE, 'D2', ...values(1), 'DOWN', 'RIGHT', ...values(2), 'OPTN', 'D4');
    expect(st(c).phase).toBe('error');
    expect(screen(c)[0]).toBe('Mathem. Fehler');
    press(c, 'AC');
    expect(st(c).phase).toBe('editor');
  });
});
