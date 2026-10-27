// Auswertung von Ausdrücken mit Matrizen und Vektoren (Anwendungen 4 und 5).
// Rein skalare Teilausdrücke wertet der normale Rechenkern aus.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import * as LA from '../../core/linalg/matrix';
import type { Matrix, Vector } from '../../core/linalg/matrix';
import type { Node } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';

export type TValue = { k: 'scalar'; v: Value } | { k: 'mat'; m: Matrix } | { k: 'vec'; v: Vector };

export interface TensorStore {
  get(name: string): Matrix | Vector | undefined;
}

const isTensorName = (name: string): boolean => name.startsWith('Mat') || name.startsWith('Vct');

function hasTensor(n: Node): boolean {
  switch (n.t) {
    case 'var': return isTensorName(n.name);
    case 'num':
    case 'const': return false;
    case 'neg':
    case 'post':
    case 'conv': return hasTensor(n.arg);
    case 'bin': return hasTensor(n.l) || hasTensor(n.r);
    case 'dms': return n.parts.some(hasTensor);
    case 'pow': return hasTensor(n.base) || hasTensor(n.exp);
    case 'call': return n.fn === 'Identity(' || n.args.some(hasTensor);
    case 'tpl': return n.args.some(hasTensor);
  }
}

export class TensorEvaluator {
  private readonly scalar: Evaluator;

  constructor(
    ctx: EvalContext,
    private readonly store: TensorStore,
  ) {
    this.scalar = new Evaluator(ctx);
  }

  eval(n: Node): TValue {
    try {
      return this.node(n);
    } catch (e) {
      if (e instanceof CalcError && !e.at) e.at = n.at;
      throw e;
    }
  }

  private num(n: Node): Value {
    const t = this.eval(n);
    if (t.k !== 'scalar') throw new CalcError('dimension', n.at);
    return t.v;
  }

  private node(n: Node): TValue {
    if (!hasTensor(n)) return { k: 'scalar', v: this.scalar.eval(n) };
    switch (n.t) {
      case 'var': {
        const t = this.store.get(n.name);
        if (!t) throw new CalcError('dimension');
        return 'rows' in t ? { k: 'mat', m: t } : { k: 'vec', v: t };
      }
      case 'neg':
        return scale(V.int(-1), this.eval(n.arg));
      case 'bin':
        return this.binary(n.op, this.eval(n.l), this.eval(n.r));
      case 'post': {
        const a = this.eval(n.arg);
        if (a.k !== 'mat') throw new CalcError('syntax');
        if (n.op === '⁻¹') return { k: 'mat', m: LA.inverse(a.m) };
        if (n.op === '²') return { k: 'mat', m: LA.mpow(a.m, 2) };
        if (n.op === '³') return { k: 'mat', m: LA.mpow(a.m, 3) };
        throw new CalcError('syntax');
      }
      case 'call':
        return this.call(n.fn, n.args);
      case 'tpl':
        if (n.type === 'abs') return this.call('Abs(', n.args);
        throw new CalcError('syntax');
      default:
        // Potenzschablone, Umrechnungen usw. sind mit Matrizen/Vektoren nicht erlaubt
        throw new CalcError('syntax');
    }
  }

  private binary(op: string, a: TValue, b: TValue): TValue {
    if (a.k === 'scalar' && b.k === 'scalar') throw new CalcError('syntax');
    switch (op) {
      case '+':
      case '−': {
        if (a.k === 'mat' && b.k === 'mat') return { k: 'mat', m: op === '+' ? LA.madd(a.m, b.m) : LA.msub(a.m, b.m) };
        if (a.k === 'vec' && b.k === 'vec') return { k: 'vec', v: op === '+' ? LA.vadd(a.v, b.v) : LA.vsub(a.v, b.v) };
        throw new CalcError('dimension');
      }
      case '×':
      case 'imul': {
        if (a.k === 'scalar') return scale(a.v, b);
        if (b.k === 'scalar') return scale(b.v, a);
        if (a.k === 'mat' && b.k === 'mat') return { k: 'mat', m: LA.mmul(a.m, b.m) };
        // VctA × VctB ist das Kreuzprodukt
        if (a.k === 'vec' && b.k === 'vec') return { k: 'vec', v: LA.cross(a.v, b.v) };
        throw new CalcError('dimension');
      }
      case '÷':
        if (b.k === 'scalar') return scale(V.div(V.ONE, b.v), a);
        throw new CalcError('dimension');
      case '•':
        if (a.k === 'vec' && b.k === 'vec') return { k: 'scalar', v: LA.dot(a.v, b.v) };
        throw new CalcError('dimension');
    }
    throw new CalcError('syntax');
  }

  private call(fn: string, args: Node[]): TValue {
    if (fn === 'Identity(') {
      const n = V.asInteger(this.num(args[0]));
      if (n === undefined || n < 1n || n > 4n) throw new CalcError('argument');
      return { k: 'mat', m: LA.identity(Number(n)) };
    }
    const a = this.eval(args[0]);
    switch (fn) {
      case 'Det(':
        return { k: 'scalar', v: LA.det(matrix(a)) };
      case 'Trn(':
        return { k: 'mat', m: LA.transpose(matrix(a)) };
      case 'Ref(':
        return { k: 'mat', m: LA.ref(matrix(a)) };
      case 'Rref(':
        return { k: 'mat', m: LA.rref(matrix(a)) };
      case 'Abs(':
        if (a.k === 'mat') return { k: 'mat', m: LA.mabs(a.m) };
        if (a.k === 'vec') return { k: 'scalar', v: LA.vabs(a.v) };
        return { k: 'scalar', v: V.abs(a.v) };
      case 'UnitV(':
        return { k: 'vec', v: LA.unitVector(vector(a)) };
      case 'Angle(':
        return { k: 'scalar', v: LA.angle(vector(a), vector(this.eval(args[1])), this.angleUnit) };
    }
    throw new CalcError('syntax');
  }

  angleUnit: 'D' | 'R' | 'G' = 'D';
}

function scale(k: Value, t: TValue): TValue {
  if (t.k === 'mat') return { k: 'mat', m: LA.mscale(k, t.m) };
  if (t.k === 'vec') return { k: 'vec', v: LA.vscale(k, t.v) };
  return { k: 'scalar', v: V.mul(k, t.v) };
}

function matrix(t: TValue): Matrix {
  if (t.k !== 'mat') throw new CalcError('dimension');
  return t.m;
}

function vector(t: TValue): Vector {
  if (t.k !== 'vec') throw new CalcError('dimension');
  return t.v;
}

// --- Speicherung ---

export type StoredTensor = { rows: number; cols: number; a: V.SerializedValue[][] } | { n: 2 | 3; v: V.SerializedValue[] };

export function saveTensor(t: Matrix | Vector): StoredTensor {
  return 'rows' in t ? { rows: t.rows, cols: t.cols, a: t.a.map((r) => r.map(V.serialize)) } : { n: t.n, v: t.v.map(V.serialize) };
}

export function loadTensor(s: StoredTensor): Matrix | Vector {
  return 'rows' in s ? { rows: s.rows, cols: s.cols, a: s.a.map((r) => r.map((x) => V.deserialize(x))) } : { n: s.n, v: s.v.map((x) => V.deserialize(x)) };
}
