// Anwendung C „Berechn. prüfen“: Wahr/Falsch-Beurteilung von Gleichheiten und Ungleichheiten,
// auch mit mehreren Vergleichszeichen (1≤1<1+1).

import { CalcError } from '../../core/errors';
import { Evaluator } from '../../core/eval/evaluate';
import { Parser } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { Editor, type Cursor, type Slot } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';
import { evalContext } from '../../calculator/context';
import { ListMenu, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { applyInsertAction, continuesWithAns, isInsertAction } from '../calc/input';
import { errorScene } from '../calc/prompt';

type Phase = 'edit' | 'result' | 'error';
type Rel = '=' | '≠' | '>' | '<' | '≥' | '≤';

const RELATIONS: Rel[] = ['=', '≠', '>', '<', '≥', '≤'];

const isRel = (tok: string): boolean => TOKENS[tok]?.kind === 'eq';

/** Vergleich mit Toleranz für Gleitkommareste: −1, 0 oder 1. */
function compare(a: Value, b: Value): number {
  if (V.isZero(V.sub(a, b))) return 0;
  const x = V.toNumber(a);
  const y = V.toNumber(b);
  if (Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(x), Math.abs(y))) return 0;
  return x < y ? -1 : 1;
}

const holds = (rel: string, c: number): boolean => {
  switch (rel) {
    case '=': return c === 0;
    case '≠': return c !== 0;
    case '<': return c < 0;
    case '>': return c > 0;
    case '≤': return c <= 0;
    default: return c >= 0;
  }
};

export interface Verdict {
  ok: boolean;
  /** Rechte Seite (nur bei genau einem Vergleichszeichen), für die fortlaufende Beurteilung. */
  rhs?: Slot;
  rel?: Rel;
}

/** Beurteilt einen Ausdruck mit Vergleichszeichen. Wirft CalcError (Syntax, Mathem. Fehler …). */
export function judge(root: Slot, ctx: ReturnType<typeof evalContext>): Verdict {
  const parts: Slot[] = [[]];
  const rels: { tok: string; idx: number }[] = [];
  root.forEach((it, idx) => {
    if (it.kind === 'tok' && isRel(it.tok)) {
      rels.push({ tok: it.tok, idx });
      parts.push([]);
    } else parts[parts.length - 1].push(it);
  });
  const at = (idx: number): Cursor => ({ path: [], pos: idx });
  if (rels.length === 0) throw new CalcError('syntax', at(root.length));
  const toks = rels.map((r) => r.tok);
  const up = toks.some((t) => t === '<' || t === '≤');
  const down = toks.some((t) => t === '>' || t === '≥');
  if (toks.length > 1) {
    if (up && down) throw new CalcError('syntax', at(rels[toks.findIndex((t) => t === '>' || t === '≥')].idx));
    if (toks.includes('≠') && (up || down)) throw new CalcError('syntax', at(rels[toks.indexOf('≠')].idx));
  }
  const parser = new Parser();
  const ev = new Evaluator(ctx);
  const values = parts.map((p, k) => {
    if (p.length === 0) throw new CalcError('syntax', at(k === 0 ? 0 : rels[k - 1].idx + 1));
    return ev.eval(parser.parseSlot(p, []));
  });
  const ok = toks.every((t, k) => holds(t, compare(values[k], values[k + 1])));
  return rels.length === 1 ? { ok, rhs: parts[1], rel: toks[0] as Rel } : { ok };
}

export class VerifyScreen implements Screen {
  readonly editor = new Editor();
  private phase: Phase = 'edit';
  private verdict: Verdict | undefined;
  private shownInput: Slot = [];
  private error: CalcError | undefined;
  private scrollX = 0;

  constructor(private readonly host: Host) {}

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.phase === 'error') {
      if (a === 'sys:ac') {
        this.editor.clear();
        this.phase = 'edit';
      } else if (a === 'nav:left' || a === 'nav:right') {
        this.phase = 'edit';
        const at = this.error?.at;
        if (at && at.pos <= this.editor.slotAt(at.path).length) this.editor.setCursor(at);
      }
      return true;
    }
    if (!a) return false;
    switch (a) {
      case 'sys:ac':
        this.editor.clear();
        this.phase = 'edit';
        return true;
      case 'cmd:exe':
        if (this.phase === 'result') this.next();
        else this.execute();
        return true;
      case 'sys:optn':
        host.push(new ListMenu(this.menu()));
        return true;
    }
    if (this.phase === 'result') {
      switch (a) {
        case 'nav:left':
        case 'nav:right':
        case 'edit:del':
          this.editor.load(this.shownInput, a === 'nav:right');
          this.phase = 'edit';
          return true;
      }
      if (!isInsertAction(a)) return false;
      this.editor.clear();
      this.phase = 'edit';
      if (continuesWithAns(a)) this.editor.insertToken('Ans');
      return applyInsertAction(this.editor, a, false);
    }
    const ed = this.editor;
    switch (a) {
      case 'nav:left': ed.moveLeft(); return true;
      case 'nav:right': ed.moveRight(); return true;
      case 'nav:up': ed.moveVertical(-1); return true;
      case 'nav:down': ed.moveVertical(1); return true;
      case 'edit:del': ed.del(); return true;
      case 'edit:ins': ed.wrapNext = true; return true;
      case 'edit:undo': ed.undo(); return true;
    }
    return applyInsertAction(ed, a, false);
  }

  private menu(): MenuItem[] {
    return RELATIONS.map((r) => ({
      label: r,
      run: (h: Host) => {
        while (h.top !== this) h.pop();
        if (this.phase !== 'edit') {
          this.editor.clear();
          this.phase = 'edit';
        }
        this.editor.insertToken(r);
      },
    }));
  }

  private execute(): void {
    if (this.editor.isEmpty) return;
    const input = this.editor.snapshot().root;
    try {
      this.verdict = judge(input, evalContext(this.host.state));
      this.host.state.ans = V.serialize(this.verdict.ok ? V.ONE : V.ZERO);
      this.shownInput = input;
      this.editor.clear();
      this.phase = 'result';
      this.host.persist();
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
    }
  }

  /** = nach „Wahr“: rechte Seite als Anfang der nächsten Zeile. */
  private next(): void {
    const v = this.verdict;
    if (v?.ok && v.rhs && v.rel) {
      this.editor.load([...v.rhs, { kind: 'tok', tok: v.rel }]);
      this.phase = 'edit';
    } else {
      this.editor.load(this.shownInput);
      this.execute();
    }
  }

  render(): Scene {
    if (this.phase === 'error') return errorScene(this.error!.message);
    const ops: DrawOp[] = [];
    if (this.phase === 'edit') {
      const lay = layoutInput(this.editor.root, this.editor.cursor, 'math');
      const c = lay.cursor;
      if (c) {
        if (c.x - this.scrollX > LCD_WIDTH - 3) this.scrollX = c.x - (LCD_WIDTH - 3);
        if (c.x - this.scrollX < 0) this.scrollX = Math.max(0, c.x - 8);
      }
      if (lay.w <= LCD_WIDTH - 2) this.scrollX = 0;
      ops.push(...translate(lay, -this.scrollX, 0));
      return { ops, cursor: c ? { x: c.x - this.scrollX, y: c.y, h: c.h } : null };
    }
    ops.push(...translate(layoutInput(this.shownInput, null, 'math'), 0, 0));
    ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: LCD_HEIGHT - 16, text: this.verdict?.ok ? 'Wahr' : 'Falsch', font: 'L', align: 'right' });
    return { ops, cursor: null };
  }

  /** Für Tests. */
  get state(): { phase: Phase; text?: string; error?: string } {
    return {
      phase: this.phase,
      text: this.phase === 'result' ? (this.verdict?.ok ? 'Wahr' : 'Falsch') : undefined,
      error: this.phase === 'error' ? this.error?.message : undefined,
    };
  }
}
