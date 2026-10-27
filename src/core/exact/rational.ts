// Rationale Zahlen mit BigInt, immer gekürzt und mit positivem Nenner.

export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  private constructor(num: bigint, den: bigint) {
    this.num = num;
    this.den = den;
  }

  static of(num: bigint | number, den: bigint | number = 1n): Rational {
    let n = BigInt(num);
    let d = BigInt(den);
    if (d === 0n) throw new RangeError('Nenner 0');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    return new Rational(g > 1n ? n / g : n, g > 1n ? d / g : d);
  }

  static readonly ZERO = Rational.of(0n);
  static readonly ONE = Rational.of(1n);

  /**
   * Exakte Umwandlung einer endlichen Dezimalzahl (z. B. 12.5 → 25/2).
   * Liefert undefined, wenn die Zahl nicht mit höchstens `maxDigits` signifikanten Stellen darstellbar ist.
   */
  static fromDecimalString(text: string, maxDigits = 15): Rational | undefined {
    const m = /^(-)?(\d*)(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
    if (!m) return undefined;
    const [, sign, intPart = '', fracPart = '', expPart] = m;
    const digits = (intPart + fracPart).replace(/^0+/, '');
    if (digits.length > maxDigits) return undefined;
    let exp = (expPart ? Number(expPart) : 0) - fracPart.length;
    let n = BigInt((intPart + fracPart) || '0');
    let d = 1n;
    if (exp >= 0) n *= 10n ** BigInt(exp);
    else {
      exp = -exp;
      d = 10n ** BigInt(exp);
    }
    return Rational.of(sign ? -n : n, d);
  }

  get isInteger(): boolean {
    return this.den === 1n;
  }

  get isZero(): boolean {
    return this.num === 0n;
  }

  get sign(): -1 | 0 | 1 {
    return this.num < 0n ? -1 : this.num > 0n ? 1 : 0;
  }

  neg(): Rational {
    return new Rational(-this.num, this.den);
  }

  abs(): Rational {
    return this.num < 0n ? this.neg() : this;
  }

  add(o: Rational): Rational {
    return Rational.of(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(o: Rational): Rational {
    return this.add(o.neg());
  }

  mul(o: Rational): Rational {
    return Rational.of(this.num * o.num, this.den * o.den);
  }

  div(o: Rational): Rational {
    if (o.isZero) throw new RangeError('Division durch 0');
    return Rational.of(this.num * o.den, this.den * o.num);
  }

  inv(): Rational {
    return Rational.ONE.div(this);
  }

  /** Ganzzahlige Potenz. */
  pow(e: bigint): Rational {
    if (e < 0n) return this.inv().pow(-e);
    return Rational.of(this.num ** e, this.den ** e);
  }

  cmp(o: Rational): -1 | 0 | 1 {
    const d = this.num * o.den - o.num * this.den;
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  }

  equals(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }

  toNumber(): number {
    // Für große Zähler/Nenner über Stellenverschiebung, damit kein Infinity/Infinity entsteht.
    const n = this.num;
    const d = this.den;
    const nf = Number(n);
    const df = Number(d);
    if (Number.isFinite(nf) && Number.isFinite(df)) return nf / df;
    const shift = BigInt(Math.max(0, d.toString().length - 300));
    return Number(n / 10n ** shift) / Number(d / 10n ** shift);
  }

  toString(): string {
    return this.isInteger ? this.num.toString() : `${this.num}/${this.den}`;
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Anzahl der Dezimalstellen einer Ganzzahl ohne Vorzeichen. */
export function digitCount(n: bigint): number {
  return (n < 0n ? -n : n).toString().length;
}
