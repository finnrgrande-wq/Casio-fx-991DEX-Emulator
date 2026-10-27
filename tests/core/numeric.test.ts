import { describe, expect, it } from 'vitest';
import { NumericError } from '../../src/core/numeric/errors';
import { integrate } from '../../src/core/numeric/integrate';
import { derivative } from '../../src/core/numeric/derive';
import { solve } from '../../src/core/numeric/solve';
import { polyRoots } from '../../src/core/numeric/poly';

const kind = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof NumericError ? e.kind : 'other';
  }
  return undefined;
};

describe('integrate', () => {
  it('Polynom ∫₀^1,5 (2x²−3x) = −1,125', () => {
    expect(Math.abs(integrate((x) => 2 * x * x - 3 * x, 0, 1.5) + 1.125)).toBeLessThan(1e-12);
  });
  it('∫₁^e ln x = 1', () => {
    expect(integrate(Math.log, 1, Math.E)).toBeCloseTo(1, 12);
  });
  it('∫₀^π sin x = 2', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 12);
  });
  it('∫₀^1 √x = 2/3 (Randsingularität)', () => {
    expect(Math.abs(integrate(Math.sqrt, 0, 1) - 2 / 3)).toBeLessThan(1e-8);
  });
  it('∫₀^1 1/√x = 2 (singulär)', () => {
    expect(Math.abs(integrate((x) => 1 / Math.sqrt(x), 0, 1) - 2)).toBeLessThan(1e-4);
  });
  it('a > b negiert, a == b ergibt 0', () => {
    expect(integrate(Math.sin, Math.PI, 0)).toBeCloseTo(-2, 12);
    expect(integrate(Math.sin, 1, 1)).toBe(0);
  });
  it('NaN/Infinity aus f -> math', () => {
    expect(kind(() => integrate(Math.log, -1, 1))).toBe('math');
    expect(kind(() => integrate(Math.sqrt, -1, 1))).toBe('math');
    expect(kind(() => integrate((x) => 1 / x, 0, 1))).toBe('timeout'); // divergent
  });
  it('nicht konvergierend -> timeout', () => {
    expect(kind(() => integrate((x) => Math.sin(1 / x) / x, 1e-9, 1))).toBe('timeout');
  });
  it('oszillierend ∫₀^2π sin = 0', () => {
    expect(Math.abs(integrate(Math.sin, 0, 2 * Math.PI))).toBeLessThan(1e-12);
  });
});

describe('derivative', () => {
  it('d/dx (2x²−3x) bei 3 = 9', () => {
    expect(Math.abs(derivative((x) => 2 * x * x - 3 * x, 3) - 9)).toBeLessThan(1e-9);
  });
  it('d/dx sin x bei π/2 = 0', () => {
    expect(Math.abs(derivative(Math.sin, Math.PI / 2))).toBeLessThan(1e-9);
  });
  it('d/dx eˣ bei 1 = e', () => {
    expect(Math.abs(derivative(Math.exp, 1) - Math.E)).toBeLessThan(1e-8);
  });
  it('d/dx ln x bei 0,001 = 1000', () => {
    expect(Math.abs(derivative(Math.log, 0.001) - 1000) / 1000).toBeLessThan(1e-7);
  });
  it('außerhalb des Definitionsbereichs -> math', () => {
    expect(kind(() => derivative(Math.sqrt, -5))).toBe('math');
  });
});

describe('solve', () => {
  const g = (x: number): number => Math.log(x) - x / 4;
  const cubic = (x: number): number => -2 * x ** 3 + 4 * x ** 2 - 2;

  it('ln x − x/4, Start 0 -> 1,429611825', () => {
    const r = solve(g, 0);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - 1.429611825)).toBeLessThan(5e-10);
    expect(Math.abs(r.lr)).toBeLessThan(1e-9);
  });
  it('ln x − x/4, Start 8 -> 8,613169456', () => {
    const r = solve(g, 8);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - 8.613169456)).toBeLessThan(5e-10);
  });
  it('kubisch: Start 1, −1, 2', () => {
    expect(Math.abs(solve(cubic, 1).x - 1)).toBeLessThan(1e-9);
    expect(Math.abs(solve(cubic, -1).x + 0.6180339887)).toBeLessThan(1e-9);
    expect(Math.abs(solve(cubic, 2).x - 1.6180339887)).toBeLessThan(1e-9);
  });
  it('kubisch: Start 0 (Ableitung 0) -> irgendeine Wurzel', () => {
    const r = solve(cubic, 0);
    expect(r.converged).toBe(true);
    const roots = [1, -0.6180339887, 1.6180339887];
    expect(roots.some((q) => Math.abs(r.x - q) < 1e-8)).toBe(true);
  });
  it('0 − d/dx(−2x³+4x²), Start 1 -> 4/3', () => {
    const r = solve((x) => 0 - derivative((t) => -2 * t ** 3 + 4 * t ** 2, x), 1);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - 4 / 3)).toBeLessThan(1e-7);
  });
  it('x² − 2 -> √2, x³ = 27 -> 3', () => {
    expect(Math.abs(solve((x) => x * x - 2, 1).x - Math.SQRT2)).toBeLessThan(1e-12);
    const r = solve((x) => x ** 3 - 27, 0);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.x - 3)).toBeLessThan(1e-9);
  });
  it('x² + 1 = 0 -> nicht konvergiert', () => {
    const r = solve((x) => x * x + 1, 1);
    expect(r.converged).toBe(false);
    expect(Number.isFinite(r.x)).toBe(true);
  });
  it('f nirgends endlich -> noSolution', () => {
    expect(kind(() => solve(() => NaN, 1))).toBe('noSolution');
  });
  it('Fortsetzen mit bestem x als Start', () => {
    const r = solve((x) => x - 1e6, 0, { maxIter: 3 });
    const r2 = solve((x) => x - 1e6, r.x);
    expect(Math.abs(r2.x - 1e6)).toBeLessThan(1e-4);
  });
});

describe('polyRoots', () => {
  const cmp = (a: { re: number; im: number }[], b: [number, number][]): void => {
    expect(a.length).toBe(b.length);
    a.forEach((z, i) => {
      expect(z.re).toBeCloseTo(b[i][0], 10);
      expect(z.im).toBeCloseTo(b[i][1], 10);
    });
  };
  it('4x²−5x−7', () => {
    const s = Math.sqrt(137);
    cmp(polyRoots([4, -5, -7]), [[(5 - s) / 8, 0], [(5 + s) / 8, 0]]);
  });
  it('x²+2x−2', () => {
    const s = Math.sqrt(3);
    cmp(polyRoots([1, 2, -2]), [[-1 - s, 0], [-1 + s, 0]]);
  });
  it('x³−6x²+11x−6 -> 1,2,3', () => {
    cmp(polyRoots([1, -6, 11, -6]), [[1, 0], [2, 0], [3, 0]]);
  });
  it('(x−1)²(x+2) -> 1 und −2', () => {
    // x³ − 3x + 2
    const r = polyRoots([1, 0, -3, 2]);
    cmp(r, [[-2, 0], [1, 0]]);
  });
  it('x⁴−1 -> −1, 1, i, −i', () => {
    cmp(polyRoots([1, 0, 0, 0, -1]), [[-1, 0], [1, 0], [0, 1], [0, -1]]);
  });
  it('x²+1 -> ±i', () => {
    cmp(polyRoots([1, 0, 1]), [[0, 1], [0, -1]]);
  });
  it('3x³+3x²−x -> 0 und zwei reelle', () => {
    const s = Math.sqrt(21);
    cmp(polyRoots([3, 3, -1, 0]), [[(-3 - s) / 6, 0], [0, 0], [(-3 + s) / 6, 0]]);
  });
  it('x⁴−10x²+9 -> ±1, ±3', () => {
    cmp(polyRoots([1, 0, -10, 0, 9]), [[-3, 0], [-1, 0], [1, 0], [3, 0]]);
  });
  it('(x²+1)² -> i, −i', () => {
    cmp(polyRoots([1, 0, 2, 0, 1]), [[0, 1], [0, -1]]);
  });
  it('(x−1)³ -> 1 (dreifach)', () => {
    cmp(polyRoots([1, -3, 3, -1]), [[1, 0]]);
  });
  it('gemischt reell/komplex: (x−2)(x²+2x+5)', () => {
    cmp(polyRoots([1, 0, 1, -10]), [[2, 0], [-1, 2], [-1, -2]]);
  });
  it('ungültige Eingabe -> math', () => {
    expect(kind(() => polyRoots([0, 1, 2]))).toBe('math');
  });
});
