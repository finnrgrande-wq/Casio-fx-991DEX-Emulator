// Fehlerklassen der numerischen Routinen (Math ERROR / Zeitüberschreitung / keine Lösung).
export type NumericErrorKind = 'math' | 'timeout' | 'noSolution';

export class NumericError extends Error {
  constructor(
    readonly kind: NumericErrorKind,
    msg?: string,
  ) {
    super(msg ?? kind);
    this.name = 'NumericError';
  }
}
