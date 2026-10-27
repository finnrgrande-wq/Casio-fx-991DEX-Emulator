// Kurzformat für Tabellenzellen: Norm 1, höchstens 6 Zeichen, bei Bedarf mit Exponent.

import type { NumberFormat } from '../../calculator/state';
import { formatNumber, round15, type DisplayNumber } from '../../core/format/number';
import type { ResultForm } from '../../display/resultForm';

const NORM1: NumberFormat = { kind: 'norm', n: 1 };
const MAX_CHARS = 6;

const trimZeros = (m: string): string => (m.includes(',') ? m.replace(/0+$/, '').replace(/,$/, '') : m);
const text = (d: DisplayNumber): string => trimZeros(d.mantissa) + (d.exponent === undefined ? '' : `E${d.exponent}`);

/** Zahl so kurz runden, dass sie in eine Zelle passt (z. B. 0,3333 oder 1,23E7). */
export function cellText(x: number): string {
  const v = round15(x);
  if (v === 0) return '0';
  for (let k = 10; k >= 1; k--) {
    const s = text(formatNumber(Number(v.toPrecision(k)), NORM1));
    if (s.length <= MAX_CHARS) return s;
  }
  for (let k = 5; k >= 1; k--) {
    const s = text(formatNumber(v, { kind: 'sci', n: k }));
    if (s.length <= MAX_CHARS) return s;
  }
  return text(formatNumber(v, { kind: 'sci', n: 1 }));
}

/** Voller Wert (Norm 1) der hervorgehobenen Zelle für die große Anzeige. */
export function fullForm(x: number): ResultForm {
  const d = formatNumber(round15(x), NORM1);
  return { kind: 'decimal', mantissa: d.mantissa, exponent: d.exponent };
}
