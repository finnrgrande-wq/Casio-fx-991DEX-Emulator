import { describe, expect, it } from 'vitest';
import { TableScreen } from '../../src/modes/table/tableScreen';
import { GraphScreen } from '../../src/modes/table/tableGraph';
import { cellText } from '../../src/modes/table/format';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press } from '../helpers';

const table = (c: Calculator) => c.top as TableScreen;
const enter: KeyId[] = ['MENU', 'D9'];
/** SETUP → Tabellen → nur f(x). */
const F_ONLY: KeyId[] = ['SHIFT', 'MENU', 'DOWN', 'DOWN', 'D2', 'D1'];

const F_P15: KeyId[] = ['D2', 'X', 'SQUARE', 'SUB', 'D3', 'X'];
const G_P15: KeyId[] = ['D2', 'X', 'SUB', 'D1'];
const F_P08: KeyId[] = ['D0', 'COMMA', 'D5', 'X', 'SQUARE', 'SUB', 'D2', 'X'];
const G_P08: KeyId[] = ['D2', 'X', 'SUB', 'D1'];

/** Eingabe von Start, Ende, Inkre jeweils mit =. */
const range = (start: KeyId[], end: KeyId[], step: KeyId[]): KeyId[] => [...start, 'EQ', ...end, 'EQ', ...step, 'EQ'];

function p15(): Calculator {
  return press(newCalc(), ...enter, ...F_P15, 'EQ', ...G_P15, 'EQ', ...range(['NEG', 'D5'], ['D5'], ['D1']));
}

describe('Tabellen (Kurzanleitung S. 8 und 15)', () => {
  it('Einstieg zeigt f(x)=, = führt zu g(x)= und zum Bereich', () => {
    const c = press(newCalc(), ...enter);
    expect(c.top).toBeInstanceOf(TableScreen);
    expect(table(c).currentPhase).toBe('f');
    press(c, ...F_P15, 'EQ');
    expect(table(c).currentPhase).toBe('g');
    press(c, ...G_P15, 'EQ');
    expect(table(c).currentPhase).toBe('range');
    press(c, 'EQ', 'EQ', 'EQ');
    expect(table(c).currentPhase).toBe('table');
  });

  it('S. 15: f = 2x²−3x, g = 2x−1, −5 … 5 in Schritten von 1', () => {
    const c = p15();
    const t = table(c);
    expect(t.currentPhase).toBe('table');
    expect(t.hasG).toBe(true);
    expect(t.rows).toHaveLength(11);
    expect(t.rows.slice(0, 4)).toEqual([
      { x: -5, f: 65, g: -11 },
      { x: -4, f: 44, g: -9 },
      { x: -3, f: 27, g: -7 },
      { x: -2, f: 14, g: -5 },
    ]);
    expect(t.cells[0]).toEqual(['-5', '65', '-11']);
  });

  it('S. 8: f = 0,5x²−2x, g = 2x−1, x = 0 … 3', () => {
    const c = press(newCalc(), ...enter, ...F_P08, 'EQ', ...G_P08, 'EQ', ...range(['D0'], ['D3'], ['D1']));
    const t = table(c);
    expect(t.rows.map((r) => r.x)).toEqual([0, 1, 2, 3]);
    expect(t.rows.map((r) => r.f)).toEqual([0, -1.5, -2, -1.5]);
    expect(t.rows.map((r) => r.g)).toEqual([-1, 1, 3, 5]);
    expect(t.cells[1]).toEqual(['1', '-1,5', '1']);
  });

  it('Standardbereich 1 / 5 / 1 ergibt 5 Zeilen; Bruchschablonen und Schrittweite 0,5', () => {
    const c = press(newCalc(), ...enter, 'X', 'EQ', 'EQ', 'EQ', 'EQ', 'EQ');
    expect(table(c).rows.map((r) => r.x)).toEqual([1, 2, 3, 4, 5]);
    expect(table(c).rows.map((r) => r.g)).toEqual([null, null, null, null, null]);
    expect(table(c).hasG).toBe(false);
    // f(x) = x² + 1, g(x) = x² − 1 von −1 bis 1 in Schritten von 0,5 (Bedienungsanleitung)
    const d = press(newCalc(), ...enter, 'X', 'SQUARE', 'ADD', 'D1', 'EQ', 'X', 'SQUARE', 'SUB', 'D1', 'EQ');
    press(d, ...range(['NEG', 'D1'], ['D1'], ['D0', 'COMMA', 'D5']));
    expect(table(d).rows).toEqual([
      { x: -1, f: 2, g: 0 },
      { x: -0.5, f: 1.25, g: -0.75 },
      { x: 0, f: 1, g: -1 },
      { x: 0.5, f: 1.25, g: -0.75 },
      { x: 1, f: 2, g: 0 },
    ]);
  });

  it('g(x) leer: nur f wird tabelliert', () => {
    const c = press(newCalc(), ...enter, 'X', 'EQ', 'EQ', 'EQ', 'EQ', 'EQ');
    expect(table(c).hasG).toBe(false);
    expect(table(c).cells[0]).toEqual(['1', '1']);
  });

  it('Bereichsgrenzen: 30 Zeilen mit f und g, 45 nur mit f', () => {
    const c = press(newCalc(), ...enter, 'X', 'EQ', 'X', 'EQ', 'EQ', 'D1', 'D0', 'D0', 'EQ', 'EQ');
    expect(table(c).currentPhase).toBe('error');
    expect(table(c).currentError?.message).toBe('Bereichsfehler');
    press(c, 'AC');
    expect(table(c).currentPhase).toBe('range');

    const ok30 = press(newCalc(), ...enter, 'X', 'EQ', 'X', 'EQ', 'EQ', 'D3', 'D0', 'EQ', 'EQ');
    expect(table(ok30).rows).toHaveLength(30);
    const bad31 = press(newCalc(), ...enter, 'X', 'EQ', 'X', 'EQ', 'EQ', 'D3', 'D1', 'EQ', 'EQ');
    expect(table(bad31).currentError?.message).toBe('Bereichsfehler');

    const f = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'EQ', 'D4', 'D5', 'EQ', 'EQ');
    expect(table(f).currentPhase).toBe('table');
    expect(table(f).rows).toHaveLength(45);
    const f46 = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'EQ', 'D4', 'D6', 'EQ', 'EQ');
    expect(table(f46).currentError?.message).toBe('Bereichsfehler');
  });

  it('Schrittweite 0 oder Start > Ende: Bereichsfehler', () => {
    const c = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'EQ', 'EQ', 'D0', 'EQ');
    expect(table(c).currentError?.message).toBe('Bereichsfehler');
    const d = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'D9', 'EQ', 'D3', 'EQ', 'EQ');
    expect(table(d).currentError?.message).toBe('Bereichsfehler');
  });

  it('+ und − setzen x der Zeile darüber ± Schrittweite; + hängt neue Zeilen an', () => {
    const c = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'EQ', 'EQ', 'EQ');
    const t = table(c);
    expect(t.rows).toHaveLength(5);
    press(c, 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'DOWN');
    expect(t.selected).toEqual({ row: 5, col: 0 });
    press(c, 'ADD');
    expect(t.rows.map((r) => r.x)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(t.rows[5].f).toBe(6);
    press(c, 'DOWN', 'ADD');
    expect(t.rows[6]).toEqual({ x: 7, f: 7, g: null });
    // − in einer bestehenden Zeile
    press(c, 'UP', 'UP', 'UP', 'SUB');
    expect(t.rows[3]).toEqual({ x: 2, f: 2, g: null });
    // Zeile 1 hat keine Zeile darüber: − und + sind normale Eingabe, (−) beginnt eine negative Zahl
    press(c, 'UP', 'UP', 'UP', 'NEG', 'D8', 'EQ');
    expect(t.rows[0].x).toBe(-8);
    expect(t.rows[0].f).toBe(-8);
  });

  it('x-Zelle überschreiben berechnet die Zeile neu; f und g sind schreibgeschützt', () => {
    const c = p15();
    const t = table(c);
    press(c, 'DOWN', 'D1', 'D0', 'EQ');
    expect(t.rows[1]).toEqual({ x: 10, f: 170, g: 19 });
    expect(t.rows[0]).toEqual({ x: -5, f: 65, g: -11 });
    press(c, 'RIGHT', 'D7', 'EQ');
    expect(t.rows[1].f).toBe(170);
    expect(t.selected).toEqual({ row: 1, col: 1 });
    press(c, 'RIGHT', 'ADD');
    expect(t.rows[1].g).toBe(19);
    // Eine Rechnung in der Zelle ist erlaubt: 2+3
    press(c, 'LEFT', 'LEFT', 'D2', 'ADD', 'D3', 'EQ');
    expect(t.rows[1].x).toBe(5);
    // AC bricht die Eingabe ab
    press(c, 'D9', 'AC');
    expect(t.rows[1].x).toBe(5);
    expect(t.currentPhase).toBe('table');
  });

  it('ungültiger Wert in einer Funktion: ERROR in der Zelle', () => {
    // f(x) = 1/x
    const c = press(newCalc(), ...F_ONLY, ...enter, 'FRAC', 'D1', 'DOWN', 'X', 'EQ', 'D0', 'EQ', 'D2', 'EQ', 'EQ');
    expect(table(c).currentPhase).toBe('table');
    expect(table(c).cells[0]).toEqual(['0', 'ERROR']);
    expect(table(c).rows[0].f).toBeNull();
    expect(table(c).cells[1]).toEqual(['1', '1']);
  });

  it('Syntaxfehler in der Funktion: Fehlerbildschirm, AC zurück zur Eingabe', () => {
    const c = press(newCalc(), ...enter, 'D2', 'ADD', 'EQ');
    expect(table(c).currentError?.message).toBe('Syntaxfehler');
    press(c, 'AC');
    expect(table(c).currentPhase).toBe('f');
  });

  it('AC in der Tabelle: zurück zu f(x) mit erhaltener Funktion', () => {
    const c = p15();
    press(c, 'AC');
    expect(table(c).currentPhase).toBe('f');
    press(c, 'EQ');
    expect(table(c).currentPhase).toBe('g');
    press(c, 'EQ', 'EQ', 'EQ', 'EQ');
    // Bereich blieb erhalten: −5 … 5
    expect(table(c).rows).toHaveLength(11);
    expect(table(c).rows[0]).toEqual({ x: -5, f: 65, g: -11 });
  });

  it('Tabelle und Funktionen bleiben nach einem Neustart erhalten', () => {
    const store = memStore();
    const a = press(newCalc(store), ...enter, ...F_P15, 'EQ', ...G_P15, 'EQ', ...range(['NEG', 'D5'], ['D5'], ['D1']));
    press(a, 'DOWN', 'D9', 'EQ');
    const b = newCalc(store);
    expect(b.top).toBeInstanceOf(TableScreen);
    expect(table(b).currentPhase).toBe('table');
    expect(table(b).rows).toHaveLength(11);
    expect(table(b).rows[1]).toEqual({ x: 9, f: 135, g: 17 });
    press(b, 'AC');
    const c = newCalc(store);
    expect(table(c).currentPhase).toBe('f');
    expect(table(c).cells).toEqual([]);
    press(c, 'EQ', 'EQ', 'EQ', 'EQ', 'EQ');
    expect(table(c).rows).toHaveLength(11);
  });

  it('Erzeugen der Tabelle ändert die Variable x', () => {
    const c = p15();
    expect(toNumber(deserialize(c.state.vars.x))).toBe(5);
    press(c, 'DOWN', 'D7', 'EQ');
    expect(toNumber(deserialize(c.state.vars.x))).toBe(7);
  });

  it('Ändern von Eingabe/Ausgabe löscht die Funktionen', () => {
    const c = press(newCalc(), ...enter, ...F_P15);
    expect(table(c).currentPhase).toBe('f');
    // SETUP → Eingabe/Ausgabe → Lin. --> Linear
    press(c, 'SHIFT', 'MENU', 'D1', 'D3');
    expect(c.top).toBeInstanceOf(TableScreen);
    expect(table(c).currentPhase).toBe('f');
    press(c, 'EQ');
    // leere f(x)-Eingabe bleibt stehen
    expect(table(c).currentPhase).toBe('f');
    expect((c.state.modeData.table as { f: unknown[] }).f).toEqual([]);
  });

  it('mehr als vier Zeilen: Statusanzeige ▲▼ beim Scrollen', () => {
    const c = press(newCalc(), ...F_ONLY, ...enter, 'X', 'EQ', 'EQ', 'D1', 'D0', 'EQ', 'EQ');
    expect(c.render().status.down).toBe(true);
    expect(c.render().status.up).toBe(false);
    press(c, 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'DOWN');
    expect(c.render().status.up).toBe(true);
  });
});

describe('Grafik (SHIFT OPTN)', () => {
  it('öffnet eine Grafik und schließt sie mit AC oder SHIFT OPTN', () => {
    const c = p15();
    press(c, 'SHIFT', 'OPTN');
    expect(c.top).toBeInstanceOf(GraphScreen);
    expect(c.render().scene.ops.length).toBeGreaterThan(20);
    press(c, 'AC');
    expect(c.top).toBeInstanceOf(TableScreen);
    press(c, 'SHIFT', 'OPTN', 'SHIFT', 'OPTN');
    expect(c.top).toBeInstanceOf(TableScreen);
  });
});

describe('Zellenformat', () => {
  it('kürzt auf höchstens 6 Zeichen', () => {
    expect(cellText(65)).toBe('65');
    expect(cellText(-1.5)).toBe('-1,5');
    expect(cellText(1 / 3)).toBe('0,3333');
    expect(cellText(1234567)).toBe('1,23E6');
    expect(cellText(0.00001234)).toBe('1,2E-5');
    expect(cellText(1e10)).toBe('1E10');
    expect(cellText(Math.PI)).toBe('3,1416');
    for (const x of [123456.789, -98765.4321, 1e-9, -2.5e27, 0.1 + 0.2]) expect(cellText(x).length).toBeLessThanOrEqual(6);
  });
});
