// Lineare Gleichungssysteme (2..4 Unbekannte), exaktes Gauß-Jordan-Verfahren.

import { CalcError } from '../errors';
import type { Value } from '../value';
import { eliminate, nonZero } from './matrix';

export type LinResult = { kind: 'unique'; x: Value[] } | { kind: 'infinite' } | { kind: 'none' };

/** coeffs: n Zeilen × (n+1) Spalten (erweiterte Matrix, letzte Spalte = rechte Seite). */
export function solveLinear(coeffs: Value[][]): LinResult {
  const n = coeffs.length;
  if (n < 2 || n > 4 || coeffs.some((r) => r.length !== n + 1)) throw new CalcError('dimension');
  const a = coeffs.map((r) => r.slice());
  const pivots = eliminate(a, n, true, 'auto');
  // Widerspruchszeile: alle Koeffizienten 0, rechte Seite ≠ 0
  for (let i = pivots.length; i < n; i++) if (nonZero(a[i][n])) return { kind: 'none' };
  if (pivots.length < n) return { kind: 'infinite' };
  return { kind: 'unique', x: a.map((r) => r[n]) };
}
