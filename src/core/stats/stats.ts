// Statistik-Modus: Einzel-/Zweivariablen-Kennwerte, Regressionen, Normalverteilung.
// Reine Funktionen auf float64, keine DOM-Abhängigkeit.

export type RegType = 'lin' | 'quad' | 'log' | 'expE' | 'expAB' | 'pow' | 'inv';
// lin: y=a+bx, quad: y=a+bx+cx², log: y=a+b·ln(x), expE: y=a·e^(bx), expAB: y=a·b^x, pow: y=a·x^b, inv: y=a+b/x

export interface OneVar {
  n: number; mean: number; sumX: number; sumX2: number;
  varPop: number; sdPop: number; varSample: number; sdSample: number;
  min: number; q1: number; median: number; q3: number; max: number;
}

export interface TwoVar {
  n: number; meanX: number; meanY: number;
  sumX: number; sumX2: number; sumY: number; sumY2: number; sumXY: number;
  sumX3: number; sumX2Y: number; sumX4: number;
  varPopX: number; sdPopX: number; varSampleX: number; sdSampleX: number;
  varPopY: number; sdPopY: number; varSampleY: number; sdSampleY: number;
  minX: number; maxX: number; minY: number; maxY: number;
}

export interface Regression { type: RegType; a: number; b: number; c?: number; r?: number }

export class StatError extends Error {
  constructor(readonly kind: 'math' | 'dimension') {
    super(kind === 'math' ? 'Mathem. Fehler' : 'Dimensionsfehler');
  }
}

const mathErr = (): never => { throw new StatError('math'); };

/** Prüft Längen und Häufigkeiten; liefert nur Zeilen mit Häufigkeit > 0. */
function rows(x: number[], y: number[] | undefined, freq: number[] | undefined): { x: number; y: number; f: number }[] {
  if (y && y.length !== x.length) throw new StatError('dimension');
  if (freq && freq.length !== x.length) throw new StatError('dimension');
  const out: { x: number; y: number; f: number }[] = [];
  for (let i = 0; i < x.length; i++) {
    const f = freq ? freq[i] : 1;
    if (!Number.isFinite(f) || f < 0) mathErr();
    if (f === 0) continue;
    out.push({ x: x[i], y: y ? y[i] : 0, f });
  }
  return out;
}

type Seg = { v: number; w: number };

/** Gewichteter Median einer nach Wert sortierten Segmentliste (Gesamtgewicht total). */
function segMedian(segs: Seg[], total: number): number {
  const target = total / 2;
  const eps = 1e-12 * Math.max(1, total);
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    cum += segs[i].w;
    if (cum >= target - eps) {
      if (Math.abs(cum - target) <= eps && i + 1 < segs.length) return (segs[i].v + segs[i + 1].v) / 2;
      return segs[i].v;
    }
  }
  return segs[segs.length - 1].v;
}

/** Die ersten m Gewichtseinheiten der Segmentliste. */
function takeFirst(segs: Seg[], m: number): Seg[] {
  const out: Seg[] = [];
  let left = m;
  for (const s of segs) {
    if (left <= 0) break;
    const w = Math.min(s.w, left);
    out.push({ v: s.v, w });
    left -= w;
  }
  return out;
}

export function oneVar(x: number[], freq?: number[]): OneVar {
  const r = rows(x, undefined, freq);
  let n = 0, sumX = 0, sumX2 = 0;
  for (const e of r) { n += e.f; sumX += e.f * e.x; sumX2 += e.f * e.x * e.x; }
  if (r.length === 0 || n <= 0) return mathErr();
  const mean = sumX / n;
  let ss = 0;
  for (const e of r) ss += e.f * (e.x - mean) ** 2;
  const varPop = ss / n;
  const varSample = n > 1 ? ss / (n - 1) : NaN;

  // gleiche Werte zusammenfassen, sortieren
  const sorted = [...r].sort((p, q) => p.x - q.x);
  const segs: Seg[] = [];
  for (const e of sorted) {
    const last = segs[segs.length - 1];
    if (last && last.v === e.x) last.w += e.f;
    else segs.push({ v: e.x, w: e.f });
  }
  const median = segMedian(segs, n);
  // Hälften: bei ungeradem n ohne Median, je floor(n/2) Einheiten
  const h = Math.floor(n / 2);
  let q1 = median, q3 = median;
  if (h > 0) {
    q1 = segMedian(takeFirst(segs, h), h);
    q3 = segMedian(takeFirst([...segs].reverse(), h).reverse(), h);
  }
  return {
    n, mean, sumX, sumX2, varPop, sdPop: Math.sqrt(varPop), varSample, sdSample: Math.sqrt(varSample),
    min: segs[0].v, q1, median, q3, max: segs[segs.length - 1].v,
  };
}

export function twoVar(x: number[], y: number[], freq?: number[]): TwoVar {
  const r = rows(x, y, freq);
  let n = 0, sx = 0, sx2 = 0, sy = 0, sy2 = 0, sxy = 0, sx3 = 0, sx2y = 0, sx4 = 0;
  for (const e of r) {
    const f = e.f, xx = e.x * e.x;
    n += f; sx += f * e.x; sx2 += f * xx; sy += f * e.y; sy2 += f * e.y * e.y;
    sxy += f * e.x * e.y; sx3 += f * xx * e.x; sx2y += f * xx * e.y; sx4 += f * xx * xx;
  }
  if (r.length === 0 || n <= 0) return mathErr();
  const meanX = sx / n, meanY = sy / n;
  let ssx = 0, ssy = 0;
  for (const e of r) { ssx += e.f * (e.x - meanX) ** 2; ssy += e.f * (e.y - meanY) ** 2; }
  const vpx = ssx / n, vpy = ssy / n;
  const vsx = n > 1 ? ssx / (n - 1) : NaN, vsy = n > 1 ? ssy / (n - 1) : NaN;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const e of r) {
    if (e.x < minX) minX = e.x;
    if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y;
    if (e.y > maxY) maxY = e.y;
  }
  return {
    n, meanX, meanY, sumX: sx, sumX2: sx2, sumY: sy, sumY2: sy2, sumXY: sxy, sumX3: sx3, sumX2Y: sx2y, sumX4: sx4,
    varPopX: vpx, sdPopX: Math.sqrt(vpx), varSampleX: vsx, sdSampleX: Math.sqrt(vsx),
    varPopY: vpy, sdPopY: Math.sqrt(vpy), varSampleY: vsy, sdSampleY: Math.sqrt(vsy),
    minX, maxX, minY, maxY,
  };
}

/** Gewichtete Ausgleichsgerade v = A + B·u; r ist NaN bei konstantem v. */
function linFit(pts: { u: number; v: number; f: number }[]): { A: number; B: number; r: number } {
  let n = 0, su = 0, sv = 0;
  for (const p of pts) { n += p.f; su += p.f * p.u; sv += p.f * p.v; }
  if (n < 2) return mathErr();
  const mu = su / n, mv = sv / n;
  let suu = 0, svv = 0, suv = 0;
  for (const p of pts) {
    const du = p.u - mu, dv = p.v - mv;
    suu += p.f * du * du; svv += p.f * dv * dv; suv += p.f * du * dv;
  }
  if (!(suu > 0)) return mathErr();
  const B = suv / suu;
  return { A: mv - B * mu, B, r: svv > 0 ? suv / Math.sqrt(suu * svv) : NaN };
}

/** Löst das 3x3-System M·z = v (Gauß mit Spaltenpivot). */
function solve3(M: number[][], v: number[]): number[] {
  const a = M.map((row, i) => [...row, v[i]]);
  let scale = 0;
  for (const row of M) for (const e of row) scale = Math.max(scale, Math.abs(e));
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i;
    if (!(Math.abs(a[p][c]) > 1e-13 * scale)) return mathErr();
    [a[c], a[p]] = [a[p], a[c]];
    for (let i = c + 1; i < 3; i++) {
      const k = a[i][c] / a[c][c];
      for (let j = c; j < 4; j++) a[i][j] -= k * a[c][j];
    }
  }
  const z = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = a[i][3];
    for (let j = i + 1; j < 3; j++) s -= a[i][j] * z[j];
    z[i] = s / a[i][i];
  }
  return z;
}

function quadFit(r: { x: number; y: number; f: number }[], n: number): Regression {
  if (new Set(r.map((e) => e.x)).size < 3) return mathErr();
  let sx = 0;
  for (const e of r) sx += e.f * e.x;
  const m = sx / n; // Zentrieren verbessert die Kondition
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const e of r) {
    const u = e.x - m, u2 = u * u;
    s1 += e.f * u; s2 += e.f * u2; s3 += e.f * u2 * u; s4 += e.f * u2 * u2;
    t0 += e.f * e.y; t1 += e.f * u * e.y; t2 += e.f * u2 * e.y;
  }
  const [A, B, C] = solve3([[n, s1, s2], [s1, s2, s3], [s2, s3, s4]], [t0, t1, t2]);
  // y = A + B(x−m) + C(x−m)²
  const out: Regression = { type: 'quad', a: A - B * m + C * m * m, b: B - 2 * C * m, c: C };
  if (![out.a, out.b, C].every(Number.isFinite)) return mathErr();
  return out;
}

export function regression(type: RegType, x: number[], y: number[], freq?: number[]): Regression {
  const r = rows(x, y, freq);
  let n = 0;
  for (const e of r) n += e.f;
  if (n < 2) return mathErr();
  if (type === 'quad') {
    if (n < 3) return mathErr();
    return quadFit(r, n);
  }
  const needLnX = type === 'log' || type === 'pow';
  const needLnY = type === 'expE' || type === 'expAB' || type === 'pow';
  const pts = r.map((e) => {
    if (needLnX && !(e.x > 0)) return mathErr();
    if (needLnY && !(e.y > 0)) return mathErr();
    if (type === 'inv' && e.x === 0) return mathErr();
    const u = type === 'inv' ? 1 / e.x : needLnX ? Math.log(e.x) : e.x;
    const v = needLnY ? Math.log(e.y) : e.y;
    return { u, v, f: e.f };
  });
  const { A, B, r: corr } = linFit(pts);
  switch (type) {
    case 'lin': case 'log': case 'inv': return { type, a: A, b: B, r: corr };
    case 'expE': case 'pow': return { type, a: Math.exp(A), b: B, r: corr };
    default: return { type, a: Math.exp(A), b: Math.exp(B), r: corr }; // expAB
  }
}

/** Schätzwert ŷ zu x. */
export function estimateY(reg: Regression, x: number): number {
  const { a, b } = reg;
  let v: number;
  switch (reg.type) {
    case 'lin': v = a + b * x; break;
    case 'quad': v = a + b * x + (reg.c ?? 0) * x * x; break;
    case 'log': if (!(x > 0)) return mathErr(); v = a + b * Math.log(x); break;
    case 'expE': v = a * Math.exp(b * x); break;
    case 'expAB': v = a * Math.pow(b, x); break;
    case 'pow': if (!(x > 0)) return mathErr(); v = a * Math.pow(x, b); break;
    case 'inv': if (x === 0) return mathErr(); v = a + b / x; break;
  }
  return Number.isFinite(v) ? v : mathErr();
}

/** Schätzwert x̂ zu y; bei quad zwei Werte [x̂1 (−√), x̂2 (+√)]. */
export function estimateX(reg: Regression, y: number): number[] {
  const { a, b } = reg;
  let v: number;
  switch (reg.type) {
    case 'lin': if (b === 0) return mathErr(); v = (y - a) / b; break;
    case 'quad': {
      const c = reg.c ?? 0;
      const d = b * b - 4 * c * (a - y);
      if (c === 0 || d < 0) return mathErr();
      const s = Math.sqrt(d);
      return [(-b - s) / (2 * c), (-b + s) / (2 * c)];
    }
    case 'log': if (b === 0) return mathErr(); v = Math.exp((y - a) / b); break;
    case 'expE': if (b === 0 || !(y / a > 0)) return mathErr(); v = Math.log(y / a) / b; break;
    case 'expAB': {
      const lb = Math.log(b);
      if (lb === 0 || !(y / a > 0)) return mathErr();
      v = Math.log(y / a) / lb;
      break;
    }
    case 'pow':
      if (b === 0 || !(y / a > 0)) return mathErr();
      v = Math.pow(y / a, 1 / b);
      break;
    case 'inv': if (y === a) return mathErr(); v = b / (y - a); break;
  }
  return Number.isFinite(v) ? [v] : mathErr();
}

// ---- Normalverteilung ----

/** erf für x ≥ 0 per Reihe mit positiven Termen (keine Auslöschung). */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x, sum = x;
  for (let k = 1; k < 500; k++) {
    term *= (2 * x2) / (2 * k + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return (2 / Math.sqrt(Math.PI)) * Math.exp(-x2) * sum;
}

/** erfc für x ≥ 0. */
function erfcPos(x: number): number {
  if (x < 2) return 1 - erfSeries(x);
  if (x > 27) return 0;
  // Kettenbruch, rückwärts ausgewertet
  let t = x;
  for (let k = 200; k >= 1; k--) t = x + k / 2 / t;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * t);
}

/** Standardisierte Zufallsvariable t = (x − x̄)/σx. */
export function standardize(x: number, s: OneVar): number {
  if (!(s.sdPop > 0)) return mathErr();
  return (x - s.mean) / s.sdPop;
}

/** P(t) = Φ(t). */
export function normalP(t: number): number {
  return t >= 0 ? 1 - 0.5 * erfcPos(t / Math.SQRT2) : 0.5 * erfcPos(-t / Math.SQRT2);
}

/** Q(t) = Φ(t) − 0,5 (Fläche zwischen 0 und t, mit Vorzeichen von t). */
export function normalQ(t: number): number {
  const a = Math.abs(t) / Math.SQRT2;
  const q = a < 2 ? 0.5 * erfSeries(a) : 0.5 - 0.5 * erfcPos(a);
  return t < 0 ? -q : q;
}

/** R(t) = 1 − Φ(t). */
export function normalR(t: number): number {
  return t >= 0 ? 0.5 * erfcPos(t / Math.SQRT2) : 1 - 0.5 * erfcPos(-t / Math.SQRT2);
}
