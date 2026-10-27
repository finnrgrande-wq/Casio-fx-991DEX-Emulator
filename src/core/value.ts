// Werte des Rechenkerns: exakt (Wurzelterm inkl. rationaler Zahlen, Vielfaches von π) oder Gleitkomma.
// Jede Operation bleibt exakt, solange das Ergebnis darstellbar ist, sonst Rückfall auf float64.

import { Rational } from './exact/rational';
import { Surd } from './exact/surd';
import { CalcError } from './errors';

export type Value =
  | { k: 's'; s: Surd }
  | { k: 'pi'; q: Rational }
  /** numeric: Ergebnis von ∫ oder d/dx – darf in der Anzeige als Bruch erkannt werden. */
  | { k: 'f'; x: number; numeric?: boolean };

/** Größte Stellenzahl von Zähler/Nenner, bis zu der exakt weitergerechnet wird. */
const MAX_EXACT_DIGITS = 40;

export const ZERO: Value = { k: 's', s: Surd.ZERO };
export const ONE: Value = { k: 's', s: Surd.ONE };

export const rat = (q: Rational): Value => ({ k: 's', s: Surd.fromRational(q) });
export const int = (n: bigint | number): Value => rat(Rational.of(BigInt(n)));
export const surd = (s: Surd): Value => ({ k: 's', s });
export const piTimes = (q: Rational): Value => (q.isZero ? ZERO : { k: 'pi', q });

/** Gleitkommawert; nicht endliche oder zu große Werte sind ein mathematischer Fehler. */
export function fl(x: number): Value {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e100) throw new CalcError('math');
  return { k: 'f', x: Math.abs(x) < 1e-99 ? 0 : x };
}

export function toNumber(v: Value): number {
  switch (v.k) {
    case 's': return v.s.toNumber();
    case 'pi': return v.q.toNumber() * Math.PI;
    case 'f': return v.x;
  }
}

export function asRational(v: Value): Rational | undefined {
  return v.k === 's' ? v.s.toRational() : undefined;
}

export const isExact = (v: Value): boolean => v.k !== 'f';

/** Liefert eine ganze Zahl, wenn der Wert (auch als Gleitkomma) ganzzahlig ist. */
export function asInteger(v: Value): bigint | undefined {
  const q = asRational(v);
  if (q) return q.isInteger ? q.num : undefined;
  const x = toNumber(v);
  return Number.isInteger(x) && Math.abs(x) < 1e15 ? BigInt(x) : undefined;
}

function tooBig(q: Rational): boolean {
  return q.num.toString().length > MAX_EXACT_DIGITS || q.den.toString().length > MAX_EXACT_DIGITS;
}

/** Hält exakte Werte handhabbar; sonst Umwandlung in Gleitkomma. */
function norm(v: Value | undefined, fallback: () => number): Value {
  if (!v) return fl(fallback());
  if (v.k === 's') {
    if (v.s.terms.some((t) => tooBig(t.coef))) return fl(v.s.toNumber());
    const x = Math.abs(v.s.toNumber());
    if (x >= 1e100) throw new CalcError('math');
  }
  if (v.k === 'pi') {
    if (tooBig(v.q)) return fl(v.q.toNumber() * Math.PI);
    if (v.q.isZero) return ZERO;
  }
  return v;
}

export function neg(a: Value): Value {
  switch (a.k) {
    case 's': return surd(a.s.neg());
    case 'pi': return piTimes(a.q.neg());
    case 'f': return fl(-a.x);
  }
}

export function add(a: Value, b: Value): Value {
  let r: Value | undefined;
  if (a.k === 's' && b.k === 's') r = surd(a.s.add(b.s));
  else if (a.k === 'pi' && b.k === 'pi') r = piTimes(a.q.add(b.q));
  else if (a.k === 'pi' && isZero(b)) r = a;
  else if (b.k === 'pi' && isZero(a)) r = b;
  return norm(r, () => toNumber(a) + toNumber(b));
}

export const sub = (a: Value, b: Value): Value => add(a, neg(b));

export function mul(a: Value, b: Value): Value {
  let r: Value | undefined;
  if (isZero(a) || isZero(b)) return ZERO;
  if (a.k === 's' && b.k === 's') {
    const m = a.s.mul(b.s);
    r = m && surd(m);
  } else if (a.k === 'pi' && b.k === 's') {
    const q = b.s.toRational();
    r = q && piTimes(a.q.mul(q));
  } else if (a.k === 's' && b.k === 'pi') {
    const q = a.s.toRational();
    r = q && piTimes(b.q.mul(q));
  }
  return norm(r, () => toNumber(a) * toNumber(b));
}

export function div(a: Value, b: Value): Value {
  if (isZero(b)) throw new CalcError('math');
  let r: Value | undefined;
  if (a.k === 's' && b.k === 's') {
    const d = a.s.div(b.s);
    r = d && surd(d);
  } else if (a.k === 'pi' && b.k === 's') {
    const q = b.s.toRational();
    r = q && piTimes(a.q.div(q));
  } else if (a.k === 'pi' && b.k === 'pi') {
    r = rat(a.q.div(b.q));
  }
  return norm(r, () => toNumber(a) / toNumber(b));
}

export function isZero(v: Value): boolean {
  return v.k === 's' ? v.s.terms.length === 0 : v.k === 'pi' ? v.q.isZero : v.x === 0;
}

export function sign(v: Value): -1 | 0 | 1 {
  if (v.k === 's') return v.s.sign();
  if (v.k === 'pi') return v.q.sign;
  return v.x < 0 ? -1 : v.x > 0 ? 1 : 0;
}

export function abs(v: Value): Value {
  return sign(v) < 0 ? neg(v) : v;
}

/** Ganzzahlige n-te Wurzel einer nichtnegativen BigInt, falls exakt. */
export function exactRoot(n: bigint, k: number): bigint | undefined {
  if (n < 0n) return undefined;
  if (n < 2n) return n;
  let x = BigInt(Math.round(Number(n) ** (1 / k)));
  // Korrektur der Gleitkomma-Schätzung
  for (let i = 0; i < 4; i++) {
    const p = x ** BigInt(k);
    if (p === n) return x;
    x = p > n ? x - 1n : x + 1n;
    if (x < 0n) return undefined;
  }
  return x ** BigInt(k) === n ? x : undefined;
}

/** k-te Wurzel einer rationalen Zahl, falls Zähler und Nenner exakte Potenzen sind. */
function rationalRoot(q: Rational, k: number): Rational | undefined {
  const negative = q.sign < 0;
  if (negative && k % 2 === 0) return undefined;
  const n = exactRoot(negative ? -q.num : q.num, k);
  const d = exactRoot(q.den, k);
  if (n === undefined || d === undefined) return undefined;
  return Rational.of(negative ? -n : n, d);
}

export function sqrt(a: Value): Value {
  if (sign(a) < 0) throw new CalcError('math');
  const q = asRational(a);
  if (q) {
    const s = Surd.sqrt(q);
    if (s) return norm(surd(s), () => Math.sqrt(toNumber(a)));
  }
  return fl(Math.sqrt(toNumber(a)));
}

/** n-te Wurzel (n ganzzahlig ≠ 0). */
export function root(a: Value, n: Value): Value {
  const k = asInteger(n);
  if (k === 2n) return sqrt(a);
  if (k !== undefined && k !== 0n) {
    const q = asRational(a);
    const kk = Number(k < 0n ? -k : k);
    if (q && kk <= 64) {
      const r = rationalRoot(q, kk);
      if (r) return k < 0n ? div(ONE, rat(r)) : rat(r);
    }
    const x = toNumber(a);
    if (x < 0) {
      if (kk % 2 === 0) throw new CalcError('math');
      const y = -(Math.abs(x) ** (1 / kk));
      return fl(k < 0n ? 1 / y : y);
    }
    return fl(x ** (1 / Number(k)));
  }
  const x = toNumber(a);
  if (x < 0) throw new CalcError('math');
  const nx = toNumber(n);
  if (nx === 0) throw new CalcError('math');
  return fl(x ** (1 / nx));
}

export function pow(a: Value, b: Value): Value {
  const e = asInteger(b);
  const exactExp = isExact(b);
  if (exactExp && e !== undefined) {
    if (e === 0n) {
      if (isZero(a)) throw new CalcError('math');
      return ONE;
    }
    if (isZero(a) && e < 0n) throw new CalcError('math');
    if (a.k === 's' && (e < 0n ? -e : e) <= 64n) {
      const p = a.s.pow(e);
      if (p) return norm(surd(p), () => toNumber(a) ** Number(e));
    }
    if (a.k === 'pi' && e === 1n) return a;
    return fl(toNumber(a) ** Number(e));
  }
  const q = asRational(b);
  const base = asRational(a);
  // Rationaler Exponent p/k mit exakter Wurzel der Basis
  if (q && base && q.den <= 64n) {
    const r = q.den === 2n && base.sign >= 0 ? Surd.sqrt(base) : undefined;
    if (r) {
      const p = r.pow(q.num);
      if (p) return norm(surd(p), () => toNumber(a) ** q.toNumber());
    }
    const k = rationalRoot(base, Number(q.den));
    if (k && (q.num < 0n ? -q.num : q.num) <= 64n) return pow(rat(k), rat(Rational.of(q.num)));
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (x < 0) {
    // Negative Basis nur mit ganzzahligem Exponenten oder ungeradem Nenner
    if (q && q.den % 2n === 1n) {
      const m = Math.abs(x) ** y;
      return fl(q.num % 2n === 0n ? m : -m);
    }
    throw new CalcError('math');
  }
  if (x === 0 && y <= 0) throw new CalcError('math');
  return fl(x ** y);
}

// --- Serialisierung für localStorage ---

export type SerializedValue =
  | { k: 's'; t: [string, string, string][] }
  | { k: 'pi'; n: string; d: string }
  | { k: 'f'; x: number };

export function serialize(v: Value): SerializedValue {
  switch (v.k) {
    case 's': return { k: 's', t: v.s.terms.map((t) => [t.coef.num.toString(), t.coef.den.toString(), t.rad.toString()]) };
    case 'pi': return { k: 'pi', n: v.q.num.toString(), d: v.q.den.toString() };
    case 'f': return { k: 'f', x: v.x };
  }
}

export function deserialize(d: SerializedValue | number | undefined): Value {
  try {
    if (d === undefined) return ZERO;
    if (typeof d === 'number') return fl(d);
    switch (d.k) {
      case 'f': return fl(d.x);
      case 'pi': return piTimes(Rational.of(BigInt(d.n), BigInt(d.d)));
      case 's': {
        let s = Surd.ZERO;
        for (const [n, den, radicand] of d.t) {
          const term = Surd.sqrt(Rational.of(BigInt(radicand)))?.mul(Surd.fromRational(Rational.of(BigInt(n), BigInt(den))));
          if (term) s = s.add(term);
        }
        return surd(s);
      }
    }
  } catch {
    return ZERO;
  }
}
