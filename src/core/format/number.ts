// Dezimale Zahlenformatierung für das LCD (Norm, Fix, Sci, ENG).
// Gerechnet wird auf Ziffernketten, nicht per Gleitkomma-Multiplikation,
// damit keine neuen Rundungsartefakte entstehen.

import type { NumberFormat } from '../../calculator/state';

export interface DisplayNumber {
  mantissa: string;
  /** Wenn gesetzt, wird "×10^exponent" angezeigt. */
  exponent?: number;
}

/** Ergebnis außerhalb des Rechenbereichs ("Mathem. Fehler"). */
export class OverflowError extends Error {
  constructor(message = 'Mathem. Fehler') {
    super(message);
    this.name = 'OverflowError';
  }
}

/** Betrag = d.ddd… × 10^e; digits hat keine führende Null. */
interface Dec {
  digits: string;
  e: number;
}

const DIGITS = 15;

/** Auf 15 signifikante Stellen runden (interne Genauigkeit des Originals), halb weg von Null. */
export function round15(x: number): number {
  if (x === 0) return 0;
  if (!Number.isFinite(x)) return x;
  return Number(x.toExponential(DIGITS - 1));
}

/** Zerlegt x in Vorzeichen und 15 Ziffern; dec = null bei Null (auch bei |x| < 1e-99). */
function decompose(x: number): { neg: boolean; dec: Dec | null } {
  if (!Number.isFinite(x)) throw new OverflowError();
  if (x === 0) return { neg: false, dec: null };
  const m = /^(\d)\.?(\d*)e([+-]\d+)$/.exec(Math.abs(x).toExponential(DIGITS - 1));
  if (!m) throw new OverflowError();
  const e = parseInt(m[3]!, 10);
  if (e >= 100) throw new OverflowError();
  if (e < -99) return { neg: false, dec: null };
  return { neg: x < 0, dec: { digits: m[1]! + m[2]!, e } };
}

/**
 * Rundet auf k signifikante Stellen (halb weg von Null, da Betrag).
 * Ergebnis hat genau k Ziffern; null = Wert rundet auf Null (k ≤ 0).
 */
function roundSig(dec: Dec, k: number): Dec | null {
  const { digits, e } = dec;
  if (k < 0) return null;
  if (k === 0) return digits[0]! >= '5' ? { digits: '1', e: e + 1 } : null;
  if (k >= digits.length) return { digits: digits.padEnd(k, '0'), e };
  if (digits[k]! < '5') return { digits: digits.slice(0, k), e };
  const up = (BigInt(digits.slice(0, k)) + 1n).toString();
  // Übertrag in eine neue Stelle (999… → 1000…)
  return up.length > k ? { digits: up.slice(0, k), e: e + 1 } : { digits: up, e };
}

/** Setzt das Komma hinter pointPos Ziffern (≤ 0: führende Nullen, zu groß: Nullen anhängen). */
function placePoint(digits: string, pointPos: number): { int: string; frac: string } {
  if (pointPos <= 0) return { int: '0', frac: '0'.repeat(-pointPos) + digits };
  if (pointPos >= digits.length) return { int: digits.padEnd(pointPos, '0'), frac: '' };
  return { int: digits.slice(0, pointPos), frac: digits.slice(pointPos) };
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function plain(sign: string, int: string, frac: string, thousands: boolean): string {
  return sign + (thousands ? group(int) : int) + (frac ? ',' + frac : '');
}

/** Mantisse mit einer Vorkommastelle, Nachkommastellen unverändert. */
function mant(sign: string, digits: string): string {
  return sign + digits[0]! + (digits.length > 1 ? ',' + digits.slice(1) : '');
}

const stripZeros = (s: string) => s.replace(/0+$/, '');

export function formatNumber(x: number, fmt: NumberFormat, opts: { thousands?: boolean } = {}): DisplayNumber {
  const { neg, dec } = decompose(x);
  const sign = neg ? '-' : '';
  const thousands = opts.thousands === true;

  switch (fmt.kind) {
    case 'norm': {
      if (!dec) return { mantissa: '0' };
      const r = roundSig(dec, 10)!;
      const digits = stripZeros(r.digits);
      // Form erst nach dem Runden entscheiden (0,0099999999996 → 0,01)
      const low = fmt.n === 1 ? -2 : -9;
      if (r.e < low || r.e >= 10) return { mantissa: mant(sign, digits), exponent: r.e };
      const { int, frac } = placePoint(digits, r.e + 1);
      return { mantissa: plain(sign, int, frac, thousands) };
    }
    case 'fix': {
      const n = Math.min(9, Math.max(0, Math.trunc(fmt.n)));
      const zero = { mantissa: n > 0 ? '0,' + '0'.repeat(n) : '0' };
      if (!dec) return zero;
      const r = roundSig(dec, dec.e + 1 + n);
      if (r && r.e >= 10) {
        const m = roundSig(dec, n + 1)!;
        return { mantissa: mant(sign, m.digits), exponent: m.e };
      }
      // Rundet auf Null: kein Minuszeichen
      if (!r) return zero;
      const { int, frac } = placePoint(r.digits, r.e + 1);
      return { mantissa: plain(sign, int, frac.padEnd(n, '0'), thousands) };
    }
    case 'sci': {
      const n = fmt.n <= 0 || fmt.n >= 10 ? 10 : Math.trunc(fmt.n);
      if (!dec) return { mantissa: n > 1 ? '0,' + '0'.repeat(n - 1) : '0', exponent: 0 };
      const r = roundSig(dec, n)!;
      return { mantissa: mant(sign, r.digits), exponent: r.e };
    }
  }
}

/**
 * ENG-Schreibweise: Exponent ein Vielfaches von 3.
 * shift > 0 (ENG): Exponent um 3 je Schritt kleiner; shift < 0 (ENG←): größer.
 */
export function formatEng(x: number, shift: number, maxDigits = 10): DisplayNumber {
  const { neg, dec } = decompose(x);
  if (!dec) return { mantissa: '0' };
  const r = roundSig(dec, maxDigits)!;
  const digits = stripZeros(r.digits);
  const exponent = Math.floor(r.e / 3) * 3 - 3 * shift;
  const { int, frac } = placePoint(digits, r.e - exponent + 1);
  return { mantissa: plain(neg ? '-' : '', int, frac, false), exponent };
}

/** Zeichenkette für Tests und Debugging, z. B. "1,234×10^12". */
export function displayToString(d: DisplayNumber): string {
  return d.exponent === undefined ? d.mantissa : `${d.mantissa}×10^${d.exponent}`;
}
