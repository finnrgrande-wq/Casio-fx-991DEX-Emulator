// Komplexe Arithmetik mit exakten Teilen (Realteil/Imaginärteil als Value) und Auswertung des AST.
// Teilbäume ohne i, ∠ und komplexe Funktionen übernimmt der reelle Auswerter.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import * as T from '../../core/eval/trig';
import { Rational } from '../../core/exact/rational';
import type { Node } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import type { AngleUnit } from '../../display/scene';

export interface C {
  re: Value;
  im: Value;
}

export const real = (re: Value): C => ({ re, im: V.ZERO });
export const isReal = (z: C): boolean => V.isZero(z.im);

export const cadd = (a: C, b: C): C => ({ re: V.add(a.re, b.re), im: V.add(a.im, b.im) });
export const csub = (a: C, b: C): C => ({ re: V.sub(a.re, b.re), im: V.sub(a.im, b.im) });
export const cneg = (a: C): C => ({ re: V.neg(a.re), im: V.neg(a.im) });
export const conj = (a: C): C => ({ re: a.re, im: V.neg(a.im) });

export function cmul(a: C, b: C): C {
  if (isReal(a) && isReal(b)) return real(V.mul(a.re, b.re));
  return {
    re: V.sub(V.mul(a.re, b.re), V.mul(a.im, b.im)),
    im: V.add(V.mul(a.re, b.im), V.mul(a.im, b.re)),
  };
}

export function cdiv(a: C, b: C): C {
  if (isReal(a) && isReal(b)) return real(V.div(a.re, b.re));
  const den = V.add(V.mul(b.re, b.re), V.mul(b.im, b.im));
  const n = cmul(a, conj(b));
  return { re: V.div(n.re, den), im: V.div(n.im, den) };
}

/** Ganzzahlige Potenz durch wiederholtes Quadrieren, |n| < 10¹⁰. */
export function cpow(z: C, n: bigint): C {
  if (n >= 10n ** 10n || n <= -(10n ** 10n)) throw new CalcError('math');
  if (isReal(z)) return real(V.pow(z.re, V.int(n)));
  let e = n < 0n ? -n : n;
  let base = z;
  let acc = real(V.ONE);
  while (e > 0n) {
    if (e & 1n) acc = cmul(acc, base);
    e >>= 1n;
    if (e > 0n) base = cmul(base, base);
  }
  return n < 0n ? cdiv(real(V.ONE), acc) : acc;
}

/** Betrag |z|. */
export function cabs(z: C): Value {
  if (isReal(z)) return V.abs(z.re);
  return V.sqrt(V.add(V.mul(z.re, z.re), V.mul(z.im, z.im)));
}

/** Argument im Bereich −180° < θ ≤ 180° (in der Winkeleinheit), exakt wo möglich. */
export function carg(z: C, unit: AngleUnit): Value {
  const sx = V.sign(z.re);
  const sy = V.sign(z.im);
  if (sx === 0 && sy === 0) throw new CalcError('math');
  const half = unit === 'D' ? V.int(180) : unit === 'G' ? V.int(200) : V.piTimes(Rational.ONE);
  if (sx === 0) {
    const q = V.div(half, V.int(2));
    return sy > 0 ? q : V.neg(q);
  }
  if (sy === 0) return sx > 0 ? V.ZERO : half;
  const a = T.atan(V.div(z.im, z.re), unit);
  if (sx > 0) return a;
  return sy > 0 ? V.add(a, half) : V.sub(a, half);
}

/** r∠θ → a+bi */
export function fromPolar(r: Value, theta: Value, unit: AngleUnit): C {
  return { re: V.mul(r, T.cos(theta, unit)), im: V.mul(r, T.sin(theta, unit)) };
}

export interface CContext extends EvalContext {
  getC(name: string): C;
  ansC: C;
}

const COMPLEX_FUNCS = new Set(['arg(', 'Conjg(', 'ReP(', 'ImP(']);

export class ComplexEvaluator {
  private readonly rev: Evaluator;

  constructor(private readonly ctx: CContext) {
    this.rev = new Evaluator(ctx);
  }

  eval(node: Node): C {
    try {
      return this.node(node);
    } catch (e) {
      if (e instanceof CalcError && !e.at) e.at = node.at;
      throw e;
    }
  }

  /** Teilbaum ohne komplexe Anteile (und ohne √, die für negative Werte i liefert). */
  private pure(n: Node): boolean {
    switch (n.t) {
      case 'num': return !n.exp || this.pure(n.exp);
      case 'var': return isReal(this.ctx.getC(n.name));
      case 'const': return n.name === 'Ans' ? isReal(this.ctx.ansC) : n.name !== 'i';
      case 'neg':
      case 'post': return this.pure(n.arg);
      case 'conv': return !n.label.startsWith('▸') && this.pure(n.arg);
      case 'bin': return n.op !== '∠' && this.pure(n.l) && this.pure(n.r);
      case 'dms': return n.parts.every((p) => this.pure(p));
      case 'pow': return this.pure(n.base) && this.pure(n.exp);
      case 'call': return !COMPLEX_FUNCS.has(n.fn) && n.args.every((a) => this.pure(a));
      case 'tpl': return n.type !== 'sqrt' && n.args.every((a) => this.pure(a));
    }
  }

  private node(n: Node): C {
    if (this.pure(n)) return real(this.rev.eval(n));
    switch (n.t) {
      case 'var': return this.ctx.getC(n.name);
      case 'const':
        if (n.name === 'i') return { re: V.ZERO, im: V.ONE };
        return this.ctx.ansC; // nur Ans kann hier komplex sein
      case 'neg': return cneg(this.eval(n.arg));
      case 'bin': return this.binary(n);
      case 'post': {
        const a = this.eval(n.arg);
        if (n.op === '²') return cpow(a, 2n);
        if (n.op === '³') return cpow(a, 3n);
        if (n.op === '⁻¹') return cdiv(real(V.ONE), a);
        if (n.op === '%') return cdiv(a, real(V.int(100)));
        return this.realOp(n, [n.arg]);
      }
      case 'pow': {
        const base = this.eval(n.base);
        const exp = this.eval(n.exp);
        if (!isReal(exp)) throw new CalcError('math');
        if (isReal(base)) return real(V.pow(base.re, exp.re));
        const k = V.asInteger(exp.re);
        if (k === undefined || !V.isExact(exp.re)) throw new CalcError('math');
        return cpow(base, k);
      }
      case 'call': {
        const [a] = n.args.map((x) => this.eval(x));
        switch (n.fn) {
          case 'Abs(': return real(cabs(a));
          case 'arg(': return real(carg(a, this.ctx.angle));
          case 'Conjg(': return conj(a);
          case 'ReP(': return real(a.re);
          case 'ImP(': return real(a.im);
        }
        return this.realOp(n, n.args);
      }
      case 'tpl': {
        if (n.type === 'abs') return real(cabs(this.eval(n.args[0])));
        if (n.type === 'frac') return cdiv(this.eval(n.args[0]), this.eval(n.args[1]));
        if (n.type === 'sqrt') {
          const a = this.eval(n.args[0]);
          if (!isReal(a)) throw new CalcError('math');
          if (V.sign(a.re) < 0) return { re: V.ZERO, im: V.sqrt(V.neg(a.re)) };
          return real(V.sqrt(a.re));
        }
        if (n.type === 'integral' || n.type === 'deriv' || n.type === 'sum' || n.type === 'prod') throw new CalcError('math');
        return this.realOp(n, n.args);
      }
      case 'conv':
      case 'dms':
        return this.realOp(n, n.t === 'conv' ? [n.arg] : n.parts);
      case 'num':
        throw new CalcError('math');
    }
  }

  private binary(n: Extract<Node, { t: 'bin' }>): C {
    const a = this.eval(n.l);
    const b = this.eval(n.r);
    switch (n.op) {
      case '+': return cadd(a, b);
      case '−': return csub(a, b);
      case '×':
      case 'imul': return cmul(a, b);
      case '÷': return cdiv(a, b);
      case '∠':
        if (!isReal(a) || !isReal(b)) throw new CalcError('math');
        return fromPolar(a.re, b.re, this.ctx.angle);
    }
    return this.realOp(n, [n.l, n.r]);
  }

  /** Funktionen nur für reelle Argumente: Argumente auswerten, durch Platzhalter ersetzen, reell rechnen. */
  private realOp(n: Node, kids: Node[]): C {
    const bind = new Map<string, Value>();
    const repl = kids.map((k, i) => {
      const z = this.eval(k);
      if (!isReal(z)) throw new CalcError('math', k.at);
      const name = `#${i}`;
      bind.set(name, z.re);
      return { t: 'var', name, at: k.at } as Node;
    });
    let copy: Node;
    switch (n.t) {
      case 'bin': copy = { ...n, l: repl[0], r: repl[1] }; break;
      case 'post':
      case 'conv': copy = { ...n, arg: repl[0] }; break;
      case 'dms': copy = { ...n, parts: repl }; break;
      case 'pow': copy = { ...n, base: repl[0], exp: repl[1] }; break;
      case 'call':
      case 'tpl': copy = { ...n, args: repl } as Node; break;
      default: throw new CalcError('syntax', n.at);
    }
    return real(this.rev.eval(copy, bind));
  }
}
