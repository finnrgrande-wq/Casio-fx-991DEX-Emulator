// Anwendung 6 „Statistik“: Berechnungstypen, Datensatz und die statistischen Variablen.

import {
  estimateX, estimateY, normalP, normalQ, normalR, oneVar, regression, standardize, twoVar,
  type OneVar, type Regression, type RegType, type TwoVar,
} from '../../core/stats/stats';

export type StatType = 'one' | RegType;

export const TYPES: readonly { type: StatType; label: string }[] = [
  { type: 'one', label: '1 Variable' },
  { type: 'lin', label: 'y=a+bx' },
  { type: 'quad', label: 'y=a+bx+cx²' },
  { type: 'log', label: 'y=a+b·ln(x)' },
  { type: 'expE', label: 'y=a·e^(bx)' },
  { type: 'expAB', label: 'y=a·b^x' },
  { type: 'pow', label: 'y=a·x^b' },
  { type: 'inv', label: 'y=a+b/x' },
];

export const typeLabel = (t: StatType): string => TYPES.find((e) => e.type === t)!.label;
export const isPaired = (t: StatType): boolean => t !== 'one';

export interface StatSet {
  x: number[];
  y: number[];
  f: number[];
}

/** Kennwerte einer Variablen (x oder y). */
interface Part {
  n: number; mean: number; sum: number; sum2: number;
  varPop: number; sdPop: number; varS: number; sdS: number; min: number; max: number;
}

/** Berechnet Kennwerte, Regression und Schätzwerte erst bei Bedarf (und höchstens einmal). */
export class StatCalc {
  private o: OneVar | undefined;
  private t: TwoVar | undefined;
  private r: Regression | undefined;
  private s: StatSet | undefined;

  constructor(
    readonly type: StatType,
    private readonly source: () => StatSet,
  ) {}

  get paired(): boolean {
    return isPaired(this.type);
  }

  private get set(): StatSet {
    return (this.s ??= this.source());
  }

  one(): OneVar {
    return (this.o ??= oneVar(this.set.x, this.set.f));
  }

  two(): TwoVar {
    return (this.t ??= twoVar(this.set.x, this.set.y, this.set.f));
  }

  reg(): Regression {
    if (this.type === 'one') throw new RangeError('keine Regression');
    return (this.r ??= regression(this.type, this.set.x, this.set.y, this.set.f));
  }

  partX(): Part {
    if (!this.paired) {
      const o = this.one();
      return { n: o.n, mean: o.mean, sum: o.sumX, sum2: o.sumX2, varPop: o.varPop, sdPop: o.sdPop, varS: o.varSample, sdS: o.sdSample, min: o.min, max: o.max };
    }
    const t = this.two();
    return { n: t.n, mean: t.meanX, sum: t.sumX, sum2: t.sumX2, varPop: t.varPopX, sdPop: t.sdPopX, varS: t.varSampleX, sdS: t.sdSampleX, min: t.minX, max: t.maxX };
  }

  partY(): Part {
    const t = this.two();
    return { n: t.n, mean: t.meanY, sum: t.sumY, sum2: t.sumY2, varPop: t.varPopY, sdPop: t.sdPopY, varS: t.varSampleY, sdS: t.sdSampleY, min: t.minY, max: t.maxY };
  }

  estimateY(x: number): number {
    return estimateY(this.reg(), x);
  }

  estimateX(y: number, which: 0 | 1 = 0): number {
    const xs = estimateX(this.reg(), y);
    return xs[Math.min(which, xs.length - 1)];
  }

  standardize(x: number): number {
    return standardize(x, this.one());
  }
}

export interface StatVar {
  /** Token-Name ohne „stat:“. */
  id: string;
  text: string;
  /** Nur bei Variablenpaaren (bzw. nur quadratisch) vorhanden. */
  paired?: boolean;
  get(c: StatCalc): number;
}

const v = (id: string, text: string, get: StatVar['get'], paired = false): StatVar => ({ id, text, get, paired });
const X = (k: keyof Part) => (c: StatCalc) => c.partX()[k];
const Y = (k: keyof Part) => (c: StatCalc) => c.partY()[k];

export const STAT_VARS: readonly StatVar[] = [
  v('n', 'n', X('n')),
  v('meanX', 'x̄', X('mean')),
  v('meanY', 'ȳ', Y('mean'), true),
  v('sumX', 'Σx', X('sum')),
  v('sumX2', 'Σx²', X('sum2')),
  v('sumY', 'Σy', Y('sum'), true),
  v('sumY2', 'Σy²', Y('sum2'), true),
  v('sumXY', 'Σxy', (c) => c.two().sumXY, true),
  v('sumX3', 'Σx³', (c) => c.two().sumX3, true),
  v('sumX2Y', 'Σx²y', (c) => c.two().sumX2Y, true),
  v('sumX4', 'Σx⁴', (c) => c.two().sumX4, true),
  v('varPopX', 'σ²x', X('varPop')),
  v('sdPopX', 'σx', X('sdPop')),
  v('varSX', 's²x', X('varS')),
  v('sdSX', 'sx', X('sdS')),
  v('varPopY', 'σ²y', Y('varPop'), true),
  v('sdPopY', 'σy', Y('sdPop'), true),
  v('varSY', 's²y', Y('varS'), true),
  v('sdSY', 'sy', Y('sdS'), true),
  v('minX', 'min(x)', X('min')),
  v('maxX', 'max(x)', X('max')),
  v('minY', 'min(y)', Y('min'), true),
  v('maxY', 'max(y)', Y('max'), true),
  v('q1', 'Q1', (c) => c.one().q1),
  v('med', 'Med', (c) => c.one().median),
  v('q3', 'Q3', (c) => c.one().q3),
  v('a', 'a', (c) => c.reg().a, true),
  v('b', 'b', (c) => c.reg().b, true),
  v('c', 'c', (c) => c.reg().c ?? NaN, true),
  v('r', 'r', (c) => c.reg().r ?? NaN, true),
];

export const VAR_BY_ID: ReadonlyMap<string, StatVar> = new Map(STAT_VARS.map((e) => [e.id, e]));

/** Befehle mit einem Argument unmittelbar davor (Schätzwerte und standardisierte Zufallsvariable t). */
export const POSTFIX_CMDS: readonly { id: string; text: string; apply(c: StatCalc, arg: number): number }[] = [
  { id: 'yhat', text: 'ŷ', apply: (c, x) => c.estimateY(x) },
  { id: 'xhat', text: 'x̂', apply: (c, y) => c.estimateX(y) },
  { id: 'x1hat', text: 'x̂₁', apply: (c, y) => c.estimateX(y, 0) },
  { id: 'x2hat', text: 'x̂₂', apply: (c, y) => c.estimateX(y, 1) },
  { id: 't', text: 't', apply: (c, x) => c.standardize(x) },
];

/** Normalverteilung P(t), Q(t), R(t). */
export const NORMAL_FUNCS: readonly { id: string; text: string; apply(t: number): number }[] = [
  { id: 'P(', text: 'P(', apply: normalP },
  { id: 'Q(', text: 'Q(', apply: normalQ },
  { id: 'R(', text: 'R(', apply: normalR },
];

/** Reihenfolge der Werte in „1-Variab-Berech“ und „2-Variab-Berech“. */
export const LIST_ONE = ['meanX', 'sumX', 'sumX2', 'varPopX', 'sdPopX', 'varSX', 'sdSX', 'n', 'minX', 'q1', 'med', 'q3', 'maxX'];
export const LIST_TWO = [
  'meanX', 'sumX', 'sumX2', 'varPopX', 'sdPopX', 'varSX', 'sdSX', 'n',
  'meanY', 'sumY', 'sumY2', 'varPopY', 'sdPopY', 'varSY', 'sdSY', 'sumXY',
  'minX', 'maxX', 'minY', 'maxY',
];
/** Zusätzlich bei quadratischer Regression. */
export const LIST_QUAD = ['sumX3', 'sumX2Y', 'sumX4'];

/** Zeilen der Regressionsanzeige. */
export function regIds(t: StatType): string[] {
  return t === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'r'];
}

export const MAX_ROWS: Readonly<Record<number, number>> = { 1: 160, 2: 80, 3: 53 };
