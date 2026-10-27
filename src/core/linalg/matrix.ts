// Matrizen und Vektoren mit Value-Einträgen (exakt: Brüche, Wurzeln; sonst Gleitkomma).

import { CalcError } from '../errors';
import type { AngleUnit } from '../../display/scene';
import { acos } from '../eval/trig';
import * as V from '../value';
import type { Value } from '../value';

export interface Matrix { rows: number; cols: number; a: Value[][] }
export interface Vector { n: 2 | 3; v: Value[] }

const MAX_DIM = 4;

/** Baut eine Matrix (1..4 × 1..4, rechteckig); sonst Dimensionsfehler. */
export function mat(rows: Value[][]): Matrix {
  const r = rows.length;
  const c = rows[0]?.length ?? 0;
  if (r < 1 || r > MAX_DIM || c < 1 || c > MAX_DIM || rows.some((row) => row.length !== c)) throw new CalcError('dimension');
  return { rows: r, cols: c, a: rows.map((row) => row.slice()) };
}

export function identity(n: number): Matrix {
  return mat(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? V.ONE : V.ZERO))));
}

const sameDim = (A: Matrix, B: Matrix) => {
  if (A.rows !== B.rows || A.cols !== B.cols) throw new CalcError('dimension');
};
const square = (A: Matrix) => {
  if (A.rows !== A.cols) throw new CalcError('dimension');
};
const map = (A: Matrix, f: (x: Value, i: number, j: number) => Value): Matrix =>
  mat(A.a.map((row, i) => row.map((x, j) => f(x, i, j))));

export function madd(A: Matrix, B: Matrix): Matrix {
  sameDim(A, B);
  return map(A, (x, i, j) => V.add(x, B.a[i][j]));
}

export function msub(A: Matrix, B: Matrix): Matrix {
  sameDim(A, B);
  return map(A, (x, i, j) => V.sub(x, B.a[i][j]));
}

export function mmul(A: Matrix, B: Matrix): Matrix {
  if (A.cols !== B.rows) throw new CalcError('dimension');
  return mat(
    Array.from({ length: A.rows }, (_, i) =>
      Array.from({ length: B.cols }, (_, j) => {
        let s = V.ZERO;
        for (let k = 0; k < A.cols; k++) s = V.add(s, V.mul(A.a[i][k], B.a[k][j]));
        return s;
      }),
    ),
  );
}

export const mscale = (k: Value, A: Matrix): Matrix => map(A, (x) => V.mul(k, x));
export const mabs = (A: Matrix): Matrix => map(A, (x) => V.abs(x));
export const transpose = (A: Matrix): Matrix => mat(Array.from({ length: A.cols }, (_, j) => A.a.map((row) => row[j])));

/** Potenz mit ganzzahligem Exponenten 0..99 (Quadrieren/Multiplizieren); nur quadratisch. */
export function mpow(A: Matrix, n: number): Matrix {
  square(A);
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new CalcError('math');
  let result = identity(A.rows);
  let base = A;
  for (let e = n; e > 0; e >>= 1) {
    if (e & 1) result = mmul(result, base);
    if (e > 1) base = mmul(base, base);
  }
  return result;
}

// --- Gauß-Verfahren ---

/** Gleitkomma-Reste unterhalb dieser Schwelle gelten als 0; exakte Werte werden exakt geprüft. */
const EPS = 1e-12;
export const nonZero = (x: Value): boolean => (x.k === 'f' ? Math.abs(x.x) > EPS : !V.isZero(x));

/**
 * Pivotzeile ab `from` in Spalte `col` ('largest': betragsgrößter Eintrag;
 * 'auto': erster exakt von 0 verschiedener Eintrag, bei Gleitkomma der größte). -1 wenn keiner.
 */
function pickPivot(a: Value[][], col: number, from: number, mode: 'largest' | 'auto'): number {
  let best = -1;
  let bestAbs = 0;
  for (let i = from; i < a.length; i++) {
    const x = a[i][col];
    if (!nonZero(x)) continue;
    if (mode === 'auto' && x.k !== 'f') return i;
    const m = Math.abs(V.toNumber(x));
    if (best < 0 || m > bestAbs) { best = i; bestAbs = m; }
  }
  return best;
}

/**
 * Gauß-Elimination in-place über die ersten `ncols` Spalten (weitere Spalten laufen mit).
 * Pivotzeilen werden auf führende 1 normiert, unterhalb (und bei `reduced` auch oberhalb) eliminiert.
 * Liefert die Pivotspalten.
 */
export function eliminate(a: Value[][], ncols: number, reduced: boolean, mode: 'largest' | 'auto'): number[] {
  const width = a[0].length;
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < ncols && row < a.length; col++) {
    const p = pickPivot(a, col, row, mode);
    if (p < 0) continue;
    [a[row], a[p]] = [a[p], a[row]];
    const pv = a[row][col];
    for (let j = col; j < width; j++) a[row][j] = V.div(a[row][j], pv);
    a[row][col] = V.ONE;
    for (let i = reduced ? 0 : row + 1; i < a.length; i++) {
      if (i === row) continue;
      if (!nonZero(a[i][col])) {
        a[i][col] = V.ZERO;
        continue;
      }
      const f = a[i][col];
      for (let j = col; j < width; j++) a[i][j] = V.sub(a[i][j], V.mul(f, a[row][j]));
      a[i][col] = V.ZERO;
    }
    pivots.push(col);
    row++;
  }
  return pivots;
}

const clone = (A: Matrix): Value[][] => A.a.map((r) => r.slice());

/**
 * Ref/Rref wie beim ClassWiz: Gauß-Verfahren mit Spaltenpivotisierung nach dem betragsgrößten
 * Eintrag, Pivotzeilen auf führende 1 normiert; Ref eliminiert nur unterhalb, Rref auch oberhalb.
 */
export function ref(A: Matrix): Matrix {
  const a = clone(A);
  eliminate(a, A.cols, false, 'largest');
  return mat(a);
}

export function rref(A: Matrix): Matrix {
  const a = clone(A);
  eliminate(a, A.cols, true, 'largest');
  return mat(a);
}

/** Determinante per Gauß-Elimination ohne Normierung (exakt, Vorzeichen der Zeilentausche mitgeführt). */
export function det(A: Matrix): Value {
  square(A);
  const a = clone(A);
  const n = A.rows;
  let d = V.ONE;
  for (let c = 0; c < n; c++) {
    const p = pickPivot(a, c, c, 'auto');
    if (p < 0) return V.ZERO;
    if (p !== c) { [a[c], a[p]] = [a[p], a[c]]; d = V.neg(d); }
    d = V.mul(d, a[c][c]);
    for (let i = c + 1; i < n; i++) {
      if (!nonZero(a[i][c])) continue;
      const f = V.div(a[i][c], a[c][c]);
      for (let j = c; j < n; j++) a[i][j] = V.sub(a[i][j], V.mul(f, a[c][j]));
    }
  }
  return d;
}

/** Inverse per Gauß-Jordan auf [A | I]; singulär → Mathem. Fehler. */
export function inverse(A: Matrix): Matrix {
  square(A);
  const n = A.rows;
  const I = identity(n);
  const a = A.a.map((r, i) => [...r, ...I.a[i]]);
  const pivots = eliminate(a, n, true, 'auto');
  if (pivots.length < n) throw new CalcError('math');
  return mat(a.map((r) => r.slice(n)));
}

// --- Vektoren ---

export function vec(...v: Value[]): Vector {
  if (v.length !== 2 && v.length !== 3) throw new CalcError('dimension');
  return { n: v.length as 2 | 3, v: v.slice() };
}

const sameN = (a: Vector, b: Vector) => {
  if (a.n !== b.n) throw new CalcError('dimension');
};

export function vadd(a: Vector, b: Vector): Vector {
  sameN(a, b);
  return vec(...a.v.map((x, i) => V.add(x, b.v[i])));
}

export function vsub(a: Vector, b: Vector): Vector {
  sameN(a, b);
  return vec(...a.v.map((x, i) => V.sub(x, b.v[i])));
}

export const vscale = (k: Value, a: Vector): Vector => vec(...a.v.map((x) => V.mul(k, x)));

export function dot(a: Vector, b: Vector): Value {
  sameN(a, b);
  return a.v.reduce((s, x, i) => V.add(s, V.mul(x, b.v[i])), V.ZERO);
}

/** Kreuzprodukt, nur 3D. */
export function cross(a: Vector, b: Vector): Vector {
  if (a.n !== 3 || b.n !== 3) throw new CalcError('dimension');
  const [a1, a2, a3] = a.v;
  const [b1, b2, b3] = b.v;
  return vec(
    V.sub(V.mul(a2, b3), V.mul(a3, b2)),
    V.sub(V.mul(a3, b1), V.mul(a1, b3)),
    V.sub(V.mul(a1, b2), V.mul(a2, b1)),
  );
}

/** Betrag (Norm), exakt über Wurzel wenn möglich. */
export const vabs = (a: Vector): Value => V.sqrt(dot(a, a));

export function unitVector(a: Vector): Vector {
  const l = vabs(a);
  if (V.isZero(l)) throw new CalcError('math');
  return vec(...a.v.map((x) => V.div(x, l)));
}

/** Winkel zwischen zwei Vektoren in der gewählten Einheit (acos, Quotient auf [-1, 1] begrenzt). */
export function angle(a: Vector, b: Vector, unit: AngleUnit): Value {
  sameN(a, b);
  const den = V.mul(vabs(a), vabs(b));
  if (V.isZero(den)) throw new CalcError('math');
  let c = V.div(dot(a, b), den);
  const x = V.toNumber(c);
  if (x > 1) c = V.ONE;
  else if (x < -1) c = V.neg(V.ONE);
  return acos(c, unit);
}
