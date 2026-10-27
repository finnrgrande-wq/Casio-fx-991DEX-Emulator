import { describe, expect, it } from 'vitest';
import {
  StatError, estimateX, estimateY, normalP, normalQ, normalR, oneVar, regression, standardize, twoVar,
} from '../../src/core/stats/stats';

const kind = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof StatError ? e.kind : 'other';
  }
  return undefined;
};

describe('Regressionen', () => {
  it('quadratisch: a, b, c', () => {
    const r = regression('quad', [-4, -1, 2, 3], [3, 1, 2, 5]);
    expect(Math.abs(r.a - 0.8181818182)).toBeLessThan(1e-9);
    expect(Math.abs(r.b - 0.4575757576)).toBeLessThan(1e-9);
    expect(Math.abs((r.c as number) - 0.2575757576)).toBeLessThan(1e-9);
    expect(r.r).toBeUndefined();
  });

  it('Handbuch Bsp. 3/4: logarithmische Regression', () => {
    const r = regression('log', [20, 110, 200, 290], [3150, 7310, 8800, 9310]);
    expect(r.r as number).toBeCloseTo(0.998, 3);
    expect(r.a).toBeCloseTo(-3857.984, 3);
    expect(r.b).toBeCloseTo(2357.532, 3);
    expect(estimateY(r, 160)).toBeCloseTo(8106.898, 3);
  });

  it('linear auf perfekter Geraden: r = 1', () => {
    const r = regression('lin', [1, 2, 3, 4], [5, 7, 9, 11]);
    expect(r.a).toBeCloseTo(3, 12);
    expect(r.b).toBeCloseTo(2, 12);
    expect(r.r).toBeCloseTo(1, 12);
    const n = regression('lin', [1, 2, 3], [6, 4, 2]);
    expect(n.r).toBeCloseTo(-1, 12);
  });

  it('exakte synthetische Daten für expE, expAB, pow, inv, log', () => {
    const xs = [1, 2, 3, 4, 5];
    const e = regression('expE', xs, xs.map((x) => 2 * Math.exp(0.5 * x)));
    expect(Math.abs(e.a - 2)).toBeLessThan(1e-9);
    expect(Math.abs(e.b - 0.5)).toBeLessThan(1e-9);
    expect(e.r as number).toBeCloseTo(1, 9);

    const ab = regression('expAB', xs, xs.map((x) => 3 * 1.7 ** x));
    expect(Math.abs(ab.a - 3)).toBeLessThan(1e-9);
    expect(Math.abs(ab.b - 1.7)).toBeLessThan(1e-9);

    const p = regression('pow', xs, xs.map((x) => 4 * x ** 1.5));
    expect(Math.abs(p.a - 4)).toBeLessThan(1e-9);
    expect(Math.abs(p.b - 1.5)).toBeLessThan(1e-9);

    const inv = regression('inv', xs, xs.map((x) => 1 + 6 / x));
    expect(Math.abs(inv.a - 1)).toBeLessThan(1e-9);
    expect(Math.abs(inv.b - 6)).toBeLessThan(1e-9);

    const lg = regression('log', xs, xs.map((x) => 2 - 3 * Math.log(x)));
    expect(Math.abs(lg.a - 2)).toBeLessThan(1e-9);
    expect(Math.abs(lg.b + 3)).toBeLessThan(1e-9);
  });

  it('Häufigkeiten wirken wie Wiederholungen', () => {
    const a = regression('lin', [1, 2, 3, 3], [2, 3, 7, 7]);
    const b = regression('lin', [1, 2, 3], [2, 3, 7], [1, 1, 2]);
    expect(b.a).toBeCloseTo(a.a, 12);
    expect(b.b).toBeCloseTo(a.b, 12);
    expect(b.r).toBeCloseTo(a.r as number, 12);
  });

  it('Schätzwerte x̂ (alle Typen) kehren ŷ um', () => {
    const xs = [1, 2, 3, 4, 5];
    const mk = (t: 'lin' | 'log' | 'expE' | 'expAB' | 'pow' | 'inv', f: (x: number) => number) => {
      const r = regression(t, xs, xs.map(f));
      return estimateX(r, f(2.5))[0];
    };
    expect(mk('lin', (x) => 1 + 2 * x)).toBeCloseTo(2.5, 9);
    expect(mk('log', (x) => 1 + 2 * Math.log(x))).toBeCloseTo(2.5, 9);
    expect(mk('expE', (x) => 2 * Math.exp(0.3 * x))).toBeCloseTo(2.5, 9);
    expect(mk('expAB', (x) => 2 * 1.4 ** x)).toBeCloseTo(2.5, 9);
    expect(mk('pow', (x) => 2 * x ** 0.7)).toBeCloseTo(2.5, 9);
    expect(mk('inv', (x) => 1 + 4 / x)).toBeCloseTo(2.5, 9);
  });

  it('estimateX quadratisch: zwei Lösungen, x̂1 mit −√', () => {
    const r = regression('quad', [-4, -1, 2, 3], [3, 1, 2, 5]);
    const [x1, x2] = estimateX(r, 4);
    expect(x1).toBeLessThan(x2);
    expect(estimateY(r, x1)).toBeCloseTo(4, 9);
    expect(estimateY(r, x2)).toBeCloseTo(4, 9);
    // y = x² (c > 0): x̂1 = −2, x̂2 = 2
    const q = estimateX({ type: 'quad', a: 0, b: 0, c: 1 }, 4);
    expect(q[0]).toBeCloseTo(-2, 12);
    expect(q[1]).toBeCloseTo(2, 12);
    // c < 0 vertauscht die Reihenfolge, x̂1 bleibt die −√-Lösung
    const n = estimateX({ type: 'quad', a: 0, b: 0, c: -1 }, -4);
    expect(n[0]).toBeCloseTo(2, 12);
    expect(n[1]).toBeCloseTo(-2, 12);
    // keine reelle Lösung
    expect(kind(() => estimateX(r, -10))).toBe('math');
  });

  it('Fehlerfälle', () => {
    expect(kind(() => regression('lin', [1], [2]))).toBe('math');
    expect(kind(() => regression('lin', [2, 2, 2], [1, 2, 3]))).toBe('math');
    expect(kind(() => regression('quad', [1, 2], [1, 2]))).toBe('math');
    expect(kind(() => regression('quad', [1, 1, 2, 2], [1, 2, 3, 4]))).toBe('math');
    expect(kind(() => regression('log', [0, 1, 2], [1, 2, 3]))).toBe('math');
    expect(kind(() => regression('log', [-1, 1, 2], [1, 2, 3]))).toBe('math');
    expect(kind(() => regression('expE', [1, 2, 3], [1, 0, 3]))).toBe('math');
    expect(kind(() => regression('pow', [1, 2, 3], [1, -2, 3]))).toBe('math');
    expect(kind(() => regression('inv', [0, 1, 2], [1, 2, 3]))).toBe('math');
    expect(kind(() => regression('lin', [1, 2], [1, 2], [1, -1]))).toBe('math');
    expect(kind(() => regression('lin', [1, 2], [1]))).toBe('dimension');
    expect(kind(() => oneVar([1, 2], [1]))).toBe('dimension');
    expect(kind(() => oneVar([]))).toBe('math');
    // Zeile mit Häufigkeit 0 wird ignoriert (auch bei ungültigem Wert)
    expect(regression('log', [0, 1, 2], [1, 2, 3], [0, 1, 1]).b).toBeCloseTo(1 / Math.LN2, 12);
  });
});

describe('Einzelvariable', () => {
  const xs = [1, 2, 3, 4, 5];
  const fr = [1, 2, 3, 2, 1];
  const flat = [1, 2, 2, 3, 3, 3, 4, 4, 5];

  it('Handbuch Bsp. 2', () => {
    const s = oneVar(xs, fr);
    expect(s.n).toBe(9);
    expect(s.mean).toBe(3);
    expect(s.sumX).toBe(27);
    expect(s.sumX2).toBe(93);
    expect(s.median).toBe(3);
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    // Kontrolle gegen direkte Berechnung
    const ss = flat.reduce((a, v) => a + (v - 3) ** 2, 0); // 12
    expect(s.varPop).toBeCloseTo(ss / 9, 14);
    expect(s.sdPop).toBeCloseTo(Math.sqrt(ss / 9), 14);
    expect(s.varSample).toBeCloseTo(ss / 8, 14);
    expect(s.sdSample).toBeCloseTo(Math.sqrt(ss / 8), 14);
    // Häufigkeiten = ausgeschriebene Liste
    const f = oneVar(flat);
    expect(f).toEqual(s);
  });

  it('Quartile (gerades n, ungerades n, unsortiert)', () => {
    expect(oneVar([1, 2, 3, 4]).q1).toBe(1.5);
    expect(oneVar([1, 2, 3, 4]).median).toBe(2.5);
    expect(oneVar([1, 2, 3, 4]).q3).toBe(3.5);
    const o = oneVar([7, 1, 5, 3, 9]); // Median 5 ausgeschlossen: {1,3} {7,9}
    expect([o.q1, o.median, o.q3]).toEqual([2, 5, 8]);
    const e = oneVar([1, 2, 3, 4, 5, 6]); // {1,2,3} {4,5,6}
    expect([e.q1, e.median, e.q3]).toEqual([2, 3.5, 5]);
  });

  it('Häufigkeit 0 wird ignoriert, Bruchhäufigkeiten', () => {
    const a = oneVar([1, 100, 2, 3], [1, 0, 1, 1]);
    expect(a.n).toBe(3);
    expect(a.max).toBe(3);
    const b = oneVar([1, 2], [0.5, 1.5]);
    expect(b.n).toBe(2);
    expect(b.mean).toBeCloseTo(1.75, 14);
  });

  it('Normalverteilung, Handbuch Bsp. 5', () => {
    const s = oneVar(xs, fr);
    expect(s.sdPop).toBeCloseTo(Math.sqrt(4 / 3), 14);
    const t = standardize(2, s);
    expect(t).toBeCloseTo(-Math.sqrt(3) / 2, 12); // -0.8660254038
    expect(t).toBeCloseTo(-0.8660254038, 9);
    expect(normalP(t)).toBeCloseTo(0.19325, 4);
    expect(normalP(t) + normalR(t)).toBeCloseTo(1, 14);
  });

  it('P, Q, R', () => {
    expect(normalP(0)).toBe(0.5);
    expect(normalQ(0)).toBe(0);
    expect(normalR(0)).toBe(0.5);
    expect(normalQ(1)).toBeCloseTo(0.341345, 6);
    expect(normalR(1)).toBeCloseTo(0.158655, 6);
    expect(normalP(1)).toBeCloseTo(0.841345, 6);
    expect(normalQ(-1)).toBeCloseTo(-0.341345, 6);
    expect(normalP(-1)).toBeCloseTo(0.158655, 6);
    expect(normalP(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalR(5)).toBeCloseTo(2.866515718791939e-7, 15);
    expect(normalP(-5)).toBeCloseTo(2.866515718791939e-7, 15);
    expect(normalQ(3)).toBeCloseTo(0.49865010196837, 12);
    // Übergang zwischen Reihe und Kettenbruch (x = 2·√2)
    expect(normalR(2.8284271247)).toBeCloseTo(0.002338867490523, 12);
    expect(normalR(2.8284271246)).toBeCloseTo(0.002338867490523, 10);
  });

  it('standardize bei σ = 0 liefert Mathem. Fehler', () => {
    expect(kind(() => standardize(1, oneVar([2, 2, 2])))).toBe('math');
  });
});

describe('Zweivariablen-Kennwerte', () => {
  it('Summen und Streuungen', () => {
    const t = twoVar([1, 2, 3], [2, 4, 9]);
    expect(t.n).toBe(3);
    expect(t.sumX).toBe(6);
    expect(t.sumX2).toBe(14);
    expect(t.sumY).toBe(15);
    expect(t.sumY2).toBe(101);
    expect(t.sumXY).toBe(1 * 2 + 2 * 4 + 3 * 9);
    expect(t.sumX3).toBe(36);
    expect(t.sumX2Y).toBe(1 * 2 + 4 * 4 + 9 * 9);
    expect(t.sumX4).toBe(98);
    expect(t.meanX).toBe(2);
    expect(t.meanY).toBe(5);
    expect(t.varPopX).toBeCloseTo(2 / 3, 14);
    expect(t.varSampleX).toBeCloseTo(1, 14);
    expect(t.sdSampleY).toBeCloseTo(Math.sqrt(13), 12);
    expect([t.minX, t.maxX, t.minY, t.maxY]).toEqual([1, 3, 2, 9]);
  });

  it('mit Häufigkeiten', () => {
    const a = twoVar([1, 2, 2], [5, 6, 6]);
    const b = twoVar([1, 2], [5, 6], [1, 2]);
    expect(b).toEqual(a);
  });
});
