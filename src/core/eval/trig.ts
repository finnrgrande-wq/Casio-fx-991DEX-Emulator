// Winkelfunktionen mit exakten Werten für Vielfache von 15° (wie die natürliche Ausgabe des Originals).

import { Rational } from '../exact/rational';
import { Surd } from '../exact/surd';
import type { AngleUnit } from '../../display/scene';
import { CalcError } from '../errors';
import * as V from '../value';
import type { Value } from '../value';

const r = (n: number, d = 1) => Rational.of(BigInt(n), BigInt(d));
const sq = (n: number) => Surd.sqrt(r(n))!;
const q = (n: number, d = 1) => Surd.fromRational(r(n, d));

/** sin(k·15°) für k = 0..6 */
const SIN_15: Surd[] = [
  Surd.ZERO,
  sq(6).sub(sq(2)).div(q(4))!,
  q(1, 2),
  sq(2).div(q(2))!,
  sq(3).div(q(2))!,
  sq(6).add(sq(2)).div(q(4))!,
  Surd.ONE,
];

/** Vollwinkel je Einheit. */
const TURN: Record<AngleUnit, number> = { D: 360, R: 2 * Math.PI, G: 400 };

/** Anteil am Vollwinkel, falls exakt bestimmbar. */
function turnFraction(v: Value, unit: AngleUnit): Rational | undefined {
  if (unit === 'R') {
    if (v.k === 'pi') return v.q.div(r(2));
    return V.isZero(v) ? Rational.ZERO : undefined;
  }
  const x = V.asRational(v);
  return x?.div(r(unit === 'D' ? 360 : 400));
}

/** sin(k·15°) für beliebiges ganzzahliges k. */
function sinSteps(k: bigint): Surd {
  const m = Number(((k % 24n) + 24n) % 24n);
  if (m <= 6) return SIN_15[m];
  if (m <= 12) return SIN_15[12 - m];
  if (m <= 18) return SIN_15[m - 12].neg();
  return SIN_15[24 - m].neg();
}

function toRadians(v: Value, unit: AngleUnit): number {
  return (V.toNumber(v) * 2 * Math.PI) / TURN[unit];
}

/** Eingabebereich des Originals: |x| < 9×10⁹ Grad (bzw. entsprechend). */
function checkRange(v: Value, unit: AngleUnit): void {
  const limit = unit === 'D' ? 9e9 : unit === 'R' ? 157079632.7 : 1e10;
  if (Math.abs(V.toNumber(v)) >= limit) throw new CalcError('math');
}

export function sin(v: Value, unit: AngleUnit): Value {
  checkRange(v, unit);
  const t = turnFraction(v, unit)?.mul(r(24));
  if (t?.isInteger) return V.surd(sinSteps(t.num));
  return V.fl(cleanup(Math.sin(toRadians(v, unit))));
}

export function cos(v: Value, unit: AngleUnit): Value {
  checkRange(v, unit);
  const t = turnFraction(v, unit)?.mul(r(24));
  if (t?.isInteger) return V.surd(sinSteps(t.num + 6n));
  return V.fl(cleanup(Math.cos(toRadians(v, unit))));
}

export function tan(v: Value, unit: AngleUnit): Value {
  checkRange(v, unit);
  const t = turnFraction(v, unit)?.mul(r(24));
  if (t?.isInteger) {
    const c = sinSteps(t.num + 6n);
    if (c.terms.length === 0) throw new CalcError('math');
    return V.div(V.surd(sinSteps(t.num)), V.surd(c));
  }
  const x = toRadians(v, unit);
  const c = Math.cos(x);
  if (Math.abs(c) < 1e-15) throw new CalcError('math');
  return V.fl(cleanup(Math.tan(x)));
}

/** Winkel k·15° als Wert in der eingestellten Einheit. */
function angleOfSteps(k: number, unit: AngleUnit): Value {
  if (unit === 'D') return V.int(k * 15);
  if (unit === 'G') return V.rat(r(k * 50, 3));
  return V.piTimes(r(k, 12));
}

function fromRadians(x: number, unit: AngleUnit): Value {
  return V.fl((x * TURN[unit]) / (2 * Math.PI));
}

/** Sucht den exakten Tabellenwert (für Umkehrfunktionen). */
function stepOf(v: Value, table: (k: number) => Surd, from: number, to: number): number | undefined {
  if (v.k !== 's') return undefined;
  for (let k = from; k <= to; k++) if (table(k).equals(v.s)) return k;
  return undefined;
}

export function asin(v: Value, unit: AngleUnit): Value {
  const x = V.toNumber(v);
  if (Math.abs(x) > 1) throw new CalcError('math');
  const k = stepOf(v, (k) => sinSteps(BigInt(k)), -6, 6);
  if (k !== undefined) return angleOfSteps(k, unit);
  return fromRadians(Math.asin(x), unit);
}

export function acos(v: Value, unit: AngleUnit): Value {
  const x = V.toNumber(v);
  if (Math.abs(x) > 1) throw new CalcError('math');
  const k = stepOf(v, (k) => sinSteps(BigInt(k) + 6n), 0, 12);
  if (k !== undefined) return angleOfSteps(k, unit);
  return fromRadians(Math.acos(x), unit);
}

export function atan(v: Value, unit: AngleUnit): Value {
  if (v.k === 's') {
    for (let k = -5; k <= 5; k++) {
      const t = V.div(V.surd(sinSteps(BigInt(k))), V.surd(sinSteps(BigInt(k) + 6n)));
      if (t.k === 's' && t.s.equals(v.s)) return angleOfSteps(k, unit);
    }
  }
  return fromRadians(Math.atan(V.toNumber(v)), unit);
}

/** Rechnet einen Winkel aus einer Einheit in die eingestellte um (°, r, g aus OPTN). */
export function convertAngle(v: Value, from: AngleUnit, to: AngleUnit): Value {
  if (from === to) return v;
  const fullFrom = from === 'R' ? V.piTimes(r(2)) : V.int(TURN[from]);
  const fullTo = to === 'R' ? V.piTimes(r(2)) : V.int(TURN[to]);
  return V.mul(V.div(v, fullFrom), fullTo);
}

/** Entfernt Rundungsreste nahe 0 (z. B. sin(10^10·π)). */
function cleanup(x: number): number {
  return Math.abs(x) < 1e-15 ? 0 : x;
}
