import { describe, expect, it } from 'vitest';
import { CalcError } from '../../src/core/errors';
import { Rational } from '../../src/core/exact/rational';
import * as V from '../../src/core/value';
import type { Value } from '../../src/core/value';
import {
  angle, cross, det, dot, identity, inverse, mabs, madd, mat, mmul, mpow, msub, mscale, ref, rref, transpose,
  unitVector, vabs, vadd, vec, vscale, vsub, type Matrix,
} from '../../src/core/linalg/matrix';
import { solveLinear } from '../../src/core/linalg/linsolve';

const i = (n: number) => V.int(n);
const q = (n: number, d: number) => V.rat(Rational.of(BigInt(n), BigInt(d)));
const M = (rows: number[][]) => mat(rows.map((r) => r.map(i)));

/** Exakter Vergleich zweier Werte. */
function same(a: Value, b: Value): boolean {
  return a.k === 's' && b.k === 's' && a.s.equals(b.s);
}
/** Matrix gegen erwartete Werte (Zahl oder [Zähler, Nenner]). */
function expectMat(A: Matrix, exp: (number | [number, number])[][]) {
  expect(A.rows).toBe(exp.length);
  expect(A.cols).toBe(exp[0].length);
  exp.forEach((row, r) =>
    row.forEach((e, c) => {
      const want = typeof e === 'number' ? i(e) : q(e[0], e[1]);
      expect(same(A.a[r][c], want), `[${r}][${c}]`).toBe(true);
    }),
  );
}
const throwsKind = (f: () => unknown, kind: string) => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(CalcError); expect((e as CalcError).kind).toBe(kind); return; }
  throw new Error('kein Fehler');
};

describe('Matrix', () => {
  const A3 = M([[2, 1, -1], [5, 3, 0], [4, -2, 5]]);

  it('Determinante 3x3 exakt', () => {
    expect(same(det(A3), i(27))).toBe(true);
  });

  it('Inverse exakt: A·A⁻¹ = I', () => {
    const inv = inverse(A3);
    expectMat(mmul(A3, inv), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expectMat(mmul(inv, A3), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(inv.a.some((r) => r.some((x) => x.k === 's' && x.s.toRational()?.den !== 1n))).toBe(true);
  });

  const A = M([[2, 1], [1, 1]]);
  const B = M([[2, -1], [-1, 2]]);
  it('Grundrechenarten', () => {
    expectMat(mmul(A, B), [[3, 0], [1, 1]]);
    expectMat(madd(A, B), [[4, 0], [0, 3]]);
    expectMat(msub(A, B), [[0, 2], [2, -1]]);
    expectMat(mscale(i(3), A), [[6, 3], [3, 3]]);
    expect(same(det(A), i(1))).toBe(true);
    expectMat(inverse(A), [[1, -1], [-1, 2]]);
  });

  it('Potenzen, Einheitsmatrix, Transponierte, Abs', () => {
    expectMat(mpow(A, 2), [[5, 3], [3, 2]]);
    expectMat(mpow(A, 3), [[13, 8], [8, 5]]);
    expectMat(mpow(A, 0), [[1, 0], [0, 1]]);
    expectMat(madd(identity(2), A), [[3, 1], [1, 2]]);
    expectMat(transpose(M([[1, 0, -1], [0, -1, 1]])), [[1, 0], [0, -1], [-1, 1]]);
    expectMat(mabs(M([[1, -2], [-3, 4]])), [[1, 2], [3, 4]]);
  });

  it('Ref und Rref', () => {
    const C = M([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expectMat(rref(C), [[1, 0, -1], [0, 1, 2], [0, 0, 0]]);
    // Pivot = betragsgrößter Eintrag (7), führende 1
    expectMat(ref(C), [[1, [8, 7], [9, 7]], [0, 1, 2], [0, 0, 0]]);
  });

  it('Fehler', () => {
    throwsKind(() => mmul(M([[1, 2]]), M([[1, 2]])), 'dimension');
    throwsKind(() => madd(A, M([[1, 2, 3]])), 'dimension');
    throwsKind(() => det(M([[1, 2, 3]])), 'dimension');
    throwsKind(() => inverse(M([[1, 2, 3]])), 'dimension');
    throwsKind(() => mpow(M([[1, 2]]), 2), 'dimension');
    throwsKind(() => inverse(M([[1, 2], [2, 4]])), 'math');
    throwsKind(() => mat([]), 'dimension');
    throwsKind(() => M([[1, 2, 3, 4, 5]]), 'dimension');
  });

  it('4x4 und Gleitkomma', () => {
    const D = M([[2, 0, 0, 1], [0, 3, 0, 0], [0, 0, 4, 0], [1, 0, 0, 5]]);
    expect(same(det(D), i(3 * 4 * 9))).toBe(true);
    expectMat(mmul(D, inverse(D)), [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
    const F = mat([[V.fl(0.5), i(1)], [i(1), V.fl(2.5)]]);
    expect(V.toNumber(det(F))).toBeCloseTo(0.25, 12);
    const Fi = mmul(F, inverse(F));
    expect(V.toNumber(Fi.a[0][0])).toBeCloseTo(1, 12);
    expect(V.toNumber(Fi.a[0][1])).toBeCloseTo(0, 12);
  });
});

describe('Vektor', () => {
  const A = vec(i(1), i(2));
  const B = vec(i(3), i(4));
  const C = vec(i(2), i(-1), i(2));

  it('Grundrechenarten', () => {
    const s = vadd(A, B);
    expect(same(s.v[0], i(4)) && same(s.v[1], i(6))).toBe(true);
    const d = vsub(A, B);
    expect(same(d.v[0], i(-2)) && same(d.v[1], i(-2))).toBe(true);
    const k = vscale(i(2), A);
    expect(same(k.v[0], i(2)) && same(k.v[1], i(4))).toBe(true);
    expect(same(dot(A, B), i(11))).toBe(true);
    expect(same(vabs(C), i(3))).toBe(true);
  });

  it('Winkel', () => {
    expect(V.toNumber(angle(A, B, 'D'))).toBeCloseTo(10.30484647, 7);
    expect(V.toNumber(angle(vec(i(1), i(0)), vec(i(0), i(1)), 'D'))).toBeCloseTo(90, 10);
    expect(same(angle(vec(i(1), i(0)), vec(i(1), i(1)), 'D'), i(45))).toBe(true); // exakter Sonderfall
  });

  it('Einheitsvektor exakt', () => {
    const u = unitVector(B);
    expect(same(u.v[0], q(3, 5)) && same(u.v[1], q(4, 5))).toBe(true);
  });

  it('Kreuzprodukt', () => {
    const c = cross(vec(i(1), i(2), i(3)), vec(i(4), i(5), i(6)));
    expect(c.v.map((x) => V.toNumber(x))).toEqual([-3, 6, -3]);
    throwsKind(() => cross(A, B), 'dimension');
    throwsKind(() => dot(A, C), 'dimension');
    throwsKind(() => vadd(A, C), 'dimension');
  });

  it('Kurzanleitung VctA = (3,-2,1)', () => {
    const a = vec(i(3), i(-2), i(1));
    expect(a.n).toBe(3);
    expect(same(dot(a, a), i(14))).toBe(true);
    expect(V.toNumber(vabs(a))).toBeCloseTo(Math.sqrt(14), 12);
  });
});

describe('solveLinear', () => {
  const R = (rows: number[][]) => rows.map((r) => r.map(i));

  it('2x2 eindeutig', () => {
    const r = solveLinear(R([[1, 2, 3], [2, 3, 4]]));
    expect(r.kind).toBe('unique');
    if (r.kind === 'unique') {
      expect(same(r.x[0], i(-1))).toBe(true);
      expect(same(r.x[1], i(2))).toBe(true);
    }
  });

  it('3x3 mit Bruchlösung', () => {
    // 2x + y + z = 1; x + 3y + 2z = 2; x + y + 4z = 0  → Lösung als Brüche
    const rows = R([[2, 1, 1, 1], [1, 3, 2, 2], [1, 1, 4, 0]]);
    const r = solveLinear(rows);
    expect(r.kind).toBe('unique');
    if (r.kind !== 'unique') return;
    expect(r.x.some((x) => x.k === 's' && x.s.toRational()?.den !== 1n)).toBe(true);
    for (const row of rows) {
      const lhs = row.slice(0, 3).reduce((s, c, j) => V.add(s, V.mul(c, r.x[j])), V.ZERO);
      expect(same(lhs, row[3])).toBe(true);
    }
  });

  it('4x4 exakt, Probe durch Einsetzen', () => {
    const sol = [3, -2, 5, 7];
    const co = [[2, 1, -1, 3], [1, -3, 2, 1], [4, 2, 1, -2], [0, 5, -1, 2]];
    const rows = co.map((r) => [...r, r.reduce((s, c, j) => s + c * sol[j], 0)]);
    const r = solveLinear(R(rows));
    expect(r.kind).toBe('unique');
    if (r.kind === 'unique') r.x.forEach((x, j) => expect(same(x, i(sol[j]))).toBe(true));
    // Pivot nicht in der ersten Zeile
    const r2 = solveLinear(R([[0, 1, 2], [1, 1, 3]]));
    expect(r2.kind).toBe('unique');
  });

  it('abhängig und widersprüchlich', () => {
    expect(solveLinear(R([[1, 2, 3], [2, 4, 6]])).kind).toBe('infinite');
    expect(solveLinear(R([[1, 2, 3], [2, 4, 7]])).kind).toBe('none');
    expect(solveLinear(R([[1, 1, 1, 6], [2, 2, 2, 12], [1, 2, 3, 14]])).kind).toBe('infinite');
    expect(solveLinear(R([[1, 1, 1, 6], [1, 1, 1, 7], [1, 2, 3, 14]])).kind).toBe('none');
  });

  it('Formfehler', () => {
    throwsKind(() => solveLinear(R([[1, 2]])), 'dimension');
    throwsKind(() => solveLinear(R([[1, 2], [3, 4]])), 'dimension');
  });
});
