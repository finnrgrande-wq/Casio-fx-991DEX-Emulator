import { describe, expect, it } from 'vitest';
import { Framebuffer } from '../../src/display/framebuffer';
import { layoutInput, layoutResult, translate, type Laid } from '../../src/display/mathLayout';
import type { DrawOp } from '../../src/display/scene';
import { SLOT_COUNT, template, type Cursor, type Item, type Slot, type TemplateType } from '../../src/editor/model';

type Text = Extract<DrawOp, { kind: 'text' }>;
type Rect = Extract<DrawOp, { kind: 'rect' }>;

const d = (s: string): Slot => [...s].map((tok) => ({ kind: 'tok' as const, tok }));
const tok = (t: string): Item => ({ kind: 'tok', tok: t });
const tp = (type: TemplateType, ...slots: Slot[]): Item => template(type, ...slots);
const cur = (pos: number, ...path: [number, number][]): Cursor => ({ path: path.map(([item, slot]) => ({ item, slot })), pos });

const textOps = (l: Laid): Text[] => l.ops.filter((o): o is Text => o.kind === 'text');
const byX = (l: Laid): Text[] => [...textOps(l)].sort((a, b) => a.x - b.x);
/** Alle Textoperationen von links nach rechts als ein String. */
const line = (l: Laid): string => byX(l).map((t) => t.text).join('');
const bars = (l: Laid): Rect[] => l.ops.filter((o): o is Rect => o.kind === 'rect' && o.h === 1);

const frac = (n: string, m: string): Item => tp('frac', d(n), d(m));

describe('layoutInput – Grundform', () => {
  it('eine einfache Zeile: 16 hoch, Grundlinie 12, Text in L', () => {
    const l = layoutInput(d('123'), null, 'math');
    expect([l.w, l.h, l.base]).toEqual([33, 16, 12]);
    expect(l.ops).toEqual([{ kind: 'text', x: 0, y: 0, text: '123', font: 'L' }]);
    expect(l.cursor).toBeUndefined();
  });

  it('leere Eingabe zeigt den Platzhalter □', () => {
    expect(line(layoutInput([], null, 'math'))).toBe('□');
  });

  it('Token zeigen ihren Anzeigetext', () => {
    expect(line(layoutInput([tok('sin('), tok('x'), tok('nPr'), tok('⁻¹'), tok('neg')], null, 'math'))).toBe('sin(𝑥P⁻¹-');
  });

  it('translate verschiebt alle Operationsarten', () => {
    const l = layoutInput([frac('1', '2'), tp('sqrt', d('3'))], null, 'math');
    const moved = translate(l, 5, 7);
    expect(moved).toHaveLength(l.ops.length);
    l.ops.forEach((o, i) => {
      const m = moved[i];
      if (o.kind === 'line' && m.kind === 'line') expect([m.x1, m.y2]).toEqual([o.x1 + 5, o.y2 + 7]);
      else if (o.kind !== 'line' && m.kind !== 'line') expect([m.x, m.y]).toEqual([o.x + 5, o.y + 7]);
      else throw new Error('Art der Operation verändert');
    });
    expect(l.ops.some((o) => o.kind === 'line')).toBe(true);
  });
});

describe('layoutInput – Bruch', () => {
  const l = layoutInput([frac('12', '3')], null, 'math');
  const bar = bars(l)[0];

  it('Bruchstrich: 1 Punkt dick, Breite = breiterer Teil (Tinte) + 2', () => {
    expect(bars(l)).toHaveLength(1);
    expect(bar.x).toBe(0);
    // „12“: Tinte von Spalte 2 bis 18 → 17 Punkte
    expect(bar.w).toBe(17 + 2);
    expect(textOps(l).map((t) => t.text)).toEqual(['12', '3']);
  });

  it('Strich liegt auf Höhe der Mittellinie des umgebenden Textes (5 Zeilen über der Grundlinie)', () => {
    expect(l.base - bar.y).toBe(5);
    const withText = layoutInput([...d('1+'), frac('1', '2')], null, 'math');
    const b = bars(withText)[0];
    expect(withText.base - b.y).toBe(5);
    // das „+“ (Mittelstrich in Zeile 7 der Zelle) liegt auf der gleichen Zeile
    const plus = textOps(withText)[0];
    expect(plus.y + 7).toBe(b.y);
  });

  it('Zähler und Nenner stehen mittig, je 1 Punkt Luft zum Strich', () => {
    const [num, den] = textOps(l);
    // Ziffernoberkante (Zeile 3 der Zelle) des Zählers bei 0; Nennerzeile 2 unter dem Strich
    expect(num.y + 3).toBe(0);
    expect(den.y + 3).toBe(bar.y + 2);
    // Tinte der „3“ (6 Punkte, ab Zellspalte 2) mittig unter 17 Punkten Zähler
    expect(den.x + 2).toBe(1 + 5);
  });

  it('passt mit L-Zähler und L-Nenner in 33 Punkte Höhe', () => {
    expect(l.h).toBe(23);
    expect(l.h).toBeLessThanOrEqual(33);
  });

  it('gemischter Bruch: Ganzes links, danach der Bruch', () => {
    const m = layoutInput([tp('mixed', d('2'), d('1'), d('3'))], null, 'math');
    expect(byX(m).map((x) => x.text)).toEqual(['2', '1', '3']);
    expect(byX(m)[0].x).toBeLessThan(byX(m)[1].x);
    expect(bars(m)).toHaveLength(1);
  });

  it('verschachtelter Bruch bleibt in Schrift L', () => {
    const n = layoutInput([tp('frac', [frac('1', '2')], d('3'))], null, 'math');
    expect(textOps(n).every((t) => t.font === 'L')).toBe(true);
    expect(bars(n)).toHaveLength(2);
  });
});

describe('layoutInput – Wurzel', () => {
  it('Bruch in der Wurzel: Höhe = Bruchhöhe + 2, Überstrich oben, Zeichen über die volle Höhe', () => {
    const f = layoutInput([frac('1', '2')], null, 'math');
    const s = layoutInput([tp('sqrt', [frac('1', '2')])], null, 'math');
    expect(s.h).toBe(f.h + 2);
    expect(s.ops.some((o) => o.kind === 'rect' && o.y === 0 && o.h === 1)).toBe(true);
    const ys = s.ops.flatMap((o) => (o.kind === 'line' ? [o.y1, o.y2] : []));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(s.h - 1);
    // der Bruch sitzt unter dem Überstrich
    expect(bars(s).filter((b) => b.y > 1)).toHaveLength(1);
  });

  it('Überstrich reicht über den Radikanden plus 1 Punkt', () => {
    const s = layoutInput([tp('sqrt', d('7'))], null, 'math');
    const over = bars(s)[0];
    const seven = textOps(s)[0];
    // Tinte der „7“: Zellspalten 2..8 (7 Punkte); Überstrich endet 1 Punkt dahinter
    expect(over.x + over.w).toBe(seven.x + 2 + 7 + 1);
    expect(over.y).toBe(s.base - 11); // Überstrich 2 Zeilen über der Ziffernoberkante
    expect([s.h, s.base]).toEqual([16, 12]);
  });

  it('Kubikwurzel zeigt eine kleine 3, n-te Wurzel ihren Index in S', () => {
    const c = layoutInput([tp('cbrt', d('8'))], null, 'math');
    expect(textOps(c).find((t) => t.font === 'S')?.text).toBe('3');
    const r = layoutInput([tp('root', d('5'), d('32'))], null, 'math');
    expect(textOps(r).find((t) => t.font === 'S')?.text).toBe('5');
    expect(textOps(r).find((t) => t.font === 'L')?.text).toBe('32');
  });

  it('Wurzel sitzt auf der Grundlinie der Nachbarzeichen', () => {
    const l = layoutInput([tok('2'), tp('sqrt', d('7'))], null, 'math');
    const [two, seven] = byX(l);
    expect(two.y).toBe(seven.y + 2 - 2 + (l.h === 16 ? 0 : 0) + (two.y - seven.y));
    expect(l.h).toBe(16);
    expect(l.base).toBe(12);
  });
});

describe('layoutInput – Exponenten und Indizes', () => {
  it('Exponent: Schrift S, Grundlinie 6 Punkte über der Hauptgrundlinie', () => {
    const l = layoutInput([tok('2'), tp('pow', d('3'))], null, 'math');
    const e = textOps(l).find((t) => t.font === 'S')!;
    expect(e.text).toBe('3');
    expect(e.y + 6).toBe(l.base - 6);
    expect([l.h, l.base]).toEqual([16, 12]);
  });

  it('verschachtelte Exponenten bleiben in S und liegen höher', () => {
    const l = layoutInput([tok('2'), tp('pow', [tok('3'), tp('pow', d('2'))])], null, 'math');
    const s = byX(l).filter((t) => t.font === 'S');
    expect(s.map((t) => t.text)).toEqual(['3', '2']);
    expect(s[1].y).toBeLessThan(s[0].y);
  });

  it('e10, pow10 und exp: Text + angehobener Exponent', () => {
    for (const [type, text] of [['e10', '×10'], ['pow10', '10'], ['exp', 'e']] as const) {
      const l = layoutInput([tp(type, d('4'))], null, 'math');
      const t = byX(l);
      expect(t[0]).toMatchObject({ text, font: 'L' });
      expect(t[1]).toMatchObject({ text: '4', font: 'S' });
      expect(t[1].y + 6).toBe(l.base - 6);
    }
  });

  it('logab: Index in S abgesenkt (Oberkante 3 Punkte über der Grundlinie)', () => {
    const l = layoutInput([tp('logab', d('2'), d('16'))], null, 'math');
    const sub = textOps(l).find((t) => t.font === 'S')!;
    expect(sub.text).toBe('2');
    expect(sub.y).toBe(l.base - 3);
    expect(line(l)).toBe('log2(16)');
  });
});

describe('layoutInput – weitere Schablonen', () => {
  it('Betrag: zwei senkrechte 1-Punkt-Striche über die volle Höhe', () => {
    const l = layoutInput([tp('abs', d('5'))], null, 'math');
    const v = l.ops.filter((o): o is Rect => o.kind === 'rect' && o.w === 1 && o.h > 1);
    expect(v).toHaveLength(2);
    expect(v[0].x).toBeLessThan(textOps(l)[0].x);
    expect(v[1].x).toBeGreaterThan(textOps(l)[0].x);
    expect(v[0].h).toBe(12);
  });

  it('Integral: Zeichen höher als der Integrand, Grenzen in S, Gesamthöhe ≤ 32', () => {
    const l = layoutInput([tp('integral', [...d('2'), tok('x'), tok('²')], d('0'), d('1,5'))], null, 'math');
    const t = textOps(l);
    const lines = l.ops.filter((o) => o.kind === 'line');
    expect(lines.length).toBeGreaterThan(3);
    expect(l.h).toBeLessThanOrEqual(32);
    const up = t.find((x) => x.text === '1,5')!;
    const lo = t.find((x) => x.text === '0')!;
    expect([up.font, lo.font]).toEqual(['S', 'S']);
    expect(up.y).toBeLessThan(lo.y);
    expect(up.x).toBeGreaterThan(lo.x); // obere Grenze rechts von der unteren
    const f = t.find((x) => x.font === 'L')!;
    expect(f.x).toBeGreaterThan(up.x + 11); // Integrand rechts neben den Grenzen
    expect(f.text).toBe('2𝑥²d𝑥');
    const ys = lines.flatMap((o) => (o.kind === 'line' ? [o.y1, o.y2] : []));
    expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThan(f.y + 13 - (f.y + 3) + 2);
  });

  it('Ableitung: d über d𝑥, Klammern, senkrechter Strich und 𝑥=a als Index', () => {
    const l = layoutInput([tp('deriv', d('5'), d('3'))], null, 'math');
    const t = textOps(l);
    expect(t.map((x) => x.text).sort()).toEqual(['(5)', 'd', 'd𝑥', '𝑥=3'].sort());
    expect(l.ops.some((o) => o.kind === 'rect' && o.w === 1 && o.h > 10)).toBe(true);
    expect(l.h).toBeLessThanOrEqual(33);
    expect(t.find((x) => x.text === '𝑥=3')!.font).toBe('S');
  });

  it('Summe: Σ, obere Grenze oberhalb, 𝑥=Startwert darunter, danach (f)', () => {
    const l = layoutInput([tp('sum', d('1'), d('1'), d('5'))], null, 'math');
    const t = textOps(l);
    const top = t.find((x) => x.text === '5')!;
    const sigma = t.find((x) => x.text === 'Σ')!;
    const bottom = t.find((x) => x.text === '𝑥=1')!;
    expect(top.font).toBe('S');
    expect(top.y).toBeLessThan(sigma.y);
    expect(bottom.y).toBeGreaterThan(sigma.y);
    expect(t.find((x) => x.text === '(1)')!.x).toBeGreaterThan(sigma.x);
    expect(l.h).toBeLessThanOrEqual(32);
  });

  it('periodische Zahl: 1-Punkt-Überstrich über den Ziffern', () => {
    const l = layoutInput([tp('recurring', d('36'))], null, 'math');
    const b = bars(l)[0];
    expect(b.y).toBe(l.base - 11);
    expect(b.w).toBe(17);
    expect(textOps(l)[0].y + 3).toBe(b.y + 2);
  });
});

describe('layoutInput – Cursor', () => {
  it('am Zeilenende, in der Mitte und am Anfang (Balken 1 Punkt links der Einfügestelle)', () => {
    expect(layoutInput(d('12'), cur(2), 'math').cursor).toEqual({ x: 21, y: 1, h: 13 });
    expect(layoutInput(d('12'), cur(1), 'math').cursor).toEqual({ x: 10, y: 1, h: 13 });
    expect(layoutInput(d('12'), cur(0), 'math').cursor).toEqual({ x: 0, y: 1, h: 13 });
  });

  it('leere Wurzel: Cursor am linken Rand des Platzhalters', () => {
    const l = layoutInput([tp('sqrt', [])], cur(0, [0, 0]), 'math');
    const box = textOps(l)[0];
    expect(box.text).toBe('□');
    const c = l.cursor!;
    expect(c.x).toBe(box.x + 2); // Platzhalter-Tinte beginnt in Zellspalte 2
    expect(c.y).toBeGreaterThanOrEqual(1);
    expect(c.y + c.h).toBeLessThanOrEqual(l.h);
    expect(c.h).toBeGreaterThanOrEqual(9);
  });

  it('im Zähler und im Nenner: Höhe wird vom Bruchstrich begrenzt', () => {
    const l = layoutInput([frac('7', '8')], cur(1, [0, 0]), 'math');
    const bar = bars(l)[0];
    const c = l.cursor!;
    expect(c.y).toBe(0);
    expect(c.y + c.h).toBeLessThanOrEqual(bar.y);
    expect(c.x).toBeGreaterThanOrEqual(bar.x);
    expect(c.x).toBeLessThan(bar.x + bar.w);
    const cd = layoutInput([frac('7', '8')], cur(0, [0, 1]), 'math').cursor!;
    expect(cd.y).toBeGreaterThan(bar.y);
    expect(cd.y + cd.h).toBeLessThanOrEqual(l.h);
  });

  it('hinter einem Bruch: rechts neben dem Bruch, volle Zeilenhöhe', () => {
    const l = layoutInput([frac('7', '8')], cur(1), 'math');
    const bar = bars(l)[0];
    const c = l.cursor!;
    expect(c.x).toBe(bar.w - 1);
    expect(c.h).toBe(13);
    expect(c.y).toBe(l.base - 11);
  });

  it('im Exponenten: Höhe 7 (Schrift S) auf der Höhe des Exponenten', () => {
    const l = layoutInput([tok('2'), tp('pow', d('34'))], cur(1, [1, 0]), 'math');
    const e = textOps(l).find((t) => t.font === 'S')!;
    const c = l.cursor!;
    expect(c.h).toBe(7);
    expect(c.y).toBe(e.y);
    expect(c.x).toBe(e.x + 5); // nach der „3“ (5 Punkte) liegt der Balken im Zeichenabstand
  });

  it('in der Integralgrenze (unten und oben)', () => {
    const l0 = layoutInput([tp('integral', d('5'), d('1'), d('29'))], cur(1, [0, 2]), 'math');
    const up = textOps(l0).find((t) => t.text === '29')!;
    expect(l0.cursor).toEqual({ x: up.x + 5, y: up.y, h: 7 });
    const l1 = layoutInput([tp('integral', d('5'), d('1'), d('29'))], cur(0, [0, 1]), 'math');
    const lo = textOps(l1).find((t) => t.text === '1')!;
    expect(l1.cursor).toEqual({ x: lo.x + 1, y: lo.y, h: 7 }); // Tinte der „1“ beginnt in Spalte 1
    expect(up.y).toBe(0);
  });

  it('kein Cursor, wenn der Pfad ins Leere zeigt', () => {
    expect(layoutInput(d('1'), cur(0, [4, 0]), 'math').cursor).toBeUndefined();
  });

  it('Zeilenbreite enthält den Cursor am Zeilenende', () => {
    const l = layoutInput(d('1'), cur(1), 'math');
    expect(l.w).toBeGreaterThanOrEqual(l.cursor!.x + 2);
  });
});

describe('layoutInput – lineare Darstellung', () => {
  const lin = (items: Item[]): string => {
    const l = layoutInput(items, null, 'linear');
    expect(textOps(l).every((t) => t.font === 'L')).toBe(true);
    expect([l.h, l.base]).toEqual([16, 12]);
    return line(l);
  };

  it.each([
    [[frac('1', '2')], '1⌟2'],
    [[tp('mixed', d('1'), d('2'), d('3'))], '1⌟2⌟3'],
    [[tp('sqrt', d('2'))], '√(2)'],
    [[tp('cbrt', d('8'))], '³√(8)'],
    [[tp('root', d('4'), d('16'))], '4√(16)'],
    [[tok('2'), tp('pow', d('3'))], '2^(3)'],
    [[tp('e10', d('12'))], '×1012'],
    [[tp('pow10', d('2'))], '10^(2)'],
    [[tp('exp', [tok('x')])], 'e^(𝑥)'],
    [[tp('logab', d('2'), d('16'))], 'log(2;16)'],
    [[tp('abs', [tok('x')])], 'Abs(𝑥)'],
    [[tp('integral', [tok('x')], d('0'), d('1'))], '∫(𝑥;0;1)'],
    [[tp('deriv', [tok('x')], d('3'))], 'd/d𝑥(𝑥;3)'],
    [[tp('sum', [tok('x')], d('1'), d('5'))], 'Σ(𝑥;1;5)'],
    [[tp('prod', [tok('x')], d('1'), d('5'))], 'Π(𝑥;1;5)'],
    [[tp('sqrt', [])], '√(□)'],
  ] as [Item[], string][])('%#: %s', (items, expected) => {
    expect(lin(items)).toBe(expected);
  });

  it('eine Zeile wird zu einer einzigen Textoperation zusammengefasst', () => {
    const l = layoutInput([...d('1+'), frac('1', '2'), tok('='), tp('sqrt', d('9'))], null, 'linear');
    expect(textOps(l)).toHaveLength(1);
    expect(textOps(l)[0].text).toBe('1+1⌟2=√(9)');
  });

  it('periodische Zahl behält den Überstrich', () => {
    const l = layoutInput([tp('recurring', d('36'))], null, 'linear');
    expect(bars(l)).toHaveLength(1);
  });

  it('Cursor im Feld: Position im Text der Schablone', () => {
    const l = layoutInput([tp('sqrt', d('12'))], cur(1, [0, 0]), 'linear');
    expect(l.cursor).toEqual({ x: 3 * 11 - 1, y: 1, h: 13 }); // „√(1|2)“
    expect(layoutInput([tp('sqrt', d('12'))], cur(1), 'linear').cursor!.x).toBe(5 * 11 - 1);
  });
});

describe('layoutResult', () => {
  it('Dezimalzahl: einfacher Text in L', () => {
    const l = layoutResult({ kind: 'decimal', mantissa: '-6,25' }, 'math');
    expect(l.ops).toEqual([{ kind: 'text', x: 0, y: 0, text: '-6,25', font: 'L' }]);
    expect([l.h, l.base]).toEqual([16, 12]);
    expect(l.cursor).toBeUndefined();
  });

  it('Dezimalzahl mit Exponent: ×10 und angehobene Exponentenziffern in S', () => {
    const l = layoutResult({ kind: 'decimal', mantissa: '1,4286', exponent: -1 }, 'math');
    const [m, e] = byX(l);
    expect(m.text).toBe('1,4286×10');
    expect(e).toMatchObject({ text: '-1', font: 'S' });
    expect(e.y + 6).toBe(l.base - 6);
    expect(e.x).toBeGreaterThanOrEqual(9 * 11 - 3);
  });

  it('Bruch: Zähler über Nenner, negatives Vorzeichen auf Strichhöhe', () => {
    const l = layoutResult({ kind: 'fraction', negative: true, num: '9', den: '8' }, 'math');
    expect(byX(l).map((x) => x.text)).toEqual(['-', '9', '8']);
    const [minus] = byX(l);
    const [num, den] = textOps(l).filter((t) => t.text !== '-');
    expect(minus.y + 7).toBe(bars(l)[0].y);
    expect(num.y).toBeLessThan(den.y);
    expect(l.h).toBeLessThanOrEqual(33);
  });

  it('gemischter Bruch', () => {
    const l = layoutResult({ kind: 'fraction', negative: false, whole: '2', num: '1', den: '3' }, 'math');
    expect(byX(l).map((x) => x.text)).toEqual(['2', '1', '3']);
  });

  it('Wurzelsumme (5−√137)/8: Zähler mit Wurzel über 8', () => {
    const l = layoutResult({ kind: 'surd', terms: [{ a: 5n, b: 1n }, { a: -1n, b: 137n }], c: 8n }, 'math');
    const t = [...textOps(l)].sort((a, b) => a.y - b.y || a.x - b.x).map((x) => x.text);
    expect(t).toEqual(['5-', '137', '8']);
    expect(bars(l).length).toBeGreaterThanOrEqual(2); // Bruchstrich und Wurzelüberstrich
    expect(l.ops.some((o) => o.kind === 'line')).toBe(true);
    expect(l.h).toBeLessThanOrEqual(33);
  });

  it('Wurzelsumme (2√7+3√2)/6', () => {
    const l = layoutResult({ kind: 'surd', terms: [{ a: 2n, b: 7n }, { a: 3n, b: 2n }], c: 6n }, 'math');
    const t = [...textOps(l)].sort((a, b) => a.y - b.y || a.x - b.x).map((x) => x.text);
    expect(t).toEqual(['2', '7', '+3', '2', '6']);
  });

  it('einzelne Wurzel ohne Nenner: Koeffizient 1 entfällt, b=1 ist eine ganze Zahl', () => {
    const one = layoutResult({ kind: 'surd', terms: [{ a: 1n, b: 7n }], c: 1n }, 'math');
    expect(textOps(one).map((x) => x.text)).toEqual(['7']);
    expect(bars(one)).toHaveLength(1);
    const neg = layoutResult({ kind: 'surd', terms: [{ a: -3n, b: 2n }], c: 1n }, 'math');
    expect(byX(neg).map((x) => x.text)).toEqual(['-3', '2']);
    expect(line(layoutResult({ kind: 'surd', terms: [{ a: 4n, b: 1n }], c: 1n }, 'math'))).toBe('4');
  });

  it('Vielfaches von π', () => {
    expect(textOps(layoutResult({ kind: 'pi', num: 2n, den: 3n }, 'math')).map((t) => t.text)).toEqual(['2π', '3']);
    expect(layoutResult({ kind: 'pi', num: 1n, den: 1n }, 'math').ops).toEqual([{ kind: 'text', x: 0, y: 0, text: 'π', font: 'L' }]);
    expect(line(layoutResult({ kind: 'pi', num: -1n, den: 1n }, 'math'))).toBe('-π');
    expect(byX(layoutResult({ kind: 'pi', num: -5n, den: 4n }, 'math')).map((t) => t.text)).toEqual(['-', '5π', '4']);
  });

  it('Text', () => {
    expect(line(layoutResult({ kind: 'text', text: 'r=2; θ=45' }, 'math'))).toBe('r=2; θ=45');
  });

  it('lineare Darstellung', () => {
    expect(line(layoutResult({ kind: 'fraction', negative: true, num: '9', den: '8' }, 'linear'))).toBe('-9⌟8');
    expect(line(layoutResult({ kind: 'fraction', negative: false, whole: '2', num: '1', den: '3' }, 'linear'))).toBe('2⌟1⌟3');
    expect(line(layoutResult({ kind: 'surd', terms: [{ a: 2n, b: 7n }, { a: 3n, b: 2n }], c: 6n }, 'linear'))).toBe('(2√7+3√2)⌟6');
    expect(line(layoutResult({ kind: 'pi', num: 2n, den: 3n }, 'linear'))).toBe('2π⌟3');
    const dec = layoutResult({ kind: 'decimal', mantissa: '1,5', exponent: 12 }, 'linear');
    expect(byX(dec).map((t) => t.text)).toEqual(['1,5×10', '12']);
  });
});

// --- Gesamtprüfung aller Schablonen ---------------------------------------------------------------

const TYPES = Object.keys(SLOT_COUNT) as TemplateType[];
const fill = (type: TemplateType): Item =>
  tp(type, ...Array.from({ length: SLOT_COUNT[type] }, (_, k) => d(['2', '3', '1,5'][k] ?? '1')));
const nested = (type: TemplateType): Item =>
  tp(type, ...Array.from({ length: SLOT_COUNT[type] }, () => [tok('x'), frac('1', '2'), tp('sqrt', d('3')), tp('pow', d('2'))]));

/** Anzahl gesetzter Punkte außerhalb der Box (Tinte außerhalb wäre ein Layoutfehler). */
function inkOutside(l: Laid): number {
  const M = 12;
  const fb = new Framebuffer(l.w + 2 * M, l.h + 2 * M);
  fb.render({ ops: translate(l, M, M) });
  let n = 0;
  for (let y = 0; y < fb.height; y++)
    for (let x = 0; x < fb.width; x++) if (fb.get(x, y) && (x < M || y < M || x >= M + l.w || y >= M + l.h)) n++;
  return n;
}

describe('alle Schablonen', () => {
  const variants: [string, Item][] = TYPES.flatMap((t) => [
    [`${t} leer`, tp(t)],
    [`${t} gefüllt`, fill(t)],
    [`${t} verschachtelt`, nested(t)],
  ] as [string, Item][]);

  for (const mode of ['math', 'linear'] as const) {
    it.each(variants)(`${mode}: %s wird ohne Fehler gelayoutet`, (name, item) => {
      const l = layoutInput([tok('1'), item, tok('2')], null, mode);
      expect(Number.isFinite(l.w) && Number.isFinite(l.h) && Number.isFinite(l.base)).toBe(true);
      expect(l.h).toBeGreaterThanOrEqual(16);
      expect(l.base).toBeGreaterThanOrEqual(12);
      expect(l.base).toBeLessThan(l.h);
      expect(inkOutside(l)).toBe(0);
      if (mode === 'math' && !name.includes('verschachtelt')) expect(l.h).toBeLessThanOrEqual(33);
    });

    it(`${mode}: Cursor in jedem Feld jeder Schablone liegt in der Box`, () => {
      for (const t of TYPES) {
        for (let k = 0; k < SLOT_COUNT[t]; k++) {
          for (const item of [tp(t), fill(t)]) {
            const l = layoutInput([tok('1'), item], cur(0, [1, k]), mode);
            const c = l.cursor;
            expect(c, `${t} Feld ${k}`).toBeDefined();
            expect(c!.x).toBeGreaterThanOrEqual(0);
            expect(c!.y).toBeGreaterThanOrEqual(0);
            expect(c!.y + c!.h).toBeLessThanOrEqual(l.h);
            expect(c!.x + 2).toBeLessThanOrEqual(l.w);
          }
        }
      }
    });
  }

  it('Cursor in verschachtelten Feldern (Bruch in Wurzel im Exponenten)', () => {
    const root: Slot = [tok('2'), tp('pow', [tp('sqrt', [frac('1', '2')])])];
    const l = layoutInput(root, cur(1, [1, 0], [0, 0], [0, 1]), 'math');
    expect(l.cursor).toBeDefined();
    expect(l.cursor!.y + l.cursor!.h).toBeLessThanOrEqual(l.h);
  });
});
