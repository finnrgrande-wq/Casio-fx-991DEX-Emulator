import { NumericError } from './errors';

export interface Cx {
  re: number;
  im: number;
}

const cabs = (z: Cx): number => Math.hypot(z.re, z.im);

/** Horner-Auswertung von p(z) und p'(z); Koeffizienten höchster Grad zuerst. */
function horner(c: number[], z: Cx): { p: Cx; dp: Cx } {
  let pr = c[0], pi = 0, dr = 0, di = 0;
  for (let i = 1; i < c.length; i++) {
    const ndr = dr * z.re - di * z.im + pr;
    const ndi = dr * z.im + di * z.re + pi;
    dr = ndr;
    di = ndi;
    const npr = pr * z.re - pi * z.im + c[i];
    const npi = pr * z.im + pi * z.re;
    pr = npr;
    pi = npi;
  }
  return { p: { re: pr, im: pi }, dp: { re: dr, im: di } };
}

function cdiv(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function derivCoeffs(c: number[]): number[] {
  const n = c.length - 1;
  return c.slice(0, n).map((v, i) => v * (n - i));
}

/** Betragssumme Σ|c_i||z|^k als Größenmaß für relative Prüfungen. */
function magnitude(c: number[], z: Cx): number {
  const r = cabs(z);
  let s = 0;
  for (const v of c) s = s * r + Math.abs(v);
  return s;
}

/** Aberth–Ehrlich-Iteration für alle Nullstellen eines Polynoms (Grad ≥ 1, c[0] ≠ 0). */
function aberth(c: number[]): Cx[] {
  const n = c.length - 1;
  const r0 = Math.pow(Math.abs(c[n] / c[0]), 1 / n);
  const z: Cx[] = [];
  for (let k = 0; k < n; k++) {
    const ang = 0.7 + (2 * Math.PI * k) / n;
    z.push({ re: r0 * Math.cos(ang), im: r0 * Math.sin(ang) });
  }
  for (let iter = 0; iter < 300; iter++) {
    let maxStep = 0;
    for (let k = 0; k < n; k++) {
      const { p, dp } = horner(c, z[k]);
      if (p.re === 0 && p.im === 0) continue;
      if (dp.re === 0 && dp.im === 0) {
        z[k] = { re: z[k].re + 1e-3 * r0, im: z[k].im + 1e-3 * r0 };
        maxStep = 1;
        continue;
      }
      const w = cdiv(p, dp);
      let sr = 0, si = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const dx = z[k].re - z[j].re;
        const dy = z[k].im - z[j].im;
        const dd = dx * dx + dy * dy;
        if (dd === 0) continue;
        sr += dx / dd;
        si -= dy / dd;
      }
      // corr = w / (1 - w*s)
      const den: Cx = { re: 1 - (w.re * sr - w.im * si), im: -(w.re * si + w.im * sr) };
      const corr = cdiv(w, den);
      z[k] = { re: z[k].re - corr.re, im: z[k].im - corr.im };
      maxStep = Math.max(maxStep, cabs(corr) / Math.max(1, cabs(z[k])));
    }
    if (maxStep < 1e-15) break;
  }
  return z;
}

/** Newton-Nachpolieren; nur Schritte, die |q| verkleinern, werden übernommen. */
function polish(c: number[], z0: Cx, iters = 20): Cx {
  let z = z0;
  let { p } = horner(c, z);
  for (let i = 0; i < iters; i++) {
    const h = horner(c, z);
    p = h.p;
    if (cabs(h.dp) === 0 || cabs(p) === 0) break;
    const st = cdiv(p, h.dp);
    const zn = { re: z.re - st.re, im: z.im - st.im };
    if (cabs(horner(c, zn).p) > cabs(p)) break;
    z = zn;
    if (cabs(st) <= 1e-16 * Math.max(1, cabs(z))) break;
  }
  return z;
}

/** Quadratische Gleichung a x² + b x + c (stabile Formel). */
function quadratic(a: number, b: number, c: number): Cx[] {
  let disc = b * b - 4 * a * c;
  // praktisch verschwindende Diskriminante -> doppelte Lösung
  if (Math.abs(disc) <= 4 * Number.EPSILON * Math.max(b * b, Math.abs(4 * a * c))) disc = 0;
  if (disc < 0) {
    const re = -b / (2 * a);
    const im = Math.sqrt(-disc) / (2 * Math.abs(a));
    return [{ re, im }, { re, im: -im }];
  }
  const sq = Math.sqrt(disc);
  const q = -(b + (b < 0 ? -sq : sq)) / 2;
  if (q === 0) return [{ re: 0, im: 0 }];
  const x1 = q / a;
  const x2 = c / q;
  return [{ re: x1, im: 0 }, { re: x2, im: 0 }];
}

/** Nullstellen eines reellen Polynoms vom Grad 2 bis 4 (höchster Koeffizient zuerst). */
export function polyRoots(coeffs: number[]): { re: number; im: number }[] {
  if (coeffs.length < 2 || coeffs.length > 5 || !coeffs.every(Number.isFinite) || coeffs[0] === 0) {
    throw new NumericError('math', 'Ungültiges Polynom');
  }
  // Nullstelle 0 abspalten (verschwindende letzte Koeffizienten)
  let c = coeffs.slice();
  let hasZero = false;
  while (c.length > 1 && c[c.length - 1] === 0) {
    c.pop();
    hasZero = true;
  }
  const lead = c[0];
  c = c.map((v) => v / lead);

  let raw: Cx[] = [];
  if (c.length === 2) {
    raw = [{ re: -c[1], im: 0 }];
  } else if (c.length === 3) {
    raw = quadratic(1, c[1], c[2]);
  } else if (c.length > 3) {
    raw = refine(c, aberth(c));
  }
  if (hasZero) raw.push({ re: 0, im: 0 });

  // Rundungsreste auf der Achse entfernen
  const snapped = raw.map((z) => {
    const sc = Math.max(1, cabs(z));
    let { re, im } = z;
    if (Math.abs(im) < 1e-12 * sc) im = 0;
    else if (Math.abs(re) < 1e-12 * sc) re = 0;
    return { re, im };
  });

  const same = (a: Cx, b: Cx): boolean => cabs({ re: a.re - b.re, im: a.im - b.im }) < 1e-8 * Math.max(1, cabs(a));
  const reals: Cx[] = [];
  const upper: Cx[] = []; // komplexe Wurzeln, auf positiven Imaginärteil gespiegelt
  for (const z of snapped) {
    const t = z.im === 0 ? { re: z.re, im: 0 } : { re: z.re, im: Math.abs(z.im) };
    const list = t.im === 0 ? reals : upper;
    if (!list.some((u) => same(u, t))) list.push(t);
  }
  reals.sort((a, b) => a.re - b.re);
  upper.sort((a, b) => a.re - b.re || a.im - b.im);
  const out: Cx[] = [...reals];
  for (const u of upper) out.push(u, { re: u.re, im: -u.im });
  return out;
}

/** Mehrfache Nullstellen erkennen (Cluster), alle Wurzeln nachpolieren. */
function refine(c: number[], roots: Cx[]): Cx[] {
  const n = roots.length;
  const label = roots.map((_, i) => i);
  const find = (i: number): number => (label[i] === i ? i : (label[i] = find(label[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cabs({ re: roots[i].re - roots[j].re, im: roots[i].im - roots[j].im });
      if (d < 1e-3 * Math.max(1, cabs(roots[i]))) label[find(j)] = find(i);
    }
  }
  const out: Cx[] = [];
  const done = new Set<number>();
  for (let i = 0; i < n; i++) {
    const g = find(i);
    if (done.has(g)) continue;
    done.add(g);
    const members = roots.filter((_, k) => find(k) === g);
    const m = members.length;
    if (m >= 2) {
      const cen: Cx = {
        re: members.reduce((s, z) => s + z.re, 0) / m,
        im: members.reduce((s, z) => s + z.im, 0) / m,
      };
      // Nullstelle der (m-1)-ten Ableitung ist m-fache Nullstelle von p
      let q = c;
      for (let k = 0; k < m - 1; k++) q = derivCoeffs(q);
      const r = polish(q, cen, 30);
      let ok = cabs({ re: r.re - cen.re, im: r.im - cen.im }) < 1e-2 * Math.max(1, cabs(cen));
      let dq = c;
      for (let k = 0; k < m && ok; k++) {
        const v = cabs(horner(dq, r).p);
        if (v > 1e-12 * magnitude(dq, r)) ok = false;
        dq = derivCoeffs(dq);
      }
      if (ok) {
        out.push(r);
        continue;
      }
    }
    for (const z of members) out.push(polish(c, z));
  }
  return out;
}
