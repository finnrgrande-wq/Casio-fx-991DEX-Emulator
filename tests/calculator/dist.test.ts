import { describe, expect, it } from 'vitest';
import { DistScreen } from '../../src/modes/dist/distScreen';
import { binomialCdf, binomialPdf, poissonCdf, poissonPdf } from '../../src/core/dist/distributions';
import { deserialize, toNumber } from '../../src/core/value';
import type { Calculator } from '../../src/calculator/calculator';
import type { KeyId } from '../../src/keys/keymap';
import { memStore, newCalc, press, screen } from '../helpers';

/** Ziffernfolge als Tasten („-“ = (−), „,“ = Komma). */
const num = (s: string): KeyId[] => [...s].map((ch) => (ch === ',' ? 'COMMA' : ch === '-' ? 'NEG' : (`D${ch}` as KeyId)));
/** Werte nacheinander eingeben, je mit =. */
const enter = (...vals: string[]): KeyId[] => vals.flatMap((v) => [...num(v), 'EQ' as KeyId]);

const dist = (...keys: KeyId[]) => press(newCalc(), 'MENU', 'D7', ...keys);
const scr = (c: Calculator) => c.top as DistScreen;
const st = (c: Calculator) => scr(c).state;
const varOf = (c: Calculator, name: 'A' | 'x') => toNumber(deserialize(c.state.vars[name]));
const text = (c: Calculator) => screen(c).join('|');

/** Binomial-Dichte als Liste: k-Werte, dann n und p; Ergebnis steht in der Liste. */
const binomialList = (ks: string[], n: string, p: string) => dist('D4', 'D1', ...enter(...ks), 'EQ', ...enter(n, p));

describe('Typmenü', () => {
  it('zeigt die sieben Typen auf zwei Seiten', () => {
    const c = dist();
    expect(screen(c)).toEqual(['1:Normal-Dichte', '2:Kumul. Normal-V', '3:Inv. Normal-V.', '4:Binomial-Dichte']);
    press(c, 'DOWN');
    expect(screen(c)).toEqual(['1:Kumul. Binom.-V', '2:Poisson-Dichte', '3:Kumul.Poisson-V']);
  });

  it('Binomial/Poisson fragen nach Liste oder Variable', () => {
    const c = dist('D4');
    expect(screen(c)).toEqual(['Daten (k)', '1:Liste', '2:Variable']);
    press(c, 'D2');
    expect(st(c).stage).toBe('params');
    expect(screen(c)[0]).toBe('Binomial-Dichte');
  });

  it('Normalverteilungen gehen direkt zu den Variablen', () => {
    const c = dist('D1');
    expect(st(c).stage).toBe('params');
    expect(screen(c)).toEqual(['Normal-Dichte', '[ 𝑥    :] [0]', ' σ    : 1', ' μ    : 0']);
  });

  it('MENU verlässt die Anwendung', () => {
    const c = dist('D1');
    press(c, 'MENU', 'D1');
    expect(c.mode).toBe('calc');
  });
});

describe('Einzelwerte', () => {
  it('Normal-Dichte x = 36, σ = 2, μ = 35 → 0,1760326634', () => {
    const c = dist('D1', ...enter('36', '2', '35'));
    expect(st(c).stage).toBe('result');
    expect(st(c).result).toBeCloseTo(0.1760326634, 9);
    expect(toNumber(deserialize(c.state.ans))).toBeCloseTo(0.1760326634, 9);
    expect(text(c)).toContain('Normal-Dichte');
  });

  it('= oder AC kehrt zu den Variablen zurück, Werte bleiben', () => {
    const c = dist('D1', ...enter('36', '2', '35'), 'EQ');
    expect(st(c).stage).toBe('params');
    expect(screen(c)[1]).toContain('36');
    press(c, ...enter('1', '1', '0'), 'AC');
    expect(st(c).stage).toBe('params');
  });

  it('STO weist das Ergebnis einer Variablen zu', () => {
    const c = dist('D1', ...enter('36', '2', '35'), 'STO', 'NEG');
    expect(varOf(c, 'A')).toBeCloseTo(0.1760326634, 9);
  });

  it('Kumul. Normal-V: Untere −1, Obere 1 → 0,6826894921', () => {
    const c = dist('D2', ...enter('-1', '1'), 'EQ', 'EQ');
    expect(st(c).stage).toBe('result');
    expect(st(c).result).toBeCloseTo(0.6826894921, 9);
  });

  it('Inv. Normal-V.: Fläche 0,975 → 1,959963985', () => {
    const c = dist('D3', ...enter('0,975'), 'EQ', 'EQ');
    expect(st(c).result).toBeCloseTo(1.959963985, 9);
    expect(text(c)).toContain('xInv=');
  });

  it('Poisson-Dichte und Kumul. Poisson-V für k = 3, μ = 2', () => {
    const a = dist('DOWN', 'D2', 'D2', ...enter('3', '2'));
    expect(st(a).result).toBeCloseTo(poissonPdf(3, 2), 12);
    expect(st(a).result).toBeCloseTo(0.1804470443, 9);
    const b = dist('DOWN', 'D3', 'D2', ...enter('3', '2'));
    expect(st(b).result).toBeCloseTo(poissonCdf(3, 2), 12);
    expect(st(b).result).toBeCloseTo(0.8571234605, 9);
  });

  it('Kumul. Binom.-V als Variable', () => {
    const c = dist('DOWN', 'D1', 'D2', ...enter('9', '20', '0,4'));
    expect(st(c).result).toBeCloseTo(binomialCdf(9, 20, 0.4), 12);
  });

  it('Eingaben dürfen Ausdrücke sein (1÷4)', () => {
    const c = dist('DOWN', 'D1', 'D2', ...enter('9', '20'), 'D1', 'DIV', 'D4', 'EQ');
    expect(st(c).result).toBeCloseTo(binomialCdf(9, 20, 0.25), 12);
  });
});

describe('Fehler', () => {
  it('σ = 0 → Mathem. Fehler, AC kehrt zu den Variablen zurück', () => {
    const c = dist('D1', ...enter('1', '0'), 'EQ');
    expect(st(c).stage).toBe('error');
    expect(screen(c)[0]).toBe('Mathem. Fehler');
    press(c, 'AC');
    expect(st(c).stage).toBe('params');
  });

  it('Fläche außerhalb von 0…1 → Mathem. Fehler', () => {
    const c = dist('D3', ...enter('2'), 'EQ', 'EQ');
    expect(screen(c)[0]).toBe('Mathem. Fehler');
  });

  it('k ≠ ganzzahlig bei Einzelwert → Mathem. Fehler', () => {
    const c = dist('D4', 'D2', ...enter('2,5', '10', '0,5'));
    expect(screen(c)[0]).toBe('Mathem. Fehler');
  });

  it('Syntaxfehler in der Eingabe → Fehlerbildschirm', () => {
    const c = dist('D1', 'MUL', 'EQ');
    expect(st(c).stage).toBe('error');
    press(c, 'AC');
    expect(st(c).stage).toBe('params');
  });
});

describe('Listenbildschirm', () => {
  it('Kurzanleitung S. 11: k = 9…12, n = 20, p = 0,4; STO A → 0,159738478', () => {
    const c = binomialList(['9', '10', '11', '12'], '20', '0,4');
    expect(st(c).stage).toBe('list');
    const r = st(c).results!;
    [9, 10, 11, 12].forEach((k, i) => expect(r[i]).toBeCloseTo(binomialPdf(k, 20, 0.4), 12));
    expect(text(c)).toContain('Binomial|');
    // Zellen in der P-Spalte auf 6 Zeichen gekürzt: 0,1597 0,1171 0,0709 0,0354
    press(c, 'UP', 'UP', 'UP', 'UP', 'RIGHT');
    expect(text(c)).toContain('0,1597');
    expect(text(c)).toContain('0,1171');
    expect(text(c)).toContain('0,0709');
    expect(text(c)).toContain('0,0354');
    press(c, 'STO', 'NEG');
    expect(varOf(c, 'A')).toBeCloseTo(0.159738478, 9);
  });

  it('Bedienungsanleitung S. 40: {10, 11, 12, 13}, n = 15, p = 0,6', () => {
    const c = binomialList(['10', '11', '12', '13'], '15', '0,6');
    const r = st(c).results!;
    [10, 11, 12, 13].forEach((k, i) => expect(r[i]).toBeCloseTo(binomialPdf(k, 15, 0.6), 12));
    // Zellen werden abgeschnitten, nicht gerundet (0,126776 → 0,1267)
    press(c, 'UP', 'UP', 'UP', 'UP');
    for (const cell of ['0,1859', '0,1267', '0,0633', '0,0219']) expect(text(c)).toContain(cell);
  });

  it('k außerhalb des Bereichs → ERROR in der P-Spalte', () => {
    const c = binomialList(['3', '50', '4'], '10', '0,5');
    expect(st(c).stage).toBe('list');
    expect(st(c).results![0]).toBeCloseTo(binomialPdf(3, 10, 0.5), 12);
    expect(st(c).results![1]).toBe('err');
    expect(text(c)).toContain('ERROR');
    expect(st(c).results![2]).toBeCloseTo(binomialPdf(4, 10, 0.5), 12);
  });

  it('ungültiges n oder p → Mathem. Fehler, Liste bleibt', () => {
    const c = binomialList(['3'], '10', '2');
    expect(st(c).stage).toBe('error');
    press(c, 'AC');
    expect(st(c).stage).toBe('params');
    press(c, 'AC');
    expect(st(c).stage).toBe('list');
    expect(text(c)).toContain('3');
  });

  it('Poisson als Liste und Kumul. Binom.-V als Liste', () => {
    const c = dist('DOWN', 'D2', 'D1', ...enter('0', '1', '2'), 'EQ', ...enter('2'));
    [0, 1, 2].forEach((k, i) => expect(st(c).results![i]).toBeCloseTo(poissonPdf(k, 2), 12));
    const d = dist('DOWN', 'D1', 'D1', ...enter('3', '4'), 'EQ', ...enter('10', '0,5'));
    expect(st(d).results![0]).toBeCloseTo(binomialCdf(3, 10, 0.5), 12);
  });

  it('Änderung eines k-Werts löscht alle Ergebnisse', () => {
    const c = binomialList(['1', '2', '3'], '10', '0,5');
    expect(st(c).results).toBeDefined();
    press(c, 'UP', 'UP', 'UP', ...enter('5'));
    expect(st(c).results).toBeUndefined();
    // zweites = → Variablen mit erhaltenen n, p
    press(c, 'EQ');
    expect(st(c).stage).toBe('params');
    expect(screen(c)[1]).toContain('10');
    press(c, 'EQ', 'EQ');
    expect(st(c).results![0]).toBeCloseTo(binomialPdf(5, 10, 0.5), 12);
    expect(st(c).results![1]).toBeCloseTo(binomialPdf(2, 10, 0.5), 12);
  });

  it('DEL löscht eine Zeile, OPTN Editor: Zeile einfügen / Alles löschen', () => {
    const c = dist('D4', 'D1', ...enter('1', '2', '3'), 'UP', 'UP');
    press(c, 'DEL');
    const ks = () => ((c.state.modeData.dist as { list: ({ k: 'f'; x: number } | null)[] }).list.map((v) => v && toNumber(deserialize(v))));
    expect(ks()).toEqual([1, 3]);
    // Liste ist nun {1, 3}; Zeile vor „3“ einfügen und 2 eintragen
    press(c, 'OPTN', 'D2', 'D1', ...enter('2'), 'EQ', ...enter('10', '0,5'));
    expect(st(c).results!.length).toBe(3);
    expect(st(c).results![1]).toBeCloseTo(binomialPdf(2, 10, 0.5), 12);
    expect(ks()).toEqual([1, 2, 3]);
    press(c, 'OPTN', 'D2', 'D2');
    expect(ks()).toEqual([]);
    expect(st(c).results).toBeUndefined();
    press(c, 'EQ');
    expect(st(c).stage).toBe('list'); // ohne Daten keine Berechnung
  });

  it('höchstens 45 Zeilen', () => {
    const c = dist('D4', 'D1');
    for (let i = 0; i < 50; i++) press(c, 'D1', 'EQ');
    expect(st(c).row).toBe(44);
    press(c, 'EQ', ...enter('10', '0,5'));
    expect(st(c).results!.length).toBe(45);
  });

  it('STO auf einer k-Zelle', () => {
    const c = binomialList(['7', '8'], '10', '0,5');
    press(c, 'UP', 'STO', 'SIN');
    expect(toNumber(deserialize(c.state.vars.D))).toBe(8);
  });
});

describe('OPTN und Persistenz', () => {
  it('Typ auswählen wechselt den Typ, AC bricht ab', () => {
    const c = dist('D1', ...enter('1'));
    press(c, 'OPTN');
    expect(screen(c)).toEqual(['1:Typ auswählen']);
    press(c, 'D1');
    expect(screen(c)[0]).toBe('1:Normal-Dichte');
    press(c, 'AC');
    expect(st(c).stage).toBe('params');
    press(c, 'OPTN', 'D1', 'D3');
    expect(screen(c)[0]).toBe('Inv. Normal-V.');
  });

  it('Parameter bleiben nach Neustart erhalten', () => {
    const store = memStore();
    const a = press(newCalc(store), 'MENU', 'D7', 'D1', ...enter('36', '2', '35'));
    expect(st(a).stage).toBe('result');
    const b = newCalc(store);
    expect(b.mode).toBe('dist');
    expect(screen(b)[0]).toBe('1:Normal-Dichte');
    press(b, 'D1');
    expect(text(b)).toContain('36');
    expect(text(b)).toContain('35');
    press(b, 'EQ', 'EQ', 'EQ');
    expect(st(b).result).toBeCloseTo(0.1760326634, 9);
  });

  it('Liste und n, p bleiben nach Neustart erhalten', () => {
    const store = memStore();
    press(newCalc(store), 'MENU', 'D7', 'D4', 'D1', ...enter('9', '10'), 'EQ', ...enter('20', '0,4'));
    const b = press(newCalc(store), 'D4', 'D1');
    expect(st(b).stage).toBe('list');
    press(b, 'EQ', 'EQ', 'EQ');
    expect(st(b).results![0]).toBeCloseTo(binomialPdf(9, 20, 0.4), 12);
    expect(st(b).results![1]).toBeCloseTo(binomialPdf(10, 20, 0.4), 12);
  });

  it('RESET-Speicher löscht die gespeicherten Parameter', () => {
    const c = dist('D1', ...enter('36'));
    c.clearMemory();
    c.resetMode();
    press(c, 'D1');
    expect(screen(c)[1]).toContain('0');
    expect(screen(c)[1]).not.toContain('36');
  });
});
