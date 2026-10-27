// Auswertung des AST mit exakter Arithmetik und Gleitkomma-Rückfall.

import type { AngleUnit } from '../../display/scene';
import type { NumberFormat } from '../../calculator/state';
import { Rational } from '../exact/rational';
import { CalcError } from '../errors';
import { formatNumber, round15 } from '../format/number';
import { derivative } from '../numeric/derive';
import { NumericError } from '../numeric/errors';
import { integrate } from '../numeric/integrate';
import type { Node } from '../parser/parser';
import { PREFIXES } from '../../editor/tokens';
import { CONST_CATEGORIES } from '../../data/constants';
import { CONV_CATEGORIES } from '../../data/conversions';
import * as V from '../value';
import type { Value } from '../value';
import * as T from './trig';

export interface EvalContext {
  angle: AngleUnit;
  format: NumberFormat;
  getVar(name: string): Value;
  ans: Value;
  /** Zufallszahl in [0, 1). */
  random(): number;
}

/** Schlüssel der Variablen in der Laufvariablen-Bindung von ∫, d/dx, Σ, Π. */
type Bindings = ReadonlyMap<string, Value>;

const MAX_SUM_TERMS = 100000;

const CONSTANTS = new Map(CONST_CATEGORIES.flatMap((c) => c.items).map((k) => [`const:${k.symbol}`, k]));
const CONVERSIONS = new Map(CONV_CATEGORIES.flatMap((c) => c.items).map((k) => [k.label, k]));

export class Evaluator {
  constructor(private readonly ctx: EvalContext) {}

  eval(node: Node, bind: Bindings = new Map()): Value {
    try {
      return this.node(node, bind);
    } catch (e) {
      if (e instanceof CalcError && !e.at) e.at = node.at;
      throw e;
    }
  }

  /** Auswertung als Gleitkomma-Funktion von x (für Numerik). */
  asFunction(node: Node, bind: Bindings, variable = 'x'): (x: number) => number {
    return (x: number) => {
      const b = new Map(bind);
      b.set(variable, V.fl(x));
      return V.toNumber(this.eval(node, b));
    };
  }

  private node(n: Node, bind: Bindings): Value {
    switch (n.t) {
      case 'num':
        return this.number(n, bind);
      case 'var':
        return bind.get(n.name) ?? this.ctx.getVar(n.name);
      case 'const':
        return this.constant(n.name);
      case 'neg':
        return V.neg(this.eval(n.arg, bind));
      case 'bin':
        return this.binary(n.op, this.eval(n.l, bind), this.eval(n.r, bind));
      case 'post':
        return this.postfix(n.op, this.eval(n.arg, bind));
      case 'dms': {
        const [d, m = V.ZERO, s = V.ZERO] = n.parts.map((p) => this.eval(p, bind));
        const sixty = V.int(60);
        return V.add(d, V.add(V.div(m, sixty), V.div(s, V.int(3600))));
      }
      case 'pow':
        return V.pow(this.eval(n.base, bind), this.eval(n.exp, bind));
      case 'conv': {
        const conv = CONVERSIONS.get(n.label);
        if (!conv) throw new CalcError('syntax');
        return V.fl(conv.convert(V.toNumber(this.eval(n.arg, bind))));
      }
      case 'call':
        return this.call(n.fn, n.args, bind);
      case 'tpl':
        return this.template(n, bind);
    }
  }

  private number(n: Extract<Node, { t: 'num' }>, bind: Bindings): Value {
    let q = Rational.fromDecimalString(`${n.digits}.${n.frac}`, 1000)!;
    if (n.recurring) {
      // 0,1(23) = 0,1 + 23 / (10¹ · 99)
      const rep = Rational.of(BigInt(n.recurring), (10n ** BigInt(n.recurring.length) - 1n) * 10n ** BigInt(n.frac.length));
      q = q.add(rep);
    }
    let v = V.rat(q);
    if (n.exp) {
      const e = V.asInteger(this.eval(n.exp, bind));
      if (e === undefined || e > 99n || e < -99n) throw new CalcError('math', n.exp.at);
      v = V.mul(v, V.rat(Rational.of(10n).pow(e)));
    }
    if (Math.abs(V.toNumber(v)) >= 1e100) throw new CalcError('math', n.at);
    return v;
  }

  private constant(name: string): Value {
    switch (name) {
      case 'π': return V.piTimes(Rational.ONE);
      case 'e': return V.fl(2.71828182845904);
      case 'Ans': return this.ctx.ans;
      case 'Ran#': return V.rat(Rational.of(BigInt(Math.floor(this.ctx.random() * 1000)), 1000n));
    }
    const physical = CONSTANTS.get(name);
    if (physical) return V.fl(physical.value);
    // i und weitere Konstanten sind nur in anderen Modi zulässig
    throw new CalcError('syntax');
  }

  private binary(op: string, a: Value, b: Value): Value {
    switch (op) {
      case '+': return V.add(a, b);
      case '−': return V.sub(a, b);
      case '×':
      case 'imul': return V.mul(a, b);
      case '÷':
      case '÷R': return V.div(a, b);
      case 'nPr': return permutation(a, b, false);
      case 'nCr': return permutation(a, b, true);
    }
    throw new CalcError('syntax');
  }

  private postfix(op: string, a: Value): Value {
    switch (op) {
      case '²': return V.pow(a, V.int(2));
      case '³': return V.pow(a, V.int(3));
      case '⁻¹': return V.div(V.ONE, a);
      case '!': return factorial(a);
      case '%': return V.div(a, V.int(100));
      case 'deg': return T.convertAngle(a, 'D', this.ctx.angle);
      case 'rad': return T.convertAngle(a, 'R', this.ctx.angle);
      case 'gra': return T.convertAngle(a, 'G', this.ctx.angle);
    }
    const prefix = PREFIXES.find(([sym]) => op === `pfx:${sym}`);
    if (prefix) return V.mul(a, V.rat(Rational.of(10n).pow(BigInt(prefix[1]))));
    throw new CalcError('syntax');
  }

  private call(fn: string, args: Node[], bind: Bindings): Value {
    const vals = args.map((a) => this.eval(a, bind));
    const [a, b] = vals;
    const unit = this.ctx.angle;
    switch (fn) {
      case 'sin(': return T.sin(a, unit);
      case 'cos(': return T.cos(a, unit);
      case 'tan(': return T.tan(a, unit);
      case 'sin⁻¹(': return T.asin(a, unit);
      case 'cos⁻¹(': return T.acos(a, unit);
      case 'tan⁻¹(': return T.atan(a, unit);
      case 'sinh(': return float(Math.sinh, a);
      case 'cosh(': return float(Math.cosh, a);
      case 'tanh(': return float(Math.tanh, a);
      case 'sinh⁻¹(': return float(Math.asinh, a);
      case 'cosh⁻¹(': return guard(V.toNumber(a) >= 1, () => float(Math.acosh, a));
      case 'tanh⁻¹(': return guard(Math.abs(V.toNumber(a)) < 1, () => float(Math.atanh, a));
      case 'log(': return b ? logarithm(a, b) : logarithm(V.int(10), a);
      case 'ln(': return guard(V.sign(a) > 0, () => (V.asRational(a)?.equals(Rational.ONE) ? V.ZERO : float(Math.log, a)));
      case 'Abs(': return V.abs(a);
      case 'Int(': return intPart(a, false);
      case 'Intg(': return intPart(a, true);
      case 'Rnd(': return this.rnd(a);
      case 'RndFix(': return rndFix(a, b);
      case 'GCD(': return gcdLcm(a, b, false);
      case 'LCM(': return gcdLcm(a, b, true);
      case 'RanInt#(': return this.ranInt(a, b);
    }
    // Pol/Rec liefern zwei Werte und werden vom Berechnungsbildschirm behandelt
    throw new CalcError('syntax');
  }

  private template(n: Extract<Node, { t: 'tpl' }>, bind: Bindings): Value {
    const arg = (i: number) => this.eval(n.args[i], bind);
    switch (n.type) {
      case 'frac': return V.div(arg(0), arg(1));
      case 'mixed': {
        const w = arg(0);
        const f = V.div(arg(1), arg(2));
        return V.sign(w) < 0 ? V.sub(w, f) : V.add(w, f);
      }
      case 'sqrt': return V.sqrt(arg(0));
      case 'cbrt': return V.root(arg(0), V.int(3));
      case 'root': return V.root(arg(1), arg(0));
      case 'pow10': return V.pow(V.int(10), arg(0));
      case 'exp': {
        const x = arg(0);
        return V.isZero(x) ? V.ONE : float(Math.exp, x);
      }
      case 'logab': return logarithm(arg(0), arg(1));
      case 'abs': return V.abs(arg(0));
      case 'integral': return this.integral(n, bind);
      case 'deriv': return this.derivative(n, bind);
      case 'sum':
      case 'prod': return this.series(n, bind, n.type === 'prod');
      case 'e10':
      case 'recurring':
        break;
    }
    throw new CalcError('syntax');
  }

  private integral(n: Extract<Node, { t: 'tpl' }>, bind: Bindings): Value {
    const a = V.toNumber(this.eval(n.args[1], bind));
    const b = V.toNumber(this.eval(n.args[2], bind));
    return numeric(() => integrate(this.asFunction(n.args[0], bind), a, b));
  }

  private derivative(n: Extract<Node, { t: 'tpl' }>, bind: Bindings): Value {
    const at = V.toNumber(this.eval(n.args[1], bind));
    return numeric(() => derivative(this.asFunction(n.args[0], bind), at));
  }

  private series(n: Extract<Node, { t: 'tpl' }>, bind: Bindings, product: boolean): Value {
    const from = V.asInteger(this.eval(n.args[1], bind));
    const to = V.asInteger(this.eval(n.args[2], bind));
    if (from === undefined || to === undefined || from > to) throw new CalcError('math');
    if (to - from >= BigInt(MAX_SUM_TERMS)) throw new CalcError('timeout');
    let acc = product ? V.ONE : V.ZERO;
    const b = new Map(bind);
    for (let k = from; k <= to; k++) {
      b.set('x', V.int(k));
      const term = this.eval(n.args[0], b);
      acc = product ? V.mul(acc, term) : V.add(acc, term);
    }
    return acc;
  }

  private rnd(a: Value): Value {
    const x = V.toNumber(a);
    const f = this.ctx.format;
    // Norm: Rundung auf 10 Stellen der Mantisse; Fix/Sci: wie angezeigt
    const fmt = f.kind === 'norm' ? ({ kind: 'sci', n: 10 } as const) : f;
    const d = formatNumber(x, fmt);
    const text = d.mantissa.replace(',', '.') + (d.exponent !== undefined ? `e${d.exponent}` : '');
    const q = Rational.fromDecimalString(text, 30);
    return q ? V.rat(q) : V.fl(Number(text));
  }

  private ranInt(a: Value, b: Value): Value {
    const lo = V.asInteger(a);
    const hi = V.asInteger(b);
    if (lo === undefined || hi === undefined || lo >= hi) throw new CalcError('argument');
    const span = Number(hi - lo) + 1;
    return V.int(lo + BigInt(Math.floor(this.ctx.random() * span)));
  }
}

function float(f: (x: number) => number, a: Value): Value {
  return V.fl(f(V.toNumber(a)));
}

function guard(ok: boolean, f: () => Value): Value {
  if (!ok) throw new CalcError('math');
  return f();
}

function numeric(f: () => number): Value {
  try {
    return { ...V.fl(round15(f())), numeric: true } as Value;
  } catch (e) {
    if (e instanceof NumericError) throw new CalcError(e.kind === 'timeout' ? 'timeout' : 'math');
    throw e;
  }
}

/** log_a(b), exakt wenn b eine (gebrochene) Potenz von a ist. */
function logarithm(base: Value, x: Value): Value {
  if (V.sign(base) <= 0 || V.sign(x) <= 0) throw new CalcError('math');
  const bq = V.asRational(base);
  const xq = V.asRational(x);
  if (bq?.equals(Rational.ONE)) throw new CalcError('math');
  const y = Math.log(V.toNumber(x)) / Math.log(V.toNumber(base));
  if (bq && xq) {
    for (let den = 1n; den <= 6n; den++) {
      const num = BigInt(Math.round(y * Number(den)));
      if (num < -400n || num > 400n) break;
      const k = Rational.of(num, den);
      // b^(num/den) = x  ⇔  b^num = x^den
      if (bq.pow(num).equals(xq.pow(den))) return V.rat(k);
    }
  }
  return V.fl(y);
}

function factorial(a: Value): Value {
  const n = V.asInteger(a);
  if (n === undefined || n < 0n || n > 69n) throw new CalcError('math');
  let p = 1n;
  for (let i = 2n; i <= n; i++) p *= i;
  return V.int(p);
}

function permutation(a: Value, b: Value, combination: boolean): Value {
  const n = V.asInteger(a);
  const r = V.asInteger(b);
  if (n === undefined || r === undefined || r < 0n || r > n || n >= 10n ** 10n) throw new CalcError('math');
  let p = 1n;
  for (let i = 0n; i < r; i++) p *= n - i;
  if (combination) {
    let f = 1n;
    for (let i = 2n; i <= r; i++) f *= i;
    p /= f;
  }
  if (p >= 10n ** 100n) throw new CalcError('math');
  return V.int(p);
}

function intPart(a: Value, floor: boolean): Value {
  const q = V.asRational(a);
  if (q) {
    let t = q.num / q.den; // BigInt-Division schneidet zur 0 hin ab
    if (floor && q.sign < 0 && !q.isInteger) t -= 1n;
    return V.int(t);
  }
  const x = V.toNumber(a);
  return V.fl(floor ? Math.floor(x) : Math.trunc(x));
}

function rndFix(a: Value, b: Value): Value {
  const n = V.asInteger(b);
  if (n === undefined || n < 0n || n > 9n) throw new CalcError('argument');
  const d = formatNumber(V.toNumber(a), { kind: 'fix', n: Number(n) });
  const text = d.mantissa.replace(',', '.') + (d.exponent !== undefined ? `e${d.exponent}` : '');
  const q = Rational.fromDecimalString(text, 30);
  return q ? V.rat(q) : V.fl(Number(text));
}

function gcdLcm(a: Value, b: Value, lcm: boolean): Value {
  let x = V.asInteger(a);
  let y = V.asInteger(b);
  if (x === undefined || y === undefined) throw new CalcError('math');
  if (lcm && (x < 0n || y < 0n)) throw new CalcError('math');
  x = x < 0n ? -x : x;
  y = y < 0n ? -y : y;
  let g = x;
  let h = y;
  while (h !== 0n) [g, h] = [h, g % h];
  if (!lcm) return V.int(g);
  return g === 0n ? V.ZERO : V.int((x / g) * y);
}
