// Fehlerarten des Originals mit den Texten des DE X.

import type { Cursor } from '../editor/model';

export type ErrorKind =
  | 'math' | 'stack' | 'syntax' | 'argument' | 'dimension' | 'variable'
  | 'noSolution' | 'range' | 'timeout' | 'circular' | 'memory';

export const ERROR_TEXT: Readonly<Record<ErrorKind, string>> = {
  math: 'Mathem. Fehler',
  stack: 'Stapelfehler',
  syntax: 'Syntaxfehler',
  argument: 'Argumentfehler',
  dimension: 'Dimensionsfehler',
  variable: 'Variablenfehler',
  noSolution: 'Keine Lösung gef',
  range: 'Bereichsfehler',
  timeout: 'Zeitüberschreit',
  circular: 'Zirkelbezug',
  memory: 'Speicherfehler',
};

export class CalcError extends Error {
  constructor(
    readonly kind: ErrorKind,
    /** Fehlerstelle im Eingabebaum (Cursor springt mit ◀/▶ dorthin). */
    public at?: Cursor,
  ) {
    super(ERROR_TEXT[kind]);
  }
}
