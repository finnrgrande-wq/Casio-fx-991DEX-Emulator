// Katalog aller Eingabe-Token: Anzeige und Art (für Layout und Parser).

import { CONST_CATEGORIES } from '../data/constants';
import { CONV_CATEGORIES } from '../data/conversions';

export type TokenKind =
  | 'digit' | 'comma' | 'binop' | 'neg' | 'lparen' | 'rparen' | 'sep' | 'colon' | 'eq'
  | 'func' | 'postfix' | 'var' | 'const' | 'angleUnit' | 'conv';

export interface TokenInfo {
  /** Text in der Anzeige (Glyph-Schlüssel der Pixelschriften). */
  text: string;
  kind: TokenKind;
}

const T = (text: string, kind: TokenKind): TokenInfo => ({ text, kind });

/** Dezimalpräfixe (Symbol, Zehnerpotenz) in Menüreihenfolge. */
export const PREFIXES: readonly (readonly [string, number])[] = [
  ['k', 3], ['M', 6], ['G', 9], ['T', 12], ['P', 15], ['E', 18],
  ['m', -3], ['µ', -6], ['n', -9], ['p', -12], ['f', -15],
];

const FUNCS = [
  'sin(', 'cos(', 'tan(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(',
  'sinh(', 'cosh(', 'tanh(', 'sinh⁻¹(', 'cosh⁻¹(', 'tanh⁻¹(',
  'log(', 'ln(', 'Abs(', 'Pol(', 'Rec(', 'GCD(', 'LCM(', 'Int(', 'Intg(',
  'Rnd(', 'RndFix(', 'RanInt#(',
] as const;

export const TOKENS: Readonly<Record<string, TokenInfo>> = {
  ...Object.fromEntries('0123456789'.split('').map((d) => [d, T(d, 'digit')])),
  ',': T(',', 'comma'),
  '+': T('+', 'binop'),
  '−': T('−', 'binop'),
  '×': T('×', 'binop'),
  '÷': T('÷', 'binop'),
  'nPr': T('P', 'binop'),
  'nCr': T('C', 'binop'),
  '÷R': T('÷R', 'binop'),
  '∠': T('∠', 'binop'),
  neg: T('-', 'neg'),
  '(': T('(', 'lparen'),
  ')': T(')', 'rparen'),
  ';': T(';', 'sep'),
  ':': T(':', 'colon'),
  '=': T('=', 'eq'),
  ...Object.fromEntries(FUNCS.map((f) => [f, T(f, 'func')])),
  '²': T('²', 'postfix'),
  '³': T('³', 'postfix'),
  '⁻¹': T('⁻¹', 'postfix'),
  '!': T('!', 'postfix'),
  '%': T('%', 'postfix'),
  dms: T('°', 'postfix'),
  'deg': T('°', 'angleUnit'),
  'rad': T('ʳ', 'angleUnit'),
  'gra': T('ᵍ', 'angleUnit'),
  ...Object.fromEntries('ABCDEFM'.split('').map((v) => [v, T(v, 'var')])),
  x: T('𝑥', 'var'),
  y: T('𝑦', 'var'),
  'π': T('π', 'const'),
  e: T('e', 'const'),
  i: T('i', 'const'),
  Ans: T('Ans', 'const'),
  'Ran#': T('Ran#', 'const'),
  ...Object.fromEntries(PREFIXES.map(([sym]) => [`pfx:${sym}`, T(sym, 'postfix')])),
  // Wissenschaftliche Konstanten (SHIFT 7) und Umrechnungen (SHIFT 8)
  ...Object.fromEntries(CONST_CATEGORIES.flatMap((c) => c.items).map((k) => [`const:${k.symbol}`, T(k.symbol, 'const')])),
  ...Object.fromEntries(CONV_CATEGORIES.flatMap((c) => c.items).map((k) => [`conv:${k.label}`, T(k.label, 'conv')])),
};

export function tokenInfo(tok: string): TokenInfo {
  const info = TOKENS[tok];
  if (!info) throw new Error(`unbekanntes Token: ${tok}`);
  return info;
}
