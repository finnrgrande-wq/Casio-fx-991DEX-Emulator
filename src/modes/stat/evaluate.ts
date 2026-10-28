// Auswertung auf dem Bildschirm für statistische Berechnungen.
// Statistische Variablen sind Token „stat:…“, die der Auswerter über getVar auflöst. Befehle mit Argument davor
// (ŷ, x̂, t) werden am Ende des Terms, P(…), Q(…), R(…) an beliebiger Stelle vorab berechnet und durch
// Zwischenvariablen ersetzt.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { parse } from '../../core/parser/parser';
import { StatError } from '../../core/stats/stats';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { opensParen, type Item, type Slot } from '../../editor/model';
import { STAT_TEMPS } from '../../editor/tokens';
import { NORMAL_FUNCS, POSTFIX_CMDS, VAR_BY_ID, StatCalc } from './data';

const PFX = 'stat:';

/** Wandelt Fehler der Statistikfunktionen in Rechenfehler um (andere Fehler gibt es nicht zurück). */
export function asCalcError(e: unknown): CalcError | undefined {
  if (e instanceof CalcError) return e;
  if (e instanceof StatError) return new CalcError(e.kind);
  return undefined;
}

/** Zahl als Wert: ganze Zahlen exakt, sonst Gleitkomma; nicht endliche Werte sind ein mathematischer Fehler. */
export function numValue(x: number): Value {
  if (!Number.isFinite(x)) throw new CalcError('math');
  return Number.isInteger(x) && Math.abs(x) < 2 ** 53 ? V.int(x) : V.fl(x);
}

const tokOf = (it: Item | undefined): string | undefined => (it?.kind === 'tok' ? it.tok : undefined);

/** Wertet einen Term (Folge von Token) mit statistischen Variablen aus. Wirft CalcError oder StatError. */
export function evalStatSlot(root: Slot, stat: StatCalc, ctx: EvalContext): Value {
  if (root.length === 0) throw new CalcError('syntax');

  const last = tokOf(root[root.length - 1]);
  const cmd = POSTFIX_CMDS.find((e) => PFX + e.id === last);
  if (cmd) {
    const arg = V.toNumber(evalStatSlot(root.slice(0, -1), stat, ctx));
    return numValue(cmd.apply(stat, arg));
  }

  const temps: Value[] = [];
  const pre = rewriteNormal(root, stat, ctx, temps);
  const ev = new Evaluator({
    ...ctx,
    getVar(name) {
      if (!name.startsWith(PFX)) return ctx.getVar(name);
      if (name.startsWith(`${PFX}#`)) return temps[Number(name.slice(PFX.length + 1))];
      const e = VAR_BY_ID.get(name.slice(PFX.length));
      if (!e || (e.paired && !stat.paired)) throw new CalcError('syntax');
      return numValue(e.get(stat));
    },
  });
  const [st, ...rest] = parse(pre);
  if (rest.length > 0 || st.kind !== 'expr') throw new CalcError('syntax');
  return ev.eval(st.expr);
}

/** Ersetzt P(…), Q(…), R(…) durch Zwischenvariablen mit dem berechneten Wert. */
function rewriteNormal(root: Slot, stat: StatCalc, ctx: EvalContext, temps: Value[]): Slot {
  const out: Slot = [];
  for (let i = 0; i < root.length; i++) {
    const tok = tokOf(root[i]);
    const fn = NORMAL_FUNCS.find((e) => PFX + e.id === tok);
    if (!fn) {
      out.push(root[i]);
      continue;
    }
    // zugehörige schließende Klammer suchen (fehlt sie, gilt der Rest als Argument)
    let depth = 1;
    let j = i + 1;
    for (; j < root.length && depth > 0; j++) {
      const t = tokOf(root[j]);
      if (t !== undefined && opensParen(t)) depth++;
      else if (t === ')') depth--;
    }
    const inner = root.slice(i + 1, depth === 0 ? j - 1 : j);
    if (temps.length >= STAT_TEMPS) throw new CalcError('stack');
    const t = V.toNumber(evalStatSlot(inner, stat, ctx));
    temps.push(numValue(fn.apply(t)));
    out.push({ kind: 'tok', tok: `${PFX}#${temps.length - 1}` });
    i = j - 1;
  }
  return out;
}
