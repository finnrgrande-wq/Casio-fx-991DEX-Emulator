import { NumericError } from './errors';

// Gauss–Kronrod G7/K15 (Knoten und Gewichte nach QUADPACK).
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.58608723546769113029414483825873, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0,
];
const WGK = [
  0.02293532201052922496373200805897, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
// Gauss-Gewichte für die Knoten XGK[1], XGK[3], XGK[5], XGK[7]
const WG = [
  0.129484966168869693270611432679082, 0.27970539148927666790146777142378,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

const MAX_EVALS = 2000;
const EVALS_PER_PANEL = 15;

interface Panel {
  a: number;
  b: number;
  val: number;
  err: number;
}

function panel(f: (x: number) => number, a: number, b: number): Panel {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const ev = (x: number): number => {
    const y = f(x);
    if (!Number.isFinite(y)) throw new NumericError('math', 'Funktionswert nicht endlich');
    return y;
  };
  const fc = ev(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const s = ev(c - dx) + ev(c + dx);
    resK += WGK[j] * s;
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * s;
  }
  return { a, b, val: resK * h, err: Math.abs(resK - resG) * Math.abs(h) };
}

/** Adaptive Gauss–Kronrod-Integration; schlechtestes Teilintervall wird zuerst halbiert. */
export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-5): number {
  if (Number.isNaN(a) || Number.isNaN(b)) throw new NumericError('math');
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, tol);

  // Startaufteilung in 4 Teile, damit glatt wirkende Ausreißer nicht übersehen werden
  const panels: Panel[] = [];
  const n0 = 4;
  for (let i = 0; i < n0; i++) {
    panels.push(panel(f, a + ((b - a) * i) / n0, i === n0 - 1 ? b : a + ((b - a) * (i + 1)) / n0));
  }
  let evals = n0 * EVALS_PER_PANEL;

  const relTol = tol * 0.01;
  const absTol = tol * 1e-8;
  for (;;) {
    let total = 0;
    let err = 0;
    let worst = 0;
    for (let i = 0; i < panels.length; i++) {
      total += panels[i].val;
      err += panels[i].err;
      if (panels[i].err > panels[worst].err) worst = i;
    }
    if (err <= Math.max(absTol, relTol * Math.abs(total))) return total;

    const w = panels[worst];
    const m = (w.a + w.b) / 2;
    // Intervall nicht mehr teilbar -> Rest als konvergiert betrachten
    if (!(m > w.a && m < w.b)) {
      if (w.err === 0) return total;
      throw new NumericError('timeout');
    }
    if (evals + 2 * EVALS_PER_PANEL > MAX_EVALS) throw new NumericError('timeout');
    panels[worst] = panel(f, w.a, m);
    panels.push(panel(f, m, w.b));
    evals += 2 * EVALS_PER_PANEL;
  }
}
