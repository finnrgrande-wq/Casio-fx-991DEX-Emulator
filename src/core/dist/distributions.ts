// Verteilungsfunktionen (Modus Verteilungen): Normal-, Binomial- und Poisson-Verteilung.
// Reine Funktionen in float64; Genauigkeit deutlich besser als die 6 Stellen des Originals.

export class DistError extends Error {
  constructor(readonly kind: 'math' | 'argument') {
    super(kind === 'math' ? 'Mathem. Fehler' : 'Argumentfehler');
    this.name = 'DistError';
  }
}

const SQRT2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const SQRT_PI = Math.sqrt(Math.PI);
const EPS = 2.220446049250313e-16;

const fail = (): never => {
  throw new DistError('math');
};

// ---------------------------------------------------------------- erfc

/** erf(x) für 0 ≤ x < 1,5: Reihe mit ausschließlich positiven Termen. */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * EPS * 0.1) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc(x) für x ≥ 1,5: Kettenbruch (modifizierter Lentz), keine Auslöschung. */
function erfcFraction(x: number): number {
  if (x > 27) return 0; // darüber Unterlauf
  const tiny = 1e-300;
  // erfc(x) = exp(-x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + …))))
  let f = x;
  let c = x;
  let d = 0;
  for (let n = 1; n < 2000; n++) {
    const a = n / 2;
    d = x + a * d;
    d = d === 0 ? tiny : d;
    c = x + a / c;
    c = c === 0 ? tiny : c;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** Komplementäre Fehlerfunktion, relativ genau auch im Schwanz. */
function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 1.5) return 1 - erfSeries(x);
  return erfcFraction(x);
}

/** Untere Standardnormal-Wahrscheinlichkeit Φ(z). */
function phiLower(z: number): number {
  return 0.5 * erfc(-z / SQRT2);
}

/** Obere Standardnormal-Wahrscheinlichkeit 1 − Φ(z). */
function phiUpper(z: number): number {
  return 0.5 * erfc(z / SQRT2);
}

// ---------------------------------------------------------------- Normalverteilung

function checkSigma(sigma: number, mu: number): void {
  if (!(sigma > 0) || !Number.isFinite(sigma) || Number.isNaN(mu)) fail();
}

export function normalPdf(x: number, sigma: number, mu: number): number {
  checkSigma(sigma, mu);
  if (Number.isNaN(x)) fail();
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * SQRT_2PI);
}

/** P(lower ≤ X ≤ upper); Schwänze werden ohne Auslöschung berechnet. */
export function normalCdf(lower: number, upper: number, sigma: number, mu: number): number {
  checkSigma(sigma, mu);
  if (Number.isNaN(lower) || Number.isNaN(upper) || lower > upper) fail();
  const a = (lower - mu) / sigma;
  const b = (upper - mu) / sigma;
  let p: number;
  if (a >= 0) p = phiUpper(a) - phiUpper(b);
  else if (b <= 0) p = phiLower(b) - phiLower(a);
  else p = 1 - phiLower(a) - phiUpper(b);
  return Math.min(1, Math.max(0, p));
}

// Acklam-Koeffizienten
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** Standardnormal-Quantil für 0 < p ≤ 0,5 (linker Schwanz), mit Halley-Verfeinerung. */
function quantileLow(p: number): number {
  let x: number;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
      (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  }
  for (let i = 0; i < 3; i++) {
    const e = phiLower(x) - p;
    const u = e * SQRT_2PI * Math.exp(0.5 * x * x);
    if (!Number.isFinite(u)) break;
    x -= u / (1 + 0.5 * x * u);
  }
  return x;
}

/** Linksseitiges Quantil: x mit P(X ≤ x) = area. */
export function inverseNormal(area: number, sigma: number, mu: number): number {
  checkSigma(sigma, mu);
  if (!(area > 0 && area < 1)) fail();
  const z = area <= 0.5 ? quantileLow(area) : -quantileLow(1 - area);
  return mu + sigma * z;
}

// ---------------------------------------------------------------- Hilfen für Binomial/Poisson

/** Fehler der Stirling-Näherung: ln(n!) − ((n+½)ln n − n + ½ln 2π), n ≥ 1 ganzzahlig. */
function stirlerr(n: number): number {
  if (n <= 15) {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    if (n === 0) return Infinity;
    return Math.log(f) - (n + 0.5) * Math.log(n) + n - Math.log(SQRT_2PI);
  }
  const n2 = n * n;
  return (1 / 12 - (1 / 360 - (1 / 1260 - (1 / 1680 - 1 / (1188 * n2)) / n2) / n2) / n2) / n;
}

/** Abweichung x·ln(x/np) + np − x, auch für x ≈ np ohne Auslöschung (Loader). */
function bd0(x: number, np: number): number {
  if (Math.abs(x - np) < 0.1 * (x + np)) {
    let v = (x - np) / (x + np);
    let s = (x - np) * v;
    if (Math.abs(s) < 1e-300) return s;
    let ej = 2 * x * v;
    v *= v;
    for (let j = 1; j < 1000; j++) {
      ej *= v;
      const s1 = s + ej / (2 * j + 1);
      if (s1 === s) return s1;
      s = s1;
    }
    return s;
  }
  return x * Math.log(x / np) + np - x;
}

function isInt(v: number): boolean {
  return Number.isFinite(v) && Math.floor(v) === v;
}

function checkBinom(n: number, p: number): void {
  if (!isInt(n) || n < 0 || !(p >= 0 && p <= 1)) fail();
}

function checkK(k: number): void {
  if (!isInt(k) || k < 0) fail();
}

/** Binomialdichte ohne Parameterprüfung (0 ≤ k ≤ n, 0 < p < 1). */
function dbinomRaw(k: number, n: number, p: number): number {
  const q = 1 - p;
  if (k === 0) return Math.exp(n * Math.log1p(-p));
  if (k === n) return Math.exp(n * Math.log(p));
  const lc = stirlerr(n) - stirlerr(k) - stirlerr(n - k) - bd0(k, n * p) - bd0(n - k, n * q);
  return Math.exp(lc) * Math.sqrt(n / (2 * Math.PI * k * (n - k)));
}

/** Poissondichte ohne Parameterprüfung (k ≥ 0, μ > 0). */
function dpoisRaw(k: number, mu: number): number {
  if (k === 0) return Math.exp(-mu);
  return Math.exp(-stirlerr(k) - bd0(k, mu)) / Math.sqrt(2 * Math.PI * k);
}

// ---------------------------------------------------------------- Binomialverteilung

export function binomialPdf(k: number, n: number, p: number): number {
  checkBinom(n, p);
  if (!isInt(k) || k < 0 || k > n) fail();
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return dbinomRaw(k, n, p);
}

/** P(X ≤ k); Summation stets vom Wert weg in Richtung abnehmender Terme. */
export function binomialCdf(k: number, n: number, p: number): number {
  checkBinom(n, p);
  if (!isInt(k) || k < 0 || k > n) fail();
  if (k === n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  const q = 1 - p;
  if (k < n * p) {
    // unterer Schwanz: von k abwärts
    let term = dbinomRaw(k, n, p);
    let sum = term;
    for (let j = k; j > 0; j--) {
      term *= (j / (n - j + 1)) * (q / p);
      sum += term;
      if (term < sum * 1e-18) break;
    }
    return Math.min(1, sum);
  }
  // oberer Schwanz: von k+1 aufwärts, dann Komplement
  let term = dbinomRaw(k + 1, n, p);
  let sum = term;
  for (let j = k + 1; j < n; j++) {
    term *= ((n - j) / (j + 1)) * (p / q);
    sum += term;
    if (term < sum * 1e-18) break;
  }
  return Math.max(0, 1 - sum);
}

// ---------------------------------------------------------------- Poissonverteilung

function checkMu(mu: number): void {
  if (!(mu > 0) || !Number.isFinite(mu)) fail();
}

export function poissonPdf(k: number, mu: number): number {
  checkMu(mu);
  checkK(k);
  return dpoisRaw(k, mu);
}

/** P(X ≤ k). */
export function poissonCdf(k: number, mu: number): number {
  checkMu(mu);
  checkK(k);
  if (k < mu) {
    let term = dpoisRaw(k, mu);
    let sum = term;
    for (let j = k; j > 0; j--) {
      term *= j / mu;
      sum += term;
      if (term < sum * 1e-18) break;
    }
    return Math.min(1, sum);
  }
  let term = dpoisRaw(k + 1, mu);
  let sum = term;
  for (let j = k + 1; ; j++) {
    term *= mu / (j + 1);
    sum += term;
    if (term < sum * 1e-18 || term === 0) break;
  }
  return Math.max(0, 1 - sum);
}
