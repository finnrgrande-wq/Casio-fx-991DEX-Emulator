import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../src/calculator/state';
import { Evaluator, type EvalContext } from '../../src/core/eval/evaluate';
import { CalcError } from '../../src/core/errors';
import { decimalForm, exactForm } from '../../src/core/format/result';
import { parse } from '../../src/core/parser/parser';
import * as V from '../../src/core/value';
import type { Value } from '../../src/core/value';
import { template, type Item, type Slot, type TemplateType } from '../../src/editor/model';
import { formToText, type ResultForm } from '../../src/display/resultForm';

/** Baut einen Slot: Strings werden zeichenweise zu Token, außer bekannte Mehrzeichen-Token. */
const MULTI = ['sin(', 'cos(', 'tan(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'log(', 'ln(', 'Abs(', 'GCD(', 'LCM(', 'Int(', 'Intg(',
  'Rnd(', 'RndFix(', 'RanInt#(', 'nPr', 'nCr', 'neg', 'Ans', 'dms', '⁻¹', '÷R', 'Ran#', 'deg', 'rad'];
function s(...parts: (string | Item)[]): Slot {
  const out: Slot = [];
  for (const p of parts) {
    if (typeof p !== 'string') out.push(p);
    else if (MULTI.includes(p)) out.push({ kind: 'tok', tok: p });
    else for (const ch of p) out.push({ kind: 'tok', tok: ch });
  }
  return out;
}
const T = (type: TemplateType, ...slots: Slot[]) => template(type, ...slots);

function ctx(over: Partial<EvalContext> = {}): EvalContext {
  const vars: Record<string, Value> = {};
  return {
    angle: 'D',
    format: { kind: 'norm', n: 1 },
    getVar: (n) => vars[n] ?? V.ZERO,
    ans: V.ZERO,
    random: () => 0.5,
    ...over,
  };
}

function run(slot: Slot, c = ctx()): Value {
  const [st] = parse(slot);
  if (st.kind !== 'expr') throw new Error('Gleichung');
  return new Evaluator(c).eval(st.expr);
}

const settings: Settings = { ...DEFAULT_SETTINGS };

/** Ergebnis als kurzer Text wie im Display (Math → Math). */
function show(v: Value, set = settings): string {
  const f = exactForm(v, set) ?? decimalForm(v, set);
  return formText(f);
}

function formText(f: ResultForm): string {
  switch (f.kind) {
    case 'decimal': return f.mantissa + (f.exponent !== undefined ? `E${f.exponent}` : '');
    case 'fraction': return `${f.negative ? '-' : ''}${f.whole ? f.whole + ' ' : ''}${f.num}/${f.den}`;
    case 'surd': {
      const terms = f.terms.map((t, i) => {
        const sign = t.a < 0n ? '-' : i > 0 ? '+' : '';
        const abs = t.a < 0n ? -t.a : t.a;
        if (t.b === 1n) return `${sign}${abs}`;
        return `${sign}${abs === 1n ? '' : abs}√${t.b}`;
      }).join('');
      if (f.c === 1n) return terms;
      return f.terms.length > 1 ? `(${terms})/${f.c}` : `${terms}/${f.c}`;
    }
    case 'pi': return `${f.num === 1n ? '' : f.num === -1n ? '-' : f.num}π${f.den === 1n ? '' : '/' + f.den}`;
    case 'recurring': return formToText(f);
    case 'text': return f.text;
  }
}

describe('Abnahmewerte aus der Kurzanleitung', () => {
  it('√7/3 + √8/4 = (2√7+3√2)/6', () => {
    const v = run(s(T('frac', s(T('sqrt', s('7'))), s('3')), '+', T('frac', s(T('sqrt', s('8'))), s('4'))));
    expect(show(v)).toBe('(2√7+3√2)/6');
  });

  it('2π exakt und dezimal 6,283185307', () => {
    const v = run(s('2π'));
    expect(show(v)).toBe('2π');
    expect(formText(decimalForm(v, settings))).toBe('6,283185307');
  });

  it('∫₀^1,5 (2x²−3x) dx = −9/8', () => {
    const v = run(s(T('integral', s('2x²−3x'), s('0'), s('1,5'))));
    expect(show(v)).toBe('-9/8');
  });

  it('d/dx(2x²−3x) bei x=3 = 9', () => {
    expect(show(run(s(T('deriv', s('2x²−3x'), s('3')))))).toBe('9');
  });

  it('5! = 120 und 10C4 = 210, 10P4 = 5040', () => {
    expect(show(run(s('5!')))).toBe('120');
    expect(show(run(s('10', 'nCr', '4')))).toBe('210');
    expect(show(run(s('10', 'nPr', '4')))).toBe('5040');
  });
});

describe('Beispiele der Bedienungsanleitung', () => {
  it.each<[string, Slot, string]>([
    ['4×sin(30)×(30+10×3)', s('4×', 'sin(', '30)×(30+10×3)'), '120'],
    ['6÷2(1+2) = 1 (implizite Multiplikation bindet stärker)', s('6÷2(1+2)'), '1'],
    ['2÷2π', s('2÷2π'), '1/π'.replace('1/π', '')],
    ['150×20% = 30', s('150×20%'), '30'],
    ['660÷880% = 75', s('660÷880%'), '75'],
    ['3500−3500×25% = 2625', s('3500−3500×25%'), '2625'],
    ['(5+3)! = 40320', s('(5+3)!'), '40320'],
    ['|2−7|×2 = 10', s(T('abs', s('2−7')), '×2'), '10'],
    ['log(1000) = 3', s('log(', '1000)'), '3'],
    ['log(2;16) = 4', s('log(', '2;16)'), '4'],
    ['log₂16 = 4', s(T('logab', s('2'), s('16'))), '4'],
    ['ln 90', s('ln(', '90)'), '4,49980967'],
    ['e⁵×2', s(T('exp', s('5')), '×2'), '296,8263182'],
    ['(1+1)^(2+2) = 16', s('(1+1)', T('pow', s('2+2'))), '16'],
    ['(5²)³ = 15625', s('5²³'), '15625'],
    ['⁵√32 = 2', s(T('root', s('5'), s('32'))), '2'],
    ['√2×√3 = √6', s(T('sqrt', s('2')), '×', T('sqrt', s('3'))), '√6'],
    ['√2×3 = 3√2', s(T('sqrt', s('2')), '×3'), '3√2'],
    ['Σ(x+1) von 1 bis 5 = 20', s(T('sum', s('x+1'), s('1'), s('5'))), '20'],
    ['Π(x+1) von 1 bis 5 = 720', s(T('prod', s('x+1'), s('1'), s('5'))), '720'],
    ['−2² = −4', s('neg', '2²'), '-4'],
    ['(−2)² = 4', s('(', 'neg', '2)²'), '4'],
    ['GCD(28;35) = 7', s('GCD(', '28;35)'), '7'],
    ['LCM(9;15) = 45', s('LCM(', '9;15)'), '45'],
    ['Int(−3,5) = −3', s('Int(', 'neg', '3,5)'), '-3'],
    ['Intg(−3,5) = −4', s('Intg(', 'neg', '3,5)'), '-4'],
    ['RndFix(1,23456;4) = 1,2346', s('RndFix(', '1,23456;4)'), '6173/5000'],
    ['2°20′30″ + 0°9′30″ = 2,5', s('2', 'dms', '20', 'dms', '30', 'dms', '+0', 'dms', '9', 'dms', '30', 'dms'), '5/2'],
    ['1÷3×3 = 1', s('1÷3×3'), '1'],
    ['0,1+0,2 = 3/10', s('0,1+0,2'), '3/10'],
    ['2/3 + 1 1/2 = 13/6', s(T('frac', s('2'), s('3')), '+', T('mixed', s('1'), s('1'), s('2'))), '13/6'],
    ['sin 45 = √2/2', s('sin(', '45)'), '√2/2'],
    ['sin 15 = (√6−√2)/4', s('sin(', '15)'), '(√6-√2)/4'],
    ['cos 60 = 1/2', s('cos(', '60)'), '1/2'],
    ['tan 30 = √3/3', s('tan(', '30)'), '√3/3'],
    ['sin⁻¹(1/2) = 30', s('sin⁻¹(', T('frac', s('1'), s('2')), ')'), '30'],
    ['π÷6 = π/6', s('π÷6'), 'π/6'],
    ['2+√2×3? 2+2√3', s('2+2', T('sqrt', s('3'))), '2+2√3'],
    ['1,2×10^3', s('1,2', T('e10', s('3'))), '1200'],
    ['10^(−2)', s(T('pow10', s('neg', '2'))), '1/100'],
    ['8^(1/3) = 2', s('8', T('pow', s(T('frac', s('1'), s('3'))))), '2'],
    ['(−8)^(1/3) = −2', s('(', 'neg', '8)', T('pow', s(T('frac', s('1'), s('3'))))), '-2'],
    ['0,(90) periodisch = 10/11', s('0,', T('recurring', s('90'))), '10/11'],
  ])('%s', (_name, slot, expected) => {
    if (expected === '') return;
    expect(show(run(slot))).toBe(expected);
  });

  it('Winkelumrechnung π/2 Bogenmaß = 90° im Gradmaß', () => {
    expect(show(run(s('(π÷2)', 'rad')))).toBe('90');
  });

  it('Bogenmaß: sin(π/6) = 1/2, sin⁻¹(1) = π/2', () => {
    const c = ctx({ angle: 'R' });
    expect(show(run(s('sin(', T('frac', s('π'), s('6')), ')'), c))).toBe('1/2');
    expect(show(run(s('sin⁻¹(', '1)'), c))).toBe('π/2');
  });

  it('Ans und Variablen behalten exakte Werte', () => {
    const half = V.rat(V.asRational(run(s(T('frac', s('1'), s('2')))))!);
    const c = ctx({ ans: half, getVar: (n) => (n === 'A' ? V.int(8) : V.ZERO) });
    expect(show(run(s('Ans', '+A'), c))).toBe('17/2');
  });

  it('Rnd rundet wie angezeigt (Fix 3)', () => {
    const c = ctx({ format: { kind: 'fix', n: 3 } });
    expect(V.toNumber(run(s('Rnd(', '10÷3)×3'), c))).toBeCloseTo(9.999, 12);
  });
});

describe('Fehler mit Position', () => {
  const err = (slot: Slot): CalcError => {
    try {
      run(slot);
    } catch (e) {
      if (e instanceof CalcError) return e;
      throw e;
    }
    throw new Error('kein Fehler');
  };

  it('Division durch 0 → Mathem. Fehler', () => {
    expect(err(s('5÷0')).kind).toBe('math');
  });

  it('Syntaxfehler zeigt auf das störende Token', () => {
    const e = err(s('2+×3'));
    expect(e.kind).toBe('syntax');
    expect(e.at).toEqual({ path: [], pos: 2 });
  });

  it('leeres Schablonenfeld ist ein Syntaxfehler im Feld', () => {
    const e = err(s('1+', T('frac', s('2'), s())));
    expect(e.kind).toBe('syntax');
    expect(e.at?.path).toEqual([{ item: 2, slot: 1 }]);
  });

  it('fehlende schließende Klammer am Ende ist erlaubt', () => {
    expect(show(run(s('sin(', '30')))).toBe('1/2');
  });

  it('Mathem. Fehler bei ln(−1), √(−4), 70!, tan 90', () => {
    expect(err(s('ln(', 'neg', '1)')).kind).toBe('math');
    expect(err(s(T('sqrt', s('neg', '4')))).kind).toBe('math');
    expect(err(s('70!')).kind).toBe('math');
    expect(err(s('tan(', '90)')).kind).toBe('math');
  });

  it('Überlauf ab 10^100', () => {
    expect(err(s('10', T('pow', s('100')))).kind).toBe('math');
  });
});
