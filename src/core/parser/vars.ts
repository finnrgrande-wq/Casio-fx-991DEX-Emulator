// Freie Variablen eines Ausdrucks in Reihenfolge des ersten Auftretens (für CALC und SOLVE).
// Die Laufvariable x im Term von ∫, d/dx, Σ und Π ist gebunden und wird nicht abgefragt.

import type { Node, Statement } from './parser';

export function freeVariables(statements: Statement[]): string[] {
  const seen: string[] = [];
  const visit = (n: Node, bound: ReadonlySet<string>): void => {
    switch (n.t) {
      case 'var':
        if (!bound.has(n.name) && !seen.includes(n.name)) seen.push(n.name);
        return;
      case 'num':
        if (n.exp) visit(n.exp, bound);
        return;
      case 'const':
        return;
      case 'neg':
      case 'post':
      case 'conv':
        visit(n.arg, bound);
        return;
      case 'bin':
        visit(n.l, bound);
        visit(n.r, bound);
        return;
      case 'dms':
        n.parts.forEach((p) => visit(p, bound));
        return;
      case 'pow':
        visit(n.base, bound);
        visit(n.exp, bound);
        return;
      case 'call':
        n.args.forEach((a) => visit(a, bound));
        return;
      case 'tpl': {
        const binds = n.type === 'integral' || n.type === 'deriv' || n.type === 'sum' || n.type === 'prod';
        n.args.forEach((a, i) => visit(a, binds && i === 0 ? new Set([...bound, 'x']) : bound));
      }
    }
  };
  for (const st of statements) {
    if (st.kind === 'eq') {
      visit(st.l, new Set());
      visit(st.r, new Set());
    } else visit(st.expr, new Set());
  }
  return seen;
}
