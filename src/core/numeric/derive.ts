import { NumericError } from './errors';

/** Numerische Ableitung nach Ridders (zentrale Differenzen mit Richardson-Extrapolation). */
export function derivative(f: (x: number) => number, x0: number, tol = 1e-10): number {
  const CON = 1.4;
  const CON2 = CON * CON;
  const NTAB = 12;
  const SAFE = 2;

  // Startschritt; bei Definitionslücken (z. B. ln nahe 0) verkleinern
  let h = Math.max(1e-3, Math.abs(x0) * 1e-3);
  let ok = false;
  for (let k = 0; k < 60; k++) {
    if (Number.isFinite(f(x0 + h)) && Number.isFinite(f(x0 - h))) {
      ok = true;
      break;
    }
    h /= 4;
  }
  if (!ok) throw new NumericError('math', 'Funktion im Umfeld nicht definiert');

  const a: number[][] = Array.from({ length: NTAB }, () => new Array<number>(NTAB).fill(0));
  const sample = (hh: number): number => {
    const p = f(x0 + hh);
    const m = f(x0 - hh);
    if (!Number.isFinite(p) || !Number.isFinite(m)) throw new NumericError('math');
    return (p - m) / (2 * hh);
  };

  a[0][0] = sample(h);
  let ans = a[0][0];
  let err = Infinity;
  for (let i = 1; i < NTAB; i++) {
    h /= CON;
    a[0][i] = sample(h);
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
      fac *= CON2;
      const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
      if (errt <= err) {
        err = errt;
        ans = a[j][i];
      }
    }
    if (err < tol * Math.max(1, Math.abs(ans))) break;
    // Fehler wächst wieder -> abbrechen
    if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= SAFE * err) break;
  }
  return ans;
}
