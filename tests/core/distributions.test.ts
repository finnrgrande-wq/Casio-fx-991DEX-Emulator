import { describe, expect, it } from 'vitest';
import {
  DistError, binomialCdf, binomialPdf, inverseNormal, normalCdf, normalPdf, poissonCdf, poissonPdf,
} from '../../src/core/dist/distributions';

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

/** Exakter Binomialkoeffizient als BigInt. */
function choose(n: number, k: number): bigint {
  let c = 1n;
  for (let i = 1; i <= k; i++) c = (c * BigInt(n - i + 1)) / BigInt(i);
  return c;
}

/** Bruch a/b (BigInt) als Zahl, auch bei riesigen Werten. */
function ratio(a: bigint, b: bigint): number {
  const S = 10n ** 40n;
  return Number((a * S) / b) / 1e40;
}

describe('Normalverteilung', () => {
  it('Dichte', () => {
    expect(normalPdf(36, 2, 35)).toBeCloseTo(0.1760326634, 10);
    expect(normalPdf(0, 1, 0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15);
  });
  it('kumulativ', () => {
    expect(normalCdf(-1, 1, 1, 0)).toBeCloseTo(0.6826894921, 10);
    expect(normalCdf(-1e99, 1.96, 1, 0)).toBeCloseTo(0.9750021049, 10);
    expect(rel(normalCdf(5, 1e99, 1, 0), 2.866515719e-7)).toBeLessThan(1e-9);
    expect(rel(normalCdf(5, 1e99, 1, 0), 2.8665157187919391e-7)).toBeLessThan(1e-12);
    expect(normalCdf(-1e99, 1e99, 1, 0)).toBe(1);
    expect(normalCdf(0, 0, 1, 0)).toBe(0);
    // Skalierung mit σ, μ
    expect(normalCdf(8, 12, 2, 10)).toBeCloseTo(0.6826894921, 10);
    // tiefer Schwanz, linke Seite
    expect(rel(normalCdf(-1e99, -5, 1, 0), 2.8665157187919391e-7)).toBeLessThan(1e-12);
    expect(rel(normalCdf(-10, -9, 1, 0), 1.1285884059538e-19 - 7.619853024160e-24)).toBeLessThan(1e-10);
  });
  it('invers', () => {
    expect(inverseNormal(0.975, 1, 0)).toBeCloseTo(1.959963985, 9);
    expect(inverseNormal(0.5, 2, 10)).toBe(10);
    expect(inverseNormal(0.025, 1, 0)).toBeCloseTo(-1.959963985, 9);
    expect(inverseNormal(0.9, 3, 5)).toBeCloseTo(5 + 3 * 1.2815515655446004, 11);
    for (const a of [1e-10, 1e-5, 0.01, 0.3, 0.7, 0.99, 1 - 1e-9]) {
      const x = inverseNormal(a, 1, 0);
      const back = x < 0 ? normalCdf(-1e99, x, 1, 0) : 1 - normalCdf(x, 1e99, 1, 0);
      expect(Math.abs(back - a) / Math.min(a, 1 - a)).toBeLessThan(1e-9);
    }
  });
  it('Fehler', () => {
    expect(() => normalPdf(0, 0, 0)).toThrow(DistError);
    expect(() => normalPdf(0, -1, 0)).toThrow(DistError);
    expect(() => normalCdf(2, 1, 1, 0)).toThrow(DistError);
    expect(() => inverseNormal(0, 1, 0)).toThrow(DistError);
    expect(() => inverseNormal(1, 1, 0)).toThrow(DistError);
    expect(() => inverseNormal(1.5, 1, 0)).toThrow(DistError);
    try { inverseNormal(0, 1, 0); } catch (e) { expect((e as DistError).kind).toBe('math'); }
  });
});

describe('Binomialverteilung', () => {
  it('Dichte: Kurzanleitung', () => {
    expect(binomialPdf(9, 20, 0.4)).toBeCloseTo(0.159738478, 9);
  });
  it('Dichte: Handbuch n=15, p=0,6', () => {
    for (const k of [10, 11, 12, 13]) {
      const exact = ratio(choose(15, k) * 3n ** BigInt(k) * 2n ** BigInt(15 - k), 5n ** 15n);
      expect(rel(binomialPdf(k, 15, 0.6), exact)).toBeLessThan(1e-13);
    }
  });
  it('kumulativ exakt', () => {
    let num = 0n;
    for (let j = 0; j <= 9; j++) num += choose(20, j) * 2n ** BigInt(j) * 3n ** BigInt(20 - j);
    const exact = ratio(num, 5n ** 20n);
    expect(exact).toBeCloseTo(0.7553372033, 9);
    expect(rel(binomialCdf(9, 20, 0.4), exact)).toBeLessThan(1e-13);
    expect(binomialCdf(20, 20, 0.4)).toBe(1);
    expect(binomialCdf(0, 20, 0.4)).toBeCloseTo(0.6 ** 20, 18);
  });
  it('Randfälle p=0 / p=1', () => {
    expect(binomialPdf(0, 10, 0)).toBe(1);
    expect(binomialPdf(3, 10, 0)).toBe(0);
    expect(binomialPdf(10, 10, 1)).toBe(1);
    expect(binomialPdf(9, 10, 1)).toBe(0);
    expect(binomialCdf(0, 10, 0)).toBe(1);
    expect(binomialCdf(9, 10, 1)).toBe(0);
    expect(binomialCdf(10, 10, 1)).toBe(1);
    expect(binomialPdf(0, 0, 0.5)).toBe(1);
    expect(binomialCdf(0, 0, 0.5)).toBe(1);
  });
  it('groß: n = 10000', () => {
    const exact = ratio(choose(10000, 5000), 1n << 10000n);
    expect(rel(binomialPdf(5000, 10000, 0.5), exact)).toBeLessThan(1e-10);
    // p = 0,3, k = 3000: exakte Summe der Terme C(n,j)·3^j·7^(n−j) / 10^n
    const n = 10000;
    const K = 3000;
    let num = 0n; // Summe C(n,j)·3^j·7^(K−j)
    let c = 1n;
    let p3 = 1n;
    let p7 = 7n ** BigInt(K);
    for (let j = 0; j <= K; j++) {
      if (j > 0) { c = (c * BigInt(n - j + 1)) / BigInt(j); p3 *= 3n; p7 /= 7n; }
      num += c * p3 * p7;
    }
    // gemeinsamer Faktor 7^(n−K) wird in den Zähler gezogen
    const exactCdf = ratio(num * 7n ** BigInt(n - K), 10n ** BigInt(n));
    expect(rel(binomialCdf(K, n, 0.3), exactCdf)).toBeLessThan(1e-10);
    const exactPdf = ratio(choose(n, K) * 3n ** BigInt(K) * 7n ** BigInt(n - K), 10n ** BigInt(n));
    expect(rel(binomialPdf(K, n, 0.3), exactPdf)).toBeLessThan(1e-10);
    expect(binomialCdf(5000, 10000, 0.5)).toBeCloseTo(0.5 + exact / 2, 12);
  });
  it('Fehler', () => {
    expect(() => binomialPdf(1, 10, -0.1)).toThrow(DistError);
    expect(() => binomialPdf(1, 10, 1.1)).toThrow(DistError);
    expect(() => binomialPdf(1, 10.5, 0.5)).toThrow(DistError);
    expect(() => binomialPdf(1, -1, 0.5)).toThrow(DistError);
    expect(() => binomialPdf(1.5, 10, 0.5)).toThrow(DistError);
    expect(() => binomialPdf(11, 10, 0.5)).toThrow(DistError);
    expect(() => binomialCdf(-1, 10, 0.5)).toThrow(DistError);
  });
});

describe('Poissonverteilung', () => {
  it('Dichte und kumulativ', () => {
    expect(rel(poissonPdf(3, 2), Math.exp(-2) * 8 / 6)).toBeLessThan(1e-14);
    expect(poissonPdf(0, 2)).toBeCloseTo(Math.exp(-2), 16);
    expect(poissonCdf(3, 2)).toBeCloseTo(0.8571234605, 10);
    expect(rel(poissonCdf(3, 2), Math.exp(-2) * 19 / 3)).toBeLessThan(1e-14);
  });
  it('groß: μ = 100', () => {
    // Hinweis: 0.5265622074 aus der Aufgabe ist nicht korrekt; exakter Wert 0.52656219853 (s. BigInt-Referenz unten)
    expect(poissonCdf(100, 100)).toBeCloseTo(0.5265621985, 9);
    // exakte Referenz: Σ 100^j/j! als BigInt-Bruch
    let fact = 1n;
    for (let i = 2; i <= 100; i++) fact *= BigInt(i);
    let num = 0n;
    let pw = 1n;
    let fj = 1n;
    for (let j = 0; j <= 100; j++) {
      if (j > 0) { pw *= 100n; fj *= BigInt(j); }
      num += pw * (fact / fj);
    }
    const exact = ratio(num, fact) * Math.exp(-100);
    expect(rel(poissonCdf(100, 100), exact)).toBeLessThan(1e-12);
    expect(rel(poissonPdf(100, 100), ratio(100n ** 100n, fact) * Math.exp(-100))).toBeLessThan(1e-12);
  });
  it('Fehler', () => {
    expect(() => poissonPdf(1, 0)).toThrow(DistError);
    expect(() => poissonPdf(1, -2)).toThrow(DistError);
    expect(() => poissonCdf(1.5, 2)).toThrow(DistError);
    expect(() => poissonCdf(-1, 2)).toThrow(DistError);
  });
});
