// Rechenkern der Ungleichungen (Grad 2–4): reelle Nullstellen, Vorzeichenanalyse, Lösungsmenge.

import { CalcError } from '../../core/errors';
import { polyRoots } from '../../core/numeric/poly';
import * as V from '../../core/value';
import type { Value } from '../../core/value';

export type Rel = '>' | '<' | '≥' | '≤';

/** Ein Teil der Lösungsmenge; lo/hi sind Indizes in `roots` (fehlend = unbegrenzt). */
export interface Piece {
  lo?: number;
  hi?: number;
  loClosed: boolean;
  hiClosed: boolean;
}

export interface IneqSolution {
  /** Verschiedene reelle Nullstellen, aufsteigend. */
  roots: Value[];
  kind: 'set' | 'all' | 'none';
  pieces: Piece[];
}

const numeric = (x: number): Value => ({ ...V.fl(x), numeric: true }) as Value;

// --- exakte Nullstellen ---

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

function divisors(n: bigint): bigint[] | undefined {
  n = n < 0n ? -n : n;
  if (n === 0n || n > 10n ** 12n) return undefined;
  const out: bigint[] = [];
  for (let d = 1n; d * d <= n; d++) {
    if (n % d === 0n) out.push(d, n / d);
  }
  return out;
}

/** Ganzzahlige Koeffizienten (höchster zuerst) oder undefined, wenn nicht alle rational sind. */
function integerCoeffs(c: Value[]): bigint[] | undefined {
  const qs = c.map((v) => V.asRational(v));
  if (qs.some((q) => !q)) return undefined;
  let l = 1n;
  for (const q of qs) l = (l * q!.den) / gcd(l, q!.den);
  return qs.map((q) => (q!.num * l) / q!.den);
}

/** Löst ax²+bx+c exakt; liefert die reellen Nullstellen (ggf. doppelt). */
function quadratic(a: Value, b: Value, c: Value): Value[] {
  const d = V.sub(V.mul(b, b), V.mul(V.int(4), V.mul(a, c)));
  if (V.sign(d) < 0) return [];
  const twoA = V.mul(V.int(2), a);
  const mid = V.div(V.neg(b), twoA);
  if (V.isZero(d)) return [mid, mid];
  const w = V.div(V.sqrt(d), twoA);
  return [V.add(mid, w), V.sub(mid, w)];
}

function evalAt(c: bigint[], p: bigint, q: bigint): bigint {
  // Σ c_i p^(n−i) q^i
  const n = c.length - 1;
  let s = 0n;
  for (let i = 0; i <= n; i++) s += c[i] * p ** BigInt(n - i) * q ** BigInt(i);
  return s;
}

/** Alle reellen Nullstellen (mit Vielfachheit, unsortiert). */
function rawRoots(coeffs: Value[]): Value[] {
  let ints = integerCoeffs(coeffs);
  const out: Value[] = [];
  if (ints) {
    // Nullstelle 0 abspalten
    while (ints.length > 1 && ints[ints.length - 1] === 0n) {
      ints = ints.slice(0, -1);
      out.push(V.ZERO);
    }
    // rationale Nullstellen abspalten (Satz über rationale Nullstellen)
    search: while (ints.length > 3) {
      const ps = divisors(ints[ints.length - 1]);
      const qs = divisors(ints[0]);
      if (!ps || !qs) break;
      for (const p0 of ps) {
        for (const q of qs) {
          for (const p of [p0, -p0]) {
            if (gcd(p, q) !== 1n || evalAt(ints, p, q) !== 0n) continue;
            const next: bigint[] = [];
            let carry = 0n;
            for (let i = 0; i < ints.length - 1; i++) {
              const qi = (ints[i] + carry) / q;
              next.push(qi);
              carry = p * qi;
            }
            out.push(V.div(V.int(p), V.int(q)));
            ints = next;
            continue search;
          }
        }
      }
      break;
    }
    const c = ints.map((n) => V.int(n));
    if (c.length === 3) return [...out, ...quadratic(c[0], c[1], c[2])];
    if (c.length === 2) return [...out, V.div(V.neg(c[1]), c[0])];
    if (c.length === 5 && V.isZero(c[1]) && V.isZero(c[3])) {
      // biquadratisch: y = x²
      for (const y of quadratic(c[0], c[2], c[4])) {
        if (V.sign(y) < 0) continue;
        const r = V.sqrt(y);
        out.push(r, V.neg(r));
      }
      return out;
    }
    if (c.length > 3) return [...out, ...numericRoots(c)];
    return out;
  }
  return numericRoots(coeffs);
}

function numericRoots(coeffs: Value[]): Value[] {
  return polyRoots(coeffs.map(V.toNumber))
    .filter((r) => r.im === 0)
    .map((r) => numeric(r.re));
}

/** Verschiedene reelle Nullstellen, aufsteigend. */
export function realRoots(coeffs: Value[]): Value[] {
  const all = rawRoots(coeffs).sort((a, b) => V.toNumber(a) - V.toNumber(b));
  const out: Value[] = [];
  for (const r of all) {
    const prev = out[out.length - 1];
    const x = V.toNumber(r);
    if (prev) {
      const y = V.toNumber(prev);
      if (Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x))) continue;
    }
    out.push(r);
  }
  return out;
}

function horner(c: number[], x: number): number {
  return c.reduce((s, k) => s * x + k, 0);
}

export function solveInequality(coeffs: Value[], rel: Rel): IneqSolution {
  if (V.isZero(coeffs[0])) throw new CalcError('math');
  const roots = realRoots(coeffs);
  const nums = roots.map(V.toNumber);
  const c = coeffs.map(V.toNumber);
  const strict = rel === '>' || rel === '<';
  const want = rel === '>' || rel === '≥' ? 1 : -1;
  const k = roots.length;
  // Elemente: Intervall 0, Nullstelle 1, Intervall 1, …, Intervall k
  const included: boolean[] = [];
  for (let i = 0; i <= k; i++) {
    const t = k === 0 ? 0 : i === 0 ? nums[0] - Math.max(1, Math.abs(nums[0])) : i === k ? nums[k - 1] + Math.max(1, Math.abs(nums[k - 1])) : (nums[i - 1] + nums[i]) / 2;
    included.push(Math.sign(horner(c, t)) === want);
    if (i < k) included.push(!strict);
  }
  if (included.every(Boolean)) return { roots, kind: 'all', pieces: [] };
  if (!included.some(Boolean)) return { roots, kind: 'none', pieces: [] };
  const pieces: Piece[] = [];
  for (let e = 0; e < included.length; e++) {
    if (!included[e]) continue;
    let end = e;
    while (end + 1 < included.length && included[end + 1]) end++;
    // gerade Elemente sind Intervalle, ungerade Nullstellen (Nummer (e+1)/2)
    const loIsRoot = e % 2 === 1;
    const hiIsRoot = end % 2 === 1;
    const piece: Piece = { loClosed: loIsRoot, hiClosed: hiIsRoot };
    if (loIsRoot) piece.lo = (e - 1) / 2;
    else if (e > 0) piece.lo = e / 2 - 1;
    if (hiIsRoot) piece.hi = (end - 1) / 2;
    else if (end < included.length - 1) piece.hi = end / 2;
    pieces.push(piece);
    e = end;
  }
  return { roots, kind: 'set', pieces };
}
