import { describe, expect, it } from 'vitest';
import { Rational } from '../../src/core/exact/rational';
import { Surd, squarefree, surdDisplayForm } from '../../src/core/exact/surd';

const R = (n: number, d = 1) => Rational.of(n, d);
const sq = (n: number, d = 1): Surd => {
  const s = Surd.sqrt(R(n, d));
  if (!s) throw new Error('sqrt fehlgeschlagen');
  return s;
};
const rat = (n: number, d = 1) => Surd.fromRational(R(n, d));
const ok = (s: Surd | undefined): Surd => {
  if (!s) throw new Error('undefined');
  return s;
};

describe('squarefree', () => {
  it('zerlegt kleine Zahlen', () => {
    expect(squarefree(72n)).toEqual({ outside: 6n, inside: 2n });
    expect(squarefree(0n)).toEqual({ outside: 0n, inside: 1n });
    expect(squarefree(1n)).toEqual({ outside: 1n, inside: 1n });
    expect(squarefree(137n)).toEqual({ outside: 1n, inside: 137n });
    expect(squarefree(1000000n)).toEqual({ outside: 1000n, inside: 1n });
  });

  it('erkennt Quadrate großer Primzahlen', () => {
    const p = 1_000_003n;
    expect(squarefree(p * p)).toEqual({ outside: p, inside: 1n });
    expect(squarefree(4n * p * p)).toEqual({ outside: 2n * p, inside: 1n });
  });

  it('gibt bei nicht sicher entscheidbaren Zahlen auf oder liefert korrekt', () => {
    const big = 10n ** 18n + 9n;
    const r = squarefree(big);
    if (r) expect(r.outside * r.outside * r.inside).toBe(big);
    // p²·q mit großen Primzahlen > 1e5 kann nicht sicher zerlegt werden
    expect(squarefree(1_000_003n ** 2n * 1_000_033n)).toBeUndefined();
  });
});

describe('Surd Grundrechenarten', () => {
  it('vereinfacht Wurzeln', () => {
    expect(sq(8).equals(Surd.sqrt(R(8))!)).toBe(true);
    expect(sq(8).terms).toEqual([{ coef: R(2), rad: 2n }]);
    expect(sq(1, 2).terms).toEqual([{ coef: R(1, 2), rad: 2n }]);
    expect(sq(4, 9).toRational()?.equals(R(2, 3))).toBe(true);
    expect(Surd.sqrt(R(-1))).toBeUndefined();
    expect(sq(0).equals(Surd.ZERO)).toBe(true);
  });

  it('√2·√2 = 2', () => {
    expect(ok(sq(2).mul(sq(2))).toRational()?.equals(R(2))).toBe(true);
  });

  it('√12/√3 = 2', () => {
    expect(ok(sq(12).div(sq(3))).toRational()?.equals(R(2))).toBe(true);
  });

  it('1/√2 = √2/2', () => {
    const x = ok(rat(1).div(sq(2)));
    expect(x.terms).toEqual([{ coef: R(1, 2), rad: 2n }]);
  });

  it('1/(1+√2) = −1+√2', () => {
    const x = ok(rat(1).div(rat(1).add(sq(2))));
    expect(x.equals(rat(-1).add(sq(2)))).toBe(true);
  });

  it('(1+√2)² = 3+2√2', () => {
    const x = ok(rat(1).add(sq(2)).pow(2n));
    expect(x.equals(rat(3).add(sq(2).mul(rat(2))!))).toBe(true);
  });

  it('(√2+√3)(√2−√3) = −1', () => {
    const a = sq(2).add(sq(3));
    const b = sq(2).sub(sq(3));
    expect(ok(a.mul(b)).toRational()?.equals(R(-1))).toBe(true);
  });

  it('Division durch zwei Wurzeln (Konjugierte beider Radikanden)', () => {
    // 1/(√2+√3) = √3−√2
    const x = ok(rat(1).div(sq(2).add(sq(3))));
    expect(x.equals(sq(3).sub(sq(2)))).toBe(true);
  });

  it('negative Potenzen und Grenzen', () => {
    const x = ok(sq(2).pow(-2n));
    expect(x.toRational()?.equals(R(1, 2))).toBe(true);
    expect(sq(2).pow(65n)).toBeUndefined();
    expect(ok(sq(2).pow(0n)).toRational()?.equals(R(1))).toBe(true);
  });

  it('mul liefert undefined bei mehr als 4 Termen', () => {
    const a = rat(1).add(sq(2)).add(sq(3));
    const b = rat(1).add(sq(5)).add(sq(7));
    expect(a.mul(b)).toBeUndefined();
  });

  it('div: Division durch 0 wirft, drei Terme im Nenner undefined', () => {
    expect(() => rat(1).div(Surd.ZERO)).toThrow(RangeError);
    expect(rat(1).div(rat(1).add(sq(2)).add(sq(3)))).toBeUndefined();
  });

  it('2√2 − √8 = 0', () => {
    const x = ok(sq(2).mul(rat(2))).sub(sq(8));
    expect(x.terms.length).toBe(0);
    expect(x.equals(Surd.ZERO)).toBe(true);
    expect(x.sign()).toBe(0);
  });
});

describe('Surd.sign', () => {
  it('2 Terme exakt', () => {
    expect(rat(1).sub(sq(2)).sign()).toBe(-1);
    expect(sq(3).sub(sq(2)).sign()).toBe(1);
    expect(rat(3).sub(ok(sq(2).mul(rat(2)))).sign()).toBe(1);
    expect(sq(2).sub(rat(3)).sign()).toBe(-1);
  });

  it('3 Terme, knappe Differenz', () => {
    // Vorzeichen knapper Differenzen über Festkomma-Näherung
    const x = rat(1000).sub(sq(1000001)).add(sq(2)); // ≈ 1.4137
    expect(x.sign()).toBe(1);
    const y = rat(1000).sub(sq(1000001)).sub(sq(2)); // ≈ −1.4152
    expect(y.sign()).toBe(-1);
  });
});

describe('surdDisplayForm', () => {
  it('(2√7+3√2)/6', () => {
    const x = ok(sq(7).add(Surd.ZERO).mul(rat(1, 3))).add(ok(sq(8).mul(rat(1, 4))));
    expect(surdDisplayForm(x)).toEqual({
      terms: [
        { a: 2n, b: 7n },
        { a: 3n, b: 2n },
      ],
      c: 6n,
    });
  });

  it('2+2√3', () => {
    const x = rat(2).add(ok(rat(2).mul(sq(3))));
    expect(surdDisplayForm(x)).toEqual({
      terms: [
        { a: 2n, b: 1n },
        { a: 2n, b: 3n },
      ],
      c: 1n,
    });
  });

  it('(5−√137)/8', () => {
    const x = ok(rat(5).sub(sq(137)).div(rat(8)));
    expect(surdDisplayForm(x)).toEqual({
      terms: [
        { a: 5n, b: 1n },
        { a: -1n, b: 137n },
      ],
      c: 8n,
    });
  });

  it('−1+√3', () => {
    expect(surdDisplayForm(rat(-1).add(sq(3)))).toEqual({
      terms: [
        { a: -1n, b: 1n },
        { a: 1n, b: 3n },
      ],
      c: 1n,
    });
  });

  it('Grenzen', () => {
    expect(surdDisplayForm(ok(sq(2).mul(rat(100))))).toBeUndefined(); // a zu groß
    expect(surdDisplayForm(sq(1001))).toBeUndefined(); // b zu groß
    expect(surdDisplayForm(ok(sq(2).mul(rat(1, 100))))).toBeUndefined(); // c zu groß
    expect(surdDisplayForm(sq(2).add(sq(3)).add(sq(5)))).toBeUndefined(); // 3 Terme
    expect(surdDisplayForm(ok(sq(2).mul(rat(99))))).toBeDefined();
    expect(surdDisplayForm(sq(999))).toBeDefined(); // 3√111
    expect(surdDisplayForm(ok(sq(2).mul(rat(1, 99))))).toBeDefined();
  });

  it('rationale Werte und Null → undefined', () => {
    expect(surdDisplayForm(rat(3, 4))).toBeUndefined();
    expect(surdDisplayForm(Surd.ZERO)).toBeUndefined();
  });
});

// Deterministischer Zufall
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Zufallstests', () => {
  const rand = rng(12345);
  const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const randomSurd = (): Surd => {
    let x = rat(ri(-9, 9), ri(1, 6));
    const k = ri(0, 2);
    for (let i = 0; i < k; i++) {
      const root = sq(ri(2, 40));
      x = x.add(ok(root.mul(rat(ri(-9, 9), ri(1, 6)))));
    }
    return x;
  };
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

  it('add/sub/mul/div stimmen mit Gleitkomma überein', () => {
    for (let i = 0; i < 300; i++) {
      const x = randomSurd();
      const y = randomSurd();
      const fx = x.toNumber();
      const fy = y.toNumber();
      expect(close(x.add(y).toNumber(), fx + fy)).toBe(true);
      expect(close(x.sub(y).toNumber(), fx - fy)).toBe(true);
      const m = x.mul(y);
      if (m) expect(close(m.toNumber(), fx * fy)).toBe(true);
      if (y.terms.length > 0) {
        const d = x.div(y);
        if (d) {
          expect(close(d.toNumber() * fy, fx)).toBe(true);
          // exakte Probe: (x/y)·y = x
          const back = d.mul(y);
          if (back) expect(back.equals(x)).toBe(true);
        }
      }
    }
  });

  it('sign stimmt mit Gleitkomma überein, wenn der Wert nicht winzig ist', () => {
    for (let i = 0; i < 300; i++) {
      const x = randomSurd().sub(randomSurd());
      const f = x.toNumber();
      if (Math.abs(f) > 1e-9) expect(x.sign()).toBe(f < 0 ? -1 : 1);
      if (x.terms.length === 0) expect(x.sign()).toBe(0);
    }
  });
});
