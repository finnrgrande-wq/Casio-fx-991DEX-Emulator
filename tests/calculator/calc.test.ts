import { describe, expect, it } from 'vitest';
import { CalcScreen } from '../../src/modes/calc/calcScreen';
import { formToText } from '../../src/display/resultForm';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press } from '../helpers';

/** Tastenfolge im Berechnungsmodus; liefert das angezeigte Ergebnis als Text. */
function calc(...keys: KeyId[]): Calculator {
  return press(newCalc(), ...keys);
}

function result(c: Calculator): string | undefined {
  const scr = c.top as CalcScreen;
  const r = scr.currentResult;
  return r && formToText(r);
}

function error(c: Calculator): string | undefined {
  return (c.top as CalcScreen).currentError?.message;
}

const varValue = (c: Calculator, name: 'A' | 'M' | 'x' | 'y') => toNumber(deserialize(c.state.vars[name]));

describe('Tastenfolgen aus der Kurzanleitung', () => {
  it('√7/3 + √8/4 = (2√7+3√2)/6', () => {
    const c = calc('FRAC', 'SQRT', 'D7', 'RIGHT', 'DOWN', 'D3', 'RIGHT', 'ADD', 'FRAC', 'SQRT', 'D8', 'RIGHT', 'DOWN', 'D4', 'EQ');
    expect(result(c)).toBe('(2√7+3√2)/6');
  });

  it('2π → S⇔D → 6,283185307', () => {
    const c = calc('D2', 'SHIFT', 'EXP', 'EQ');
    expect(result(c)).toBe('2π');
    press(c, 'SD');
    expect(result(c)).toBe('6,283185307');
    press(c, 'SD');
    expect(result(c)).toBe('2π');
  });

  it('SHIFT = liefert sofort die Dezimalzahl', () => {
    expect(result(calc('D2', 'SHIFT', 'EXP', 'SHIFT', 'EQ'))).toBe('6,283185307');
  });

  it('∫₀^1,5 (2x²−3x) dx = −9/8', () => {
    const c = calc('INTEGRAL', 'D2', 'X', 'SQUARE', 'SUB', 'D3', 'X', 'RIGHT', 'D0', 'RIGHT', 'D1', 'COMMA', 'D5', 'EQ');
    expect(result(c)).toBe('-9/8');
  });

  it('d/dx(2x²−3x) bei x = 3 → 9', () => {
    expect(result(calc('SHIFT', 'INTEGRAL', 'D2', 'X', 'SQUARE', 'SUB', 'D3', 'X', 'RIGHT', 'D3', 'EQ'))).toBe('9');
  });

  it('5! = 120 und 10C4 = 210', () => {
    expect(result(calc('D5', 'SHIFT', 'INV', 'EQ'))).toBe('120');
    expect(result(calc('D1', 'D0', 'SHIFT', 'DIV', 'D4', 'EQ'))).toBe('210');
  });

  it('Variable speichern, verwenden, aufrufen, löschen', () => {
    const c = calc('D3', 'ADD', 'D5', 'STO', 'NEG');
    expect(result(c)).toBe('8');
    expect(varValue(c, 'A')).toBe(8);
    press(c, 'ALPHA', 'NEG', 'MUL', 'D1', 'D0', 'EQ');
    expect(result(c)).toBe('80');
    press(c, 'SHIFT', 'STO', 'NEG', 'EQ');
    expect(result(c)).toBe('8');
    press(c, 'D0', 'STO', 'NEG');
    expect(varValue(c, 'A')).toBe(0);
  });

  it('M+ und M− mit Anzeige M', () => {
    const c = calc('D1', 'D0', 'MUL', 'D5', 'MPLUS');
    expect(varValue(c, 'M')).toBe(50);
    expect(c.render().status.m).toBe(true);
    press(c, 'D1', 'D0', 'ADD', 'D5', 'SHIFT', 'MPLUS');
    expect(varValue(c, 'M')).toBe(35);
    press(c, 'D0', 'STO', 'MPLUS');
    expect(c.render().status.m).toBe(false);
  });

  it('STO zeigt den Indikator, bis eine Variable gewählt ist', () => {
    const c = calc('D7', 'STO');
    expect(c.render().status.sto).toBe(true);
    press(c, 'TAN');
    expect(c.render().status.sto).toBe(false);
  });
});

describe('Ablaufspeicher, Ans und Wiederholung', () => {
  it('Operator nach einem Ergebnis rechnet mit Ans weiter', () => {
    const c = calc('D1', 'D4', 'MUL', 'D1', 'D3', 'EQ');
    expect(result(c)).toBe('182');
    press(c, 'DIV', 'D7', 'EQ');
    expect(result(c)).toBe('26');
  });

  it('▲ blättert zurück', () => {
    const c = calc('D2', 'ADD', 'D2', 'EQ', 'D3', 'ADD', 'D3', 'EQ');
    expect(result(c)).toBe('6');
    press(c, 'UP');
    expect(result(c)).toBe('4');
    expect(c.render().status.down).toBe(true);
    press(c, 'DOWN');
    expect(result(c)).toBe('6');
  });

  it('◀ bearbeitet die letzte Rechnung (4×3+2 → 4×3−7)', () => {
    const c = calc('D4', 'MUL', 'D3', 'ADD', 'D2', 'EQ');
    expect(result(c)).toBe('14');
    press(c, 'LEFT', 'DEL', 'DEL', 'SUB', 'D7', 'EQ');
    expect(result(c)).toBe('5');
  });

  it('= wiederholt die angezeigte Rechnung mit neuem Ans', () => {
    const c = calc('D2', 'EQ', 'ANS', 'MUL', 'D2', 'EQ');
    expect(result(c)).toBe('4');
    press(c, 'EQ');
    expect(result(c)).toBe('8');
  });

  it('Moduswechsel löscht den Ablaufspeicher, Ans bleibt', () => {
    const c = calc('D9', 'EQ', 'MENU', 'D1');
    press(c, 'UP');
    expect(result(c)).toBeUndefined();
    press(c, 'ANS', 'EQ');
    expect(result(c)).toBe('9');
  });
});

describe('Fehler', () => {
  it('Division durch 0 → Mathem. Fehler, AC löscht', () => {
    const c = calc('D5', 'DIV', 'D0', 'EQ');
    expect(error(c)).toBe('Mathem. Fehler');
    press(c, 'AC');
    expect(error(c)).toBeUndefined();
    expect((c.top as CalcScreen).editor.isEmpty).toBe(true);
  });

  it('Syntaxfehler: ▶ springt zur Fehlerstelle', () => {
    const c = calc('D2', 'ADD', 'MUL', 'D3', 'EQ');
    expect(error(c)).toBe('Syntaxfehler');
    press(c, 'RIGHT');
    const ed = (c.top as CalcScreen).editor;
    expect(ed.cursor).toEqual({ path: [], pos: 2 });
    // DEL löscht links vom Cursor, also das „+“
    press(c, 'DEL', 'EQ');
    expect(result(c)).toBe('6');
  });
});

describe('Ausgabeformen', () => {
  it('Brüche: 1/3 + 1/2 = 5/6, S⇔D und gemischt', () => {
    const c = calc('FRAC', 'D1', 'DOWN', 'D3', 'RIGHT', 'ADD', 'FRAC', 'D1', 'DOWN', 'D2', 'EQ');
    expect(result(c)).toBe('5/6');
    press(c, 'SD');
    expect(result(c)).toBe('0,8333333333');
    const d = calc('FRAC', 'D1', 'D3', 'DOWN', 'D6', 'EQ', 'SHIFT', 'SD');
    expect(result(d)).toBe('2 1/6');
  });

  it('Math → Dezim.: Dezimalzahl zuerst, S⇔D zeigt den Bruch', () => {
    const c = newCalc();
    c.state.settings.io = 'mathDec';
    press(c, 'FRAC', 'D1', 'DOWN', 'D3', 'EQ');
    expect(result(c)).toBe('0,3333333333');
    press(c, 'SD');
    expect(result(c)).toBe('1/3');
  });

  it('ENG: 1234 → 1,234×10³ → 1234×10⁰', () => {
    const c = calc('D1', 'D2', 'D3', 'D4', 'EQ', 'ENG');
    expect(result(c)).toBe('1,234E3');
    press(c, 'ENG');
    expect(result(c)).toBe('1234E0');
  });

  it('Pol(√2;√2) → r=2;θ=45 und setzt x, y', () => {
    const c = calc('SHIFT', 'ADD', 'SQRT', 'D2', 'RIGHT', 'SHIFT', 'RPAREN', 'SQRT', 'D2', 'RIGHT', 'RPAREN', 'EQ');
    expect(result(c)).toBe('r=2;θ=45');
    expect(varValue(c, 'x')).toBe(2);
    expect(varValue(c, 'y')).toBe(45);
  });

  it('Rec(2;45) → x und y', () => {
    const c = calc('SHIFT', 'SUB', 'D2', 'SHIFT', 'RPAREN', 'D4', 'D5', 'RPAREN', 'EQ');
    expect(result(c)).toBe('𝑥=1,414213562;𝑦=1,414213562');
  });

  it('Division mit Rest: 5 ÷R 2 → 2;R=1', () => {
    expect(result(calc('D5', 'ALPHA', 'FRAC', 'D2', 'EQ'))).toBe('2;R=1');
  });

  it('OPTN: Hyperbelfunktion und Winkeleinheit', () => {
    expect(result(calc('OPTN', 'D1', 'D1', 'D0', 'RPAREN', 'EQ'))).toBe('0');
    const c = calc('LPAREN', 'SHIFT', 'EXP', 'DIV', 'D2', 'RPAREN', 'OPTN', 'D2', 'D2', 'EQ');
    expect(result(c)).toBe('90');
  });

  it('Ran# und RanInt# liefern Werte im Bereich', () => {
    const c = calc('ALPHA', 'COMMA', 'D1', 'SHIFT', 'RPAREN', 'D6', 'RPAREN', 'EQ');
    const v = Number(result(c));
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(6);
  });

  it('INS: 1+7 → 1+√7', () => {
    const c = calc('D1', 'ADD', 'D7', 'LEFT', 'SHIFT', 'DEL', 'SQRT', 'EQ');
    expect(result(c)).toBe('1+√7');
  });
});
