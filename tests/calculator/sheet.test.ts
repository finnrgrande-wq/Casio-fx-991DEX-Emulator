import { describe, expect, it } from 'vitest';
import { SheetScreen } from '../../src/modes/sheet/sheetScreen';
import type { Calculator } from '../../src/calculator/calculator';
import { deserialize, toNumber } from '../../src/core/value';
import type { KeyId } from '../../src/keys/keymap';
import { newCalc, press, screen } from '../helpers';

const sheet = (c: Calculator) => c.top as SheetScreen;
const val = (c: Calculator, ref: string) => sheet(c).valueText(ref);
const txt = (c: Calculator, ref: string) => sheet(c).contentText(ref);

const LETTER: Record<string, KeyId[]> = {
  A: ['ALPHA', 'NEG'], B: ['ALPHA', 'DMS'], C: ['ALPHA', 'INV'], D: ['ALPHA', 'SIN'], E: ['ALPHA', 'COS'],
  '=': ['ALPHA', 'CALC'], ':': ['ALPHA', 'INTEGRAL'], '+': ['ADD'], '−': ['SUB'], '×': ['MUL'], '(': ['LPAREN'], ')': ['RPAREN'],
  '$': ['OPTN', 'DOWN', 'D1'],
};
/** Zeichenfolge als Tasten (Funktionen: s=Sum, n=Min, x=Max, m=Mean). */
function typ(s: string): KeyId[] {
  const fn: Record<string, KeyId> = { n: 'D1', x: 'D2', m: 'D3', s: 'D4' };
  return [...s].flatMap((ch): KeyId[] => {
    if (/\d/.test(ch)) return [`D${ch}` as KeyId];
    if (ch in fn) return ['OPTN', fn[ch]];
    return LETTER[ch];
  });
}
/** Gibt s in die aktuelle Zelle ein und bestätigt (Cursor wandert eine Zeile nach unten). */
const put = (c: Calculator, s: string) => press(c, ...typ(s), 'EQ');
const go = (c: Calculator, ...keys: KeyId[]) => press(c, ...keys);
/** Bewegt den Zellencursor zur Zelle ref. */
function at(c: Calculator, ref: string): Calculator {
  const cur = sheet(c).cursorRef;
  const dc = ref.charCodeAt(0) - cur.charCodeAt(0);
  const dr = Number(ref.slice(1)) - Number(cur.slice(1));
  for (let i = 0; i < Math.abs(dc); i++) press(c, dc > 0 ? 'RIGHT' : 'LEFT');
  for (let i = 0; i < Math.abs(dr); i++) press(c, dr > 0 ? 'DOWN' : 'UP');
  return c;
}
const fresh = () => press(newCalc(), 'MENU', 'D8');

/** Bsp. 1–3 der Bedienungsanleitung: A1:A3 = 35, 42, 49; B1 = =A1+7; B2 = =A2+7. */
function manual(): Calculator {
  const c = fresh();
  put(c, '7×5');
  put(c, '7×6');
  put(c, 'A2+7');
  at(c, 'B1');
  put(c, '=A1+7');
  put(c, '=A2+7');
  return c;
}

describe('Tabellenkalkulation (Anleitung S. 41–45)', () => {
  it('Einstieg: leere Tabelle, Cursor A1', () => {
    const c = fresh();
    expect(c.top).toBeInstanceOf(SheetScreen);
    expect(sheet(c).cursorRef).toBe('A1');
    expect(val(c, 'A1')).toBeUndefined();
  });

  it('Konstanten werden einmal berechnet, Formeln bleiben erhalten', () => {
    const c = manual();
    expect(val(c, 'A1')).toBe('35');
    expect(val(c, 'A2')).toBe('42');
    expect(val(c, 'A3')).toBe('49');
    expect(txt(c, 'A3')).toBe('A2+7');
    expect(txt(c, 'B1')).toBe('=A1+7');
    expect(val(c, 'B1')).toBe('42');
    expect(val(c, 'B2')).toBe('49');
  });

  it('Formel wird neu berechnet, Konstante nicht', () => {
    const c = manual();
    at(c, 'A1');
    put(c, '10');
    expect(val(c, 'B1')).toBe('17');
    expect(val(c, 'A3')).toBe('49');
  });

  it('Sum(A1:A3) in A4 ergibt 126; Min, Max, Mean', () => {
    const c = manual();
    at(c, 'A4');
    put(c, '=sA1:A3)');
    expect(txt(c, 'A4')).toBe('=Sum(A1:A3)');
    expect(val(c, 'A4')).toBe('126');
    expect(sheet(c).cursorRef).toBe('A5');
    put(c, '=nA1:A3)');
    put(c, '=xA1:A3)');
    put(c, '=mA1:A3)');
    expect([val(c, 'A5'), val(c, 'A6'), val(c, 'A7')]).toEqual(['35', '49', '42']);
  });

  it('Formel füllen: =2A1−3 in B1:B3, Wert füllen B1×3 in C1:C3', () => {
    const c = manual();
    at(c, 'B1');
    go(c, 'OPTN', 'D1');
    go(c, ...typ('2A1−3'));
    go(c, 'EQ', 'DEL', 'D3', 'EQ');
    expect(txt(c, 'B2')).toBe('=2A2−3');
    expect(txt(c, 'B3')).toBe('=2A3−3');
    expect([val(c, 'B1'), val(c, 'B2'), val(c, 'B3')]).toEqual(['67', '81', '95']);
    at(c, 'C1');
    go(c, 'OPTN', 'D2');
    go(c, ...typ('B1×3'));
    go(c, 'EQ', 'DEL', 'D3', 'EQ');
    expect([val(c, 'C1'), val(c, 'C2'), val(c, 'C3')]).toEqual(['201', '243', '285']);
    expect(txt(c, 'C2')).toBe('B2×3');
  });

  it('Kurzanleitung S. 14: A1 = 1, Formel füllen =A1+1 in A2:A20', () => {
    const c = fresh();
    put(c, '1');
    go(c, 'OPTN', 'D1', ...typ('A1+1'), 'EQ', 'DEL', ...typ('20'), 'EQ');
    expect(val(c, 'A2')).toBe('2');
    expect(val(c, 'A20')).toBe('20');
    expect(txt(c, 'A3')).toBe('=A2+1');
    expect(val(c, 'A21')).toBeUndefined();
  });

  it('Kopieren und Einfügen passt relative Bezüge an, Modus bleibt bis AC', () => {
    const c = fresh();
    put(c, '1');
    go(c, 'OPTN', 'D1', ...typ('A1+1'), 'EQ', 'DEL', ...typ('3'), 'EQ');
    at(c, 'A2');
    go(c, 'OPTN', 'DOWN', 'D2');
    expect(sheet(c).pasteMode).toBe(true);
    expect(screen(c).join('|')).toContain('Einfügen:[=]');
    go(c, 'RIGHT', 'DOWN', 'EQ');
    expect(txt(c, 'B3')).toBe('=B2+1');
    expect(val(c, 'B3')).toBe('1');
    go(c, 'DOWN', 'EQ');
    expect(txt(c, 'B4')).toBe('=B3+1');
    go(c, 'AC');
    expect(sheet(c).pasteMode).toBe(false);
  });

  it('Ausschneiden und Einfügen lässt Bezüge unverändert und löscht die Quelle', () => {
    const c = manual();
    at(c, 'B1');
    go(c, 'OPTN', 'DOWN', 'D1', 'RIGHT', 'RIGHT', 'EQ');
    expect(txt(c, 'D1')).toBe('=A1+7');
    expect(txt(c, 'B1')).toBeUndefined();
    expect(sheet(c).pasteMode).toBe(false);
  });

  it('Absolute Bezüge ($) bleiben beim Kopieren erhalten', () => {
    const c = fresh();
    put(c, '5');
    at(c, 'B1');
    put(c, '=$A$1+A1');
    expect(txt(c, 'B1')).toBe('=$A$1+A1');
    expect(val(c, 'B1')).toBe('10');
    at(c, 'B1');
    go(c, 'OPTN', 'DOWN', 'D2', 'DOWN', 'EQ');
    expect(txt(c, 'B2')).toBe('=$A$1+A2');
  });

  it('Bezug außerhalb der Tabelle wird „?“ und die Zelle zeigt ERROR', () => {
    const c = fresh();
    at(c, 'B1');
    put(c, '=A1+1');
    at(c, 'B1');
    go(c, 'OPTN', 'DOWN', 'D2', 'LEFT', 'EQ');
    expect(txt(c, 'A1')).toBe('=?1+1');
    expect(val(c, 'A1')).toBe('ERROR');
  });

  it('Zirkelbezug =A1 in A1 → Zirkelbezug, nichts wird gespeichert', () => {
    const c = fresh();
    put(c, '=A1');
    expect(sheet(c).currentPhase).toBe('error');
    expect(sheet(c).errorKind).toBe('circular');
    expect(screen(c)[0]).toBe('Zirkelbezug');
    go(c, 'AC');
    expect(txt(c, 'A1')).toBeUndefined();
  });

  it('indirekter Zirkelbezug wird erkannt', () => {
    const c = fresh();
    at(c, 'B1');
    put(c, '=A1');
    at(c, 'A1');
    put(c, '=B1');
    expect(sheet(c).errorKind).toBe('circular');
  });

  it('Löschen mit DEL und Alles löschen', () => {
    const c = manual();
    at(c, 'B1');
    go(c, 'DEL');
    expect(val(c, 'B1')).toBeUndefined();
    go(c, 'OPTN', 'DOWN', 'D3');
    expect(val(c, 'A1')).toBeUndefined();
    expect(val(c, 'B2')).toBeUndefined();
  });

  it('Zelle bearbeiten lädt die Formel in den Editor', () => {
    const c = manual();
    at(c, 'B1');
    go(c, 'OPTN', 'D3');
    go(c, 'DEL', 'D9', 'EQ');
    expect(txt(c, 'B1')).toBe('=A1+9');
    at(c, 'B1');
    go(c, 'OPTN', 'D3', 'DEL', 'DEL', 'AC');
    expect(txt(c, 'B1')).toBe('=A1+9');
  });

  it('SETUP „Autom. Berechn.: Aus“ verzögert die Neuberechnung bis „Neu berechnen“', () => {
    const c = manual();
    c.state.settings.sheetAutoCalc = false;
    at(c, 'A1');
    put(c, '10');
    expect(val(c, 'B1')).toBe('42');
    go(c, 'OPTN', 'DOWN', 'D4');
    expect(val(c, 'B1')).toBe('17');
  });

  it('Formel-/Wert-Anzeige im Bearbeitungsfeld nach SETUP', () => {
    const c = manual();
    at(c, 'B1');
    expect(screen(c).join('|')).toContain('=A1+7');
    c.state.settings.sheetShowFormula = false;
    expect(screen(c).join('|')).not.toContain('=A1+7');
  });

  it('STO speichert den Zellenwert in eine Variable, RECALL fügt ihn ein', () => {
    const c = manual();
    at(c, 'A1');
    go(c, 'STO', 'DMS');
    expect(toNumber(deserialize(c.state.vars.B))).toBe(35);
    at(c, 'A5');
    go(c, 'SHIFT', 'STO', 'DMS', 'ADD', 'D1', 'EQ');
    expect(val(c, 'A5')).toBe('36');
  });

  it('Speicherfehler bei Überschreiten von 1700 Bytes', () => {
    const c = fresh();
    for (let i = 0; i < 169; i++) put(at(c, `${'ABCDE'[i % 5]}${Math.floor(i / 5) + 1}`), '1');
    at(c, 'E35');
    expect(sheet(c).currentPhase).toBe('grid');
    // 169 Konstanten à 10 Bytes = 1690; eine weitere Formel (≥ 12) passt nicht
    put(c, '=A1');
    expect(sheet(c).errorKind).toBe('memory');
  });

  it('Freier Speicher zeigt die Restkapazität', () => {
    const c = manual();
    go(c, 'OPTN', 'D4');
    expect(screen(c)).toEqual(['Freier Speicher', String(1700 - 30 - 2 * 15)]);
  });

  it('Daten gehen beim Verlassen des Modus verloren', () => {
    const c = manual();
    press(c, 'MENU', 'D1', 'MENU', 'D8');
    expect(val(c, 'A1')).toBeUndefined();
    expect(sheet(c).cursorRef).toBe('A1');
  });

  it('Rasterdarstellung: Spaltenbuchstaben, Zeilennummern und markierte Zelle', () => {
    const c = manual();
    at(c, 'A1');
    const rows = screen(c);
    expect(rows.join('|')).toMatch(/\[A\].*B.*C.*D/);
    expect(rows.join('|')).toContain('[1]');
    expect(rows.join('|')).toContain('[35]');
  });
});
