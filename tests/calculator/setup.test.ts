import { describe, expect, it } from 'vitest';
import { CalcScreen } from '../../src/modes/calc/calcScreen';
import { ConfirmDialog } from '../../src/modes/setup';
import { ListMenu } from '../../src/modes/listMenu';
import { formToText } from '../../src/display/resultForm';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press, screen } from '../helpers';

const SETUP: KeyId[] = ['SHIFT', 'MENU'];
const RESET: KeyId[] = ['SHIFT', 'D9'];
const calc = (...keys: KeyId[]) => press(newCalc(), ...keys);
const result = (c: Calculator) => {
  const r = (c.top as CalcScreen).currentResult;
  return r && formToText(r);
};

describe('SETUP (Kurzanleitung S. 5)', () => {
  it('vier Seiten mit den Texten des Originals', () => {
    const c = calc(...SETUP);
    expect(c.top).toBeInstanceOf(ListMenu);
    expect(screen(c)).toEqual(['1:Eingabe/Ausgabe', '2:Winkeleinheit', '3:Zahlenformat', '4:Dezimalpräfixe']);
    press(c, 'DOWN');
    expect(screen(c)).toEqual(['1:Bruchergebnis', '2:Komplexe Zahlen', '3:Statistik', '4:Tabellenkalk.']);
    press(c, 'DOWN');
    expect(screen(c)).toEqual(['1:Gleichung/Funkt', '2:Tabellen', '3:Period. Darst.', '4:1000er-Trennung']);
    press(c, 'DOWN');
    expect(screen(c)).toEqual(['1:Mehrzeilengröße', '2:QR-Code', '3:Automat Aus', '4:Kontrast']);
    press(c, 'D1');
    expect(screen(c)).toEqual(['1:Normale Schrift', '2:Kleine Schrift']);
    press(c, 'AC');
    expect(c.top).toBeInstanceOf(CalcScreen);
  });

  it('Eingabe/Ausgabe zeigt die Untermenü-Texte', () => {
    expect(screen(calc(...SETUP, 'D1'))).toEqual(['1:Math --> Math', '2:Math --> Dezim.', '3:Lin. --> Linear', '4:Lin. --> Dezim.']);
  });

  it('Fix 3: 100÷7 = 14,286 mit Anzeige FIX', () => {
    const c = calc(...SETUP, 'D3', 'D1');
    expect(screen(c)).toEqual(['Fix 0~9?']);
    press(c, 'D3');
    expect(c.state.settings.format).toEqual({ kind: 'fix', n: 3 });
    expect(c.render().status.fix).toBe(true);
    press(c, 'D1', 'D0', 'D0', 'DIV', 'D7', 'SHIFT', 'EQ');
    expect(result(c)).toBe('14,286');
  });

  it('Sci 5: 1÷7 ≈ 1,4286×10⁻¹; Norm 2: 1÷200 ≈ 0,005', () => {
    const c = calc(...SETUP, 'D3', 'D2', 'D5', 'D1', 'DIV', 'D7', 'SHIFT', 'EQ');
    expect(result(c)).toBe('1,4286E-1');
    press(c, ...SETUP, 'D3', 'D3', 'D2', 'D1', 'DIV', 'D2', 'D0', 'D0', 'SHIFT', 'EQ');
    expect(result(c)).toBe('0,005');
    press(c, ...SETUP, 'D3', 'D3', 'D1', 'D1', 'DIV', 'D2', 'D0', 'D0', 'SHIFT', 'EQ');
    expect(result(c)).toBe('5E-3');
  });

  it('Winkeleinheit Bogenmaß: Anzeige R und sin(π÷6) = 1/2', () => {
    const c = calc(...SETUP, 'D2', 'D2');
    expect(c.render().status.angle).toBe('R');
    press(c, 'SIN', 'SHIFT', 'EXP', 'DIV', 'D6', 'RPAREN', 'EQ');
    expect(result(c)).toBe('1/2');
  });

  it('Änderung von Eingabe/Ausgabe löscht den Ablaufspeicher', () => {
    const c = calc('D2', 'EQ', ...SETUP, 'D1', 'D3');
    expect(c.state.settings.io).toBe('linLin');
    press(c, 'UP');
    expect(result(c)).toBeUndefined();
    press(c, 'D1', 'DIV', 'D3', 'EQ');
    expect(result(c)).toBe('1/3');
  });

  it('Bruchergebnis ab/c zeigt gemischte Brüche', () => {
    const c = calc(...SETUP, 'DOWN', 'D1', 'D1', 'D1', 'D3', 'DIV', 'D6', 'EQ');
    expect(result(c)).toBe('2 1/6');
  });

  it('Dezimalpräfixe: 999k + 25k = 1,024M', () => {
    const c = calc(...SETUP, 'D4', 'D1', 'D9', 'D9', 'D9', 'OPTN', 'D3', 'EQ', 'ADD', 'D2', 'D5', 'OPTN', 'D3', 'EQ', 'EQ');
    expect(c.render().status.prefix).toBe(true);
    expect(result(c)).toBe('1,024M');
  });

  it('1000er-Trennung', () => {
    const c = calc(...SETUP, 'DOWN', 'DOWN', 'D4', 'D1', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'EQ');
    expect(result(c)).toBe("1'234'567");
  });

  it('Period. Darst. Aus: S⇔D wechselt nur Bruch ↔ Dezimal', () => {
    const c = calc(...SETUP, 'DOWN', 'DOWN', 'D3', 'D2', 'D1', 'DIV', 'D7', 'EQ', 'SD');
    expect(result(c)).toBe('0,1428571429');
  });

  it('Kontrast ◀▶ und Speicherung über einen Neustart', () => {
    const store = memStore();
    const c = press(newCalc(store), ...SETUP, 'DOWN', 'DOWN', 'DOWN', 'D4', 'RIGHT', 'RIGHT', 'AC');
    expect(c.state.settings.contrast).toBe(7);
    press(c, ...SETUP, 'D2', 'D3');
    const again = newCalc(store);
    expect(again.state.settings.contrast).toBe(7);
    expect(again.state.settings.angle).toBe('G');
  });
});

describe('RESET (SHIFT 9)', () => {
  it('Setupdaten: Einstellungen zurück, Kontrast bleibt', () => {
    const c = calc(...SETUP, 'D2', 'D2', ...SETUP, 'DOWN', 'DOWN', 'DOWN', 'D4', 'LEFT', 'AC', ...RESET);
    expect(screen(c)).toEqual(['Zurücksetzen?', '1:Setupdaten', '2:Speicher', '3:Alle initialis.']);
    press(c, 'D1', 'EQ');
    expect((c.top as ConfirmDialog).finished).toBe(true);
    press(c, 'AC');
    expect(c.state.settings.angle).toBe('D');
    expect(c.state.settings.contrast).toBe(4);
  });

  it('Speicher: Variablen und M werden gelöscht', () => {
    const c = calc('D5', 'STO', 'NEG', 'D3', 'MPLUS', ...RESET, 'D2', 'EQ', 'AC');
    expect(toNumber(deserialize(c.state.vars.A))).toBe(0);
    expect(c.render().status.m).toBe(false);
  });

  it('Alle initialisieren: Modus Berechnungen, Standard-Setup', () => {
    const c = calc('MENU', 'D9', ...SETUP, 'D2', 'D3', ...RESET, 'D3', 'EQ', 'AC');
    expect(c.mode).toBe('calc');
    expect(c.state.settings.angle).toBe('D');
  });

  it('AC bricht die Bestätigung ab', () => {
    const c = calc(...SETUP, 'D2', 'D2', ...RESET, 'D1', 'AC');
    expect(c.state.settings.angle).toBe('R');
    expect(c.top).toBeInstanceOf(CalcScreen);
  });
});
