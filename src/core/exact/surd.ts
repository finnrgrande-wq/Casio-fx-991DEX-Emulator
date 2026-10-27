// Exakte Wurzelausdrücke Σ cᵢ·√nᵢ mit rationalen Koeffizienten und quadratfreien Radikanden.

import { Rational, gcd } from './rational';

const PRIME_LIMIT = 100_000;
// Alle Primfaktoren des Restes sind > 1e5, also hat ein Rest < 1e15 höchstens zwei davon.
const COFACTOR_LIMIT = 10n ** 15n;

let primeCache: bigint[] | undefined;

function primes(): bigint[] {
  if (primeCache) return primeCache;
  const sieve = new Uint8Array(PRIME_LIMIT + 1);
  const out: bigint[] = [];
  for (let i = 2; i <= PRIME_LIMIT; i++) {
    if (sieve[i]) continue;
    out.push(BigInt(i));
    for (let j = i * i; j <= PRIME_LIMIT; j += i) sieve[j] = 1;
  }
  primeCache = out;
  return out;
}

/** Ganzzahlige Wurzel (floor) per Newton-Verfahren. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Quadratfreie Zerlegung n = outside² · inside; undefined, wenn n nicht schnell genug faktorisierbar ist. */
export function squarefree(n: bigint): { outside: bigint; inside: bigint } | undefined {
  if (n < 0n) throw new RangeError('n < 0');
  if (n === 0n) return { outside: 0n, inside: 1n };
  let m = n;
  let outside = 1n;
  let inside = 1n;
  let complete = true; // alle Primzahlen ≤ 1e5 abgearbeitet?
  for (const p of primes()) {
    // Alle Primfaktoren von m sind ≥ p: unter p³ bleiben höchstens zwei übrig.
    if (p * p * p > m) {
      complete = false;
      break;
    }
    if (m % p !== 0n) continue;
    let e = 0;
    do {
      m /= p;
      e++;
    } while (m % p === 0n);
    if (e >= 2) outside *= p ** BigInt(e >> 1);
    if (e & 1) inside *= p;
  }
  if (m > 1n) {
    // Rest ist eine Primzahl, p·q oder p²; nur ein Quadrat muss erkannt werden.
    if (complete && m >= COFACTOR_LIMIT) return undefined; // könnte p²·q enthalten
    const r = isqrt(m);
    if (r * r === m) outside *= r;
    else inside *= m;
  }
  return { outside, inside };
}

type Term = { coef: Rational; rad: bigint };

/** Terme zusammenfassen, Nullen entfernen, sortieren (rad 1 zuerst, dann aufsteigend). */
function normalize(map: Map<bigint, Rational>): Term[] {
  const out: Term[] = [];
  for (const [rad, coef] of map) if (!coef.isZero) out.push({ coef, rad });
  out.sort((a, b) => (a.rad < b.rad ? -1 : a.rad > b.rad ? 1 : 0));
  return out;
}

function addTo(map: Map<bigint, Rational>, rad: bigint, coef: Rational): void {
  const old = map.get(rad);
  map.set(rad, old ? old.add(coef) : coef);
}

const MAX_MUL_TERMS = 4;

export class Surd {
  readonly terms: ReadonlyArray<{ coef: Rational; rad: bigint }>;

  private constructor(terms: Term[]) {
    this.terms = terms;
  }

  static readonly ZERO = new Surd([]);
  static readonly ONE = new Surd([{ coef: Rational.ONE, rad: 1n }]);

  static fromRational(r: Rational): Surd {
    return r.isZero ? Surd.ZERO : new Surd([{ coef: r, rad: 1n }]);
  }

  /** √r für r ≥ 0: √(p/q) = √(p·q)/q. */
  static sqrt(r: Rational): Surd | undefined {
    if (r.sign < 0) return undefined;
    if (r.isZero) return Surd.ZERO;
    const sf = squarefree(r.num * r.den);
    if (!sf) return undefined;
    return new Surd([{ coef: Rational.of(sf.outside, r.den), rad: sf.inside }]);
  }

  private static single(coef: Rational, rad: bigint): Surd {
    return coef.isZero ? Surd.ZERO : new Surd([{ coef, rad }]);
  }

  get isRational(): boolean {
    return this.terms.length === 0 || (this.terms.length === 1 && this.terms[0].rad === 1n);
  }

  toRational(): Rational | undefined {
    if (this.terms.length === 0) return Rational.ZERO;
    if (this.terms.length === 1 && this.terms[0].rad === 1n) return this.terms[0].coef;
    return undefined;
  }

  toNumber(): number {
    let sum = 0;
    for (const t of this.terms) sum += t.coef.toNumber() * (t.rad === 1n ? 1 : Math.sqrt(Number(t.rad)));
    return sum;
  }

  neg(): Surd {
    return new Surd(this.terms.map((t) => ({ coef: t.coef.neg(), rad: t.rad })));
  }

  add(o: Surd): Surd {
    const map = new Map<bigint, Rational>();
    for (const t of this.terms) addTo(map, t.rad, t.coef);
    for (const t of o.terms) addTo(map, t.rad, t.coef);
    return new Surd(normalize(map));
  }

  sub(o: Surd): Surd {
    return this.add(o.neg());
  }

  mul(o: Surd): Surd | undefined {
    const map = new Map<bigint, Rational>();
    for (const a of this.terms) {
      for (const b of o.terms) {
        // Beide Radikanden quadratfrei: ra·rb = g²·(ra/g)·(rb/g), der Rest ist quadratfrei.
        const g = gcd(a.rad, b.rad);
        addTo(map, (a.rad / g) * (b.rad / g), a.coef.mul(b.coef).mul(Rational.of(g)));
      }
    }
    const terms = normalize(map);
    return terms.length > MAX_MUL_TERMS ? undefined : new Surd(terms);
  }

  div(o: Surd): Surd | undefined {
    const n = o.terms.length;
    if (n === 0) throw new RangeError('Division durch 0');
    if (n === 1) {
      const t = o.terms[0];
      if (t.rad === 1n) return new Surd(this.terms.map((x) => ({ coef: x.coef.div(t.coef), rad: x.rad })));
      // 1/(c·√r) = √r/(c·r)
      return this.mul(Surd.single(Rational.of(1n).div(t.coef.mul(Rational.of(t.rad))), t.rad));
    }
    if (n === 2) {
      // Konjugierte t1 − t2: (t1 + t2)(t1 − t2) = t1² − t2² ist rational und ≠ 0.
      const [t1, t2] = o.terms;
      const conj = new Surd([t1, { coef: t2.coef.neg(), rad: t2.rad }]);
      const den = t1.coef.mul(t1.coef).mul(Rational.of(t1.rad)).sub(t2.coef.mul(t2.coef).mul(Rational.of(t2.rad)));
      const num = this.mul(conj);
      return num?.div(Surd.fromRational(den));
    }
    return undefined;
  }

  /** Ganzzahlige Potenz |e| ≤ 64. */
  pow(e: bigint): Surd | undefined {
    if (e > 64n || e < -64n) return undefined;
    if (e < 0n) {
      const p = this.pow(-e);
      return p ? Surd.ONE.div(p) : undefined;
    }
    let result: Surd = Surd.ONE;
    let base: Surd = this;
    for (let k = e; k > 0n; k >>= 1n) {
      if (k & 1n) {
        const r = result.mul(base);
        if (!r) return undefined;
        result = r;
      }
      if (k > 1n) {
        const b = base.mul(base);
        if (!b) return undefined;
        base = b;
      }
    }
    return result;
  }

  equals(o: Surd): boolean {
    if (this.terms.length !== o.terms.length) return false;
    return this.terms.every((t, i) => t.rad === o.terms[i].rad && t.coef.equals(o.terms[i].coef));
  }

  /** Exaktes Vorzeichen. */
  sign(): -1 | 0 | 1 {
    const t = this.terms;
    if (t.length === 0) return 0;
    if (t.length === 1) return t[0].coef.sign;
    if (t.length === 2) {
      const s1 = t[0].coef.sign;
      const s2 = t[1].coef.sign;
      if (s1 === s2) return s1;
      // Gegensätzliche Vorzeichen: Beträge über die Quadrate vergleichen.
      const q1 = t[0].coef.mul(t[0].coef).mul(Rational.of(t[0].rad));
      const q2 = t[1].coef.mul(t[1].coef).mul(Rational.of(t[1].rad));
      const c = q1.cmp(q2);
      return c === 0 ? 0 : c > 0 ? s1 : s2;
    }
    return this.signByPrecision();
  }

  /** Vorzeichen für ≥ 3 Terme über Festkomma-Näherung mit wachsender Genauigkeit (Wert ist nie 0). */
  private signByPrecision(): -1 | 0 | 1 {
    for (let digits = 20; digits <= 2560; digits *= 2) {
      const scale = 10n ** BigInt(digits);
      let total = Rational.ZERO;
      let err = Rational.ZERO;
      for (const x of this.terms) {
        const root = isqrt(x.rad * scale * scale);
        total = total.add(x.coef.mul(Rational.of(root, scale)));
        err = err.add(x.coef.abs().mul(Rational.of(1n, scale)));
      }
      if (total.abs().cmp(err) > 0) return total.sign;
    }
    const v = this.toNumber();
    return v < 0 ? -1 : v > 0 ? 1 : 0;
  }
}

/**
 * Anzeigeform (Σ aᵢ·√bᵢ)/c wie beim Original; undefined, wenn die Grenzen (≤ 2 Terme, |a| < 100,
 * b < 1000, c < 100) verletzt sind oder der Wert rational ist. Ganzzahlterm zuerst, dann Radikanden absteigend.
 */
export function surdDisplayForm(s: Surd): { terms: { a: bigint; b: bigint }[]; c: bigint } | undefined {
  const t = s.terms;
  if (t.length === 0 || t.length > 2 || t.every((x) => x.rad === 1n)) return undefined;
  let c = 1n;
  for (const x of t) c = (c / gcd(c, x.coef.den)) * x.coef.den;
  if (c >= 100n) return undefined;
  const terms = t.map((x) => ({ a: (x.coef.num * c) / x.coef.den, b: x.rad }));
  for (const x of terms) {
    const abs = x.a < 0n ? -x.a : x.a;
    if (abs < 1n || abs >= 100n) return undefined;
    if (x.b !== 1n && x.b >= 1000n) return undefined;
  }
  const rational = terms.filter((x) => x.b === 1n);
  const surds = terms.filter((x) => x.b !== 1n).sort((x, y) => (x.b < y.b ? 1 : x.b > y.b ? -1 : 0));
  return { terms: [...rational, ...surds], c };
}
