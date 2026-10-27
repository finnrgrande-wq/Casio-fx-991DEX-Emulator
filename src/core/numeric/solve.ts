import { NumericError } from './errors';

export interface SolveResult {
  x: number;
  lr: number;
  converged: boolean;
}

const fin = Number.isFinite;

/** Zentrale Differenz mit Richardson (O(h^4)); bei Definitionslücken kleinere Schritte, sonst NaN. */
function slope(f: (x: number) => number, x: number): number {
  let h = 1e-5 * Math.max(Math.abs(x), 1e-2);
  for (let k = 0; k < 6; k++, h /= 10) {
    const d1 = (f(x + h) - f(x - h)) / (2 * h);
    const d2 = (f(x + h / 2) - f(x - h / 2)) / h;
    if (fin(d1) && fin(d2)) return (4 * d2 - d1) / 3;
  }
  return NaN;
}

/** Brent-Verfahren auf einem Vorzeichenwechsel [a,b]. */
function brent(f: (x: number) => number, a0: number, b0: number, fa0: number, fb0: number): number {
  let a = a0, b = b0, fa = fa0, fb = fb0;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < 300; i++) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      c = a; fc = fa; d = b - a; e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a; fa = fb; fb = fc; fc = fa;
    }
    const tol = 2 * Number.EPSILON * Math.abs(b) + 1e-15;
    const m = (c - b) / 2;
    if (Math.abs(m) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number, q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b);
    if (!fin(fb)) return b; // sollte bei sauberem Bracket nicht vorkommen
  }
  return b;
}

/** Löst f(x)=0 (Newton mit numerischer Ableitung, dann Sekante, dann Bracket+Brent). */
export function solve(f: (x: number) => number, x0: number, opts?: { maxIter?: number }): SolveResult {
  const maxIter = opts?.maxIter ?? 100;
  if (!fin(x0)) throw new NumericError('noSolution');

  // Bestes bisher gefundenes (|f| minimal) für den Fall ohne Konvergenz
  let bestX = x0;
  let bestF = Infinity;
  const ev = (x: number): number => {
    const y = f(x);
    if (fin(y) && Math.abs(y) < bestF) {
      bestF = Math.abs(y);
      bestX = x;
    }
    return y;
  };

  // Startpunkt mit endlichem Funktionswert suchen (nach außen wachsende Versätze)
  let xs = x0;
  let fs = ev(xs);
  if (!fin(fs)) {
    const s0 = 1e-4 * Math.max(1, Math.abs(x0));
    let found = false;
    for (let k = 0; k < 60 && !found; k++) {
      const s = s0 * Math.pow(2, k);
      for (const sg of [1, -1]) {
        const x = x0 + sg * s;
        const y = ev(x);
        if (fin(y)) {
          xs = x;
          fs = y;
          found = true;
          break;
        }
      }
    }
    if (!found) throw new NumericError('noSolution', 'f nirgends definiert');
  }
  const f0 = Math.abs(fs);
  const accept = (x: number): SolveResult | null => {
    const y = f(x);
    // Plausibilität: Restfehler muss klein gegenüber dem Start sein (verwirft Polstellen)
    if (fin(y) && Math.abs(y) <= 1e-6 * Math.max(1, f0)) return { x, lr: y, converged: true };
    return null;
  };
  if (fs === 0) return { x: xs, lr: 0, converged: true };

  // 1) Newton mit Rückverfolgung
  {
    let x = xs;
    let fx = fs;
    let ok = false;
    for (let it = 0; it < maxIter; it++) {
      if (fx === 0) { ok = true; break; }
      const scale = Math.max(1, Math.abs(x));
      const d = slope(f, x);
      if (!fin(d) || d === 0) break;
      const step = -fx / d;
      if (!fin(step) || Math.abs(step) > 1e3 * scale) break;
      if (Math.abs(step) <= 1e-12 * scale) { x += step; ok = true; break; }
      let t = 1;
      let acc = false;
      let xn = x;
      let fn = fx;
      for (let k = 0; k < 30; k++, t /= 2) {
        xn = x + t * step;
        fn = ev(xn);
        if (fin(fn) && Math.abs(fn) <= Math.abs(fx)) { acc = true; break; }
      }
      if (!acc) {
        // Rauschgrenze erreicht -> als konvergiert werten
        if (Math.abs(step) <= 1e-9 * scale) ok = true;
        break;
      }
      const moved = Math.abs(xn - x);
      x = xn;
      fx = fn;
      if (moved <= 1e-12 * Math.max(1, Math.abs(x))) { ok = true; break; }
    }
    if (ok) {
      const r = accept(x);
      if (r) return r;
    }
  }

  // 2) Sekantenverfahren
  {
    let xa = xs;
    let fa = fs;
    let xb = xs + 1e-3 * Math.max(1, Math.abs(xs));
    let fb = ev(xb);
    for (let it = 0; it < maxIter && fin(fb); it++) {
      if (fb === 0) {
        const r = accept(xb);
        if (r) return r;
        break;
      }
      const den = fb - fa;
      if (den === 0) break;
      const xn = xb - (fb * (xb - xa)) / den;
      if (!fin(xn)) break;
      xa = xb;
      fa = fb;
      xb = xn;
      fb = ev(xb);
      if (Math.abs(xb - xa) <= 1e-12 * Math.max(1, Math.abs(xb))) {
        const r = accept(xb);
        if (r) return r;
        break;
      }
    }
  }

  // 3) Bracket-Suche (geometrisch nach außen, beidseitig abwechselnd) + Brent
  {
    const s0 = 1e-2 * Math.max(1, Math.abs(xs));
    let pr = xs, fpr = fs; // letzter Punkt rechts
    let pl = xs, fpl = fs; // letzter Punkt links
    for (let k = 0; k < 120; k++) {
      const s = s0 * Math.pow(2, k);
      const xr = xs + s;
      const xl = xs - s;
      const fr = ev(xr);
      const fl = ev(xl);
      const cand: [number, number, number, number][] = [];
      if (fin(fr) && fin(fpr) && Math.sign(fr) * Math.sign(fpr) <= 0) cand.push([pr, xr, fpr, fr]);
      if (fin(fl) && fin(fpl) && Math.sign(fl) * Math.sign(fpl) <= 0) cand.push([xl, pl, fl, fpl]);
      if (cand.length > 0) {
        const [a, b, fa, fb] = cand[0];
        const root = fa === 0 ? a : fb === 0 ? b : brent(f, a, b, fa, fb);
        const r = accept(root);
        if (r) return r;
      }
      pr = xr; fpr = fr;
      pl = xl; fpl = fl;
    }
  }

  return { x: bestX, lr: fin(bestF) ? f(bestX) : NaN, converged: false };
}
