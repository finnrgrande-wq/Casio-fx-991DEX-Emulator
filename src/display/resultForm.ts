// Darstellungsformen eines Rechenergebnisses (vom Rechenkern erzeugt, vom Layout gezeichnet).

export type ResultForm =
  /** Dezimalzahl; mantissa mit Dezimalkomma und ASCII-Minus, exponent → „×10^exponent“. */
  | { kind: 'decimal'; mantissa: string; exponent?: number }
  /** Bruch (unecht oder gemischt mit `whole`), Beträge als Ziffernfolgen. */
  | { kind: 'fraction'; negative: boolean; whole?: string; num: string; den: string }
  /** (Σ aᵢ·√bᵢ) / c; bᵢ = 1 ist ein ganzzahliger Summand. */
  | { kind: 'surd'; terms: { a: bigint; b: bigint }[]; c: bigint }
  /** num·π / den (den = 1 → kein Bruchstrich). */
  | { kind: 'pi'; num: bigint; den: bigint }
  /** Periodische Dezimalzahl: int,nonRep(rep) mit Überstrich über rep. */
  | { kind: 'recurring'; negative: boolean; int: string; nonRep: string; rep: string }
  /** Komplexe Zahl a+bi; im ist der Betrag des Imaginärteils (ohne i). */
  | { kind: 'complex'; re?: ResultForm; im: ResultForm; imNegative: boolean }
  /** Polarform r∠θ. */
  | { kind: 'polar'; r: ResultForm; theta: ResultForm }
  /** Freier Text, z. B. „r=2; θ=45“ oder Meldungen. */
  | { kind: 'text'; text: string };

/** Einzeilige Textfassung (für Tests und Screenreader), z. B. „(2√7+3√2)/6“, „-9/8“, „1,4286E-1“. */
export function formToText(f: ResultForm): string {
  switch (f.kind) {
    case 'decimal':
      return f.mantissa + (f.exponent !== undefined ? `E${f.exponent}` : '');
    case 'fraction':
      return `${f.negative ? '-' : ''}${f.whole ? f.whole + ' ' : ''}${f.num}/${f.den}`;
    case 'surd': {
      const terms = f.terms
        .map((t, i) => {
          const sign = t.a < 0n ? '-' : i > 0 ? '+' : '';
          const abs = t.a < 0n ? -t.a : t.a;
          if (t.b === 1n) return `${sign}${abs}`;
          return `${sign}${abs === 1n ? '' : abs}√${t.b}`;
        })
        .join('');
      if (f.c === 1n) return terms;
      return f.terms.length > 1 ? `(${terms})/${f.c}` : `${terms}/${f.c}`;
    }
    case 'pi': {
      const coef = f.num === 1n ? '' : f.num === -1n ? '-' : f.num.toString();
      return `${coef}π${f.den === 1n ? '' : '/' + f.den}`;
    }
    case 'recurring':
      return `${f.negative ? '-' : ''}${f.int},${f.nonRep}(${f.rep})`;
    case 'complex': {
      const im = formToText(f.im);
      const sign = f.imNegative ? '-' : f.re ? '+' : '';
      return `${f.re ? formToText(f.re) : ''}${sign}${im === '1' ? '' : im}i`;
    }
    case 'polar':
      return `${formToText(f.r)}∠${formToText(f.theta)}`;
    case 'text':
      return f.text;
  }
}
