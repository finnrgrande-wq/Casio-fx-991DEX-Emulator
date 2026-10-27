// Wahl der Ergebnisdarstellung: exakte Form (Bruch, √-Form, π-Form) oder Dezimalzahl.

import type { ResultForm } from '../../display/resultForm';
import type { Settings } from '../../calculator/state';
import { Rational, digitCount } from '../exact/rational';
import { surdDisplayForm } from '../exact/surd';
import { CalcError } from '../errors';
import { OverflowError, formatNumber, round15 } from './number';
import type { Value } from '../value';
import { toNumber } from '../value';

/** Höchstens 10 Stellen inkl. Trennzeichen für Brüche (Ganzzahl, Zähler, Nenner). */
const MAX_FRACTION_DIGITS = 10;

export function decimalForm(v: Value, s: Settings): ResultForm {
  try {
    const d = formatNumber(round15(toNumber(v)), s.format, { thousands: s.thousands });
    return { kind: 'decimal', mantissa: d.mantissa, exponent: d.exponent };
  } catch (e) {
    if (e instanceof OverflowError) throw new CalcError('math');
    throw e;
  }
}

/** Bruchform einer rationalen Zahl, falls sie in die Anzeige passt (undefined bei ganzen Zahlen). */
export function fractionForm(q: Rational, mixed: boolean): ResultForm | undefined {
  if (q.isInteger) return undefined;
  const negative = q.sign < 0;
  const num = negative ? -q.num : q.num;
  if (mixed && num > q.den) {
    const whole = num / q.den;
    const rest = num % q.den;
    if (digitCount(whole) + digitCount(rest) + digitCount(q.den) + 2 > MAX_FRACTION_DIGITS) return undefined;
    return { kind: 'fraction', negative, whole: whole.toString(), num: rest.toString(), den: q.den.toString() };
  }
  if (digitCount(num) + digitCount(q.den) + 1 > MAX_FRACTION_DIGITS) return undefined;
  return { kind: 'fraction', negative, num: num.toString(), den: q.den.toString() };
}

/** Erkennt einfache Brüche in Gleitkommaergebnissen (z. B. Integral −1,125 → −9/8). */
export function recognizeFraction(x: number): Rational | undefined {
  if (!Number.isFinite(x) || Number.isInteger(x) || Math.abs(x) >= 1e10) return undefined;
  const target = round15(x);
  // Kettenbruchentwicklung
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  let y = Math.abs(target);
  for (let i = 0; i < 40; i++) {
    const a = BigInt(Math.floor(y));
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 100000n) return undefined;
    const approx = Number(h1) / Number(k1);
    if (round15(approx) === Math.abs(target)) return Rational.of(target < 0 ? -h1 : h1, k1);
    const frac = y - Math.floor(y);
    if (frac < 1e-15) return undefined;
    y = 1 / frac;
  }
  return undefined;
}

/** Exakte Darstellung (Math-Ausgabe) oder undefined, wenn nur die Dezimalform möglich ist. */
export function exactForm(v: Value, s: Settings, opts: { linear?: boolean; mixed?: boolean } = {}): ResultForm | undefined {
  const mixed = opts.mixed ?? s.fraction === 'mixed';
  if (v.k === 's') {
    const q = v.s.toRational();
    if (q) return fractionForm(q, mixed);
    if (opts.linear) return undefined;
    const form = surdDisplayForm(v.s);
    return form && { kind: 'surd', terms: form.terms, c: form.c };
  }
  if (v.k === 'pi') {
    if (opts.linear || Math.abs(toNumber(v)) >= 1e6) return undefined;
    const num = v.q.num < 0n ? -v.q.num : v.q.num;
    if (digitCount(num) + digitCount(v.q.den) + 1 > MAX_FRACTION_DIGITS) return undefined;
    return { kind: 'pi', num: v.q.num, den: v.q.den };
  }
  // Nur Ergebnisse der Numerik (∫, d/dx) werden als Bruch erkannt, z. B. −1,125 → −9/8
  const q = v.numeric ? recognizeFraction(v.x) : undefined;
  return q && fractionForm(q, mixed);
}
