// SOLVE: Variablenliste unter der Gleichung; der Balken markiert die Lösungsvariable,
// ihr Wert ist der Startwert. = löst (Newton mit Rückfallverfahren) und zeigt x= und L−R=.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { round15 } from '../../core/format/number';
import { NumericError } from '../../core/numeric/errors';
import { solve } from '../../core/numeric/solve';
import type { Node, Statement } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { Cursor, Slot } from '../../editor/model';
import type { VarName } from '../../calculator/state';
import type { Host, KeyEvent, Screen } from '../screen';
import type { PromptOwner } from './calcPrompt';
import { ValueInput, errorScene, shortValue, variableLine, varLabel } from './prompt';

type Phase = 'list' | 'result' | 'continue' | 'error';

export class SolveScreen implements Screen {
  private phase: Phase = 'list';
  private index = 0;
  private top = 0;
  private readonly input = new ValueInput();
  private error: CalcError | undefined;
  private solution: { x: Value; lr: Value } | undefined;
  private readonly left: Node;
  private readonly right: Node;

  constructor(
    private readonly host: Host,
    private readonly owner: PromptOwner,
    private readonly source: Slot,
    statement: Statement,
    private readonly vars: string[],
  ) {
    if (statement.kind === 'eq') {
      this.left = statement.l;
      this.right = statement.r;
    } else {
      // Ein Term ohne „=“ gilt als Term = 0
      this.left = statement.expr;
      this.right = { t: 'num', digits: '0', frac: '', at: statement.expr.at };
    }
  }

  private value(name: string): Value {
    return V.deserialize(this.host.state.vars[name as VarName]);
  }

  private get target(): string {
    return this.vars[this.index];
  }

  handle(ev: KeyEvent): boolean {
    const a = ev.action;
    switch (this.phase) {
      case 'error':
        if (a === 'sys:ac') this.phase = 'list';
        return true;
      case 'continue':
        if (a === 'cmd:exe') this.run();
        else if (a === 'sys:ac') this.phase = 'list';
        return true;
      case 'result':
        if (a === 'cmd:exe' || a === 'cmd:solve') this.phase = 'list';
        else if (a === 'sys:ac') this.exit();
        return true;
    }
    if (!a) return true;
    if (a === 'sys:ac') {
      if (this.input.editing) this.input.cancel();
      else this.exit();
      return true;
    }
    if (a === 'nav:up' || a === 'nav:down') {
      if (!this.commit()) return true;
      const n = this.vars.length;
      this.index = (this.index + (a === 'nav:down' ? 1 : n - 1)) % n;
      return true;
    }
    if (a === 'cmd:exe' || a === 'cmd:solve') {
      if (this.commit()) this.run();
      return true;
    }
    this.input.handle(a);
    return true;
  }

  private commit(): boolean {
    try {
      const v = this.input.commit(this.owner.context());
      if (v) {
        this.host.state.vars[this.target as VarName] = V.serialize(v);
        this.host.persist();
      }
      return true;
    } catch (e) {
      return this.fail(e);
    }
  }

  private fail(e: unknown): false {
    if (e instanceof NumericError) e = new CalcError(e.kind === 'noSolution' ? 'noSolution' : 'math');
    if (!(e instanceof CalcError)) throw e;
    this.error = e;
    this.phase = 'error';
    return false;
  }

  private run(): void {
    const ctx: EvalContext = this.owner.context();
    const ev = new Evaluator(ctx);
    const name = this.target;
    const sides = (t: number): [number, number] => {
      const bind = new Map([[name, V.fl(t)]]);
      return [V.toNumber(ev.eval(this.left, bind)), V.toNumber(ev.eval(this.right, bind))];
    };
    const f = (t: number) => {
      try {
        const [l, r] = sides(t);
        return l - r;
      } catch {
        return NaN;
      }
    };
    try {
      const start = V.toNumber(this.value(name));
      const res = solve(f, start);
      const x = round15(res.x);
      this.host.state.vars[name as VarName] = V.serialize(V.fl(x));
      this.host.persist();
      if (!res.converged) {
        this.phase = 'continue';
        return;
      }
      const [l, r] = sides(x);
      // Rechenreste unterhalb der internen 15 Stellen gelten als 0 (wie am Original)
      let lr = round15(round15(l) - round15(r));
      if (Math.abs(lr) <= 1e-12 * Math.max(1, Math.abs(l), Math.abs(r))) lr = 0;
      this.solution = { x: V.fl(x), lr: V.fl(lr) };
      this.phase = 'result';
    } catch (e) {
      this.fail(e);
    }
  }

  private exit(at?: Cursor): void {
    this.host.pop();
    this.owner.resume(this.source, at);
  }

  render(): Scene {
    if (this.phase === 'error') return errorScene(this.error!.message);
    const ops: DrawOp[] = [];
    const eq = layoutInput(this.source, null, 'math');
    ops.push(...translate(eq, 0, 0));
    const firstRow = Math.max(16, Math.ceil(eq.h / 16) * 16);
    const rows = Math.max(1, Math.floor((LCD_HEIGHT - firstRow) / 16));
    const at = (k: number) => LCD_HEIGHT - rows * 16 + k * 16;
    ops.push({ kind: 'rect', x: 0, y: at(0), w: LCD_WIDTH, h: rows * 16, fill: true, erase: true });

    if (this.phase === 'continue') {
      ops.push({ kind: 'text', x: 0, y: LCD_HEIGHT - 16, text: 'Fortfahren:[=]', font: 'L' });
      return { ops };
    }
    if (this.phase === 'result' && this.solution) {
      const lines: [string, Value][] = [[varLabel(this.target), this.solution.x], ['L−R', this.solution.lr]];
      lines.slice(-rows).forEach(([label, v], k) => {
        const y = at(rows === 1 ? 0 : k + rows - 2);
        ops.push({ kind: 'text', x: 0, y, text: `${label}=`, font: 'L' });
        ops.push({ kind: 'text', x: LCD_WIDTH - 1, y, text: shortValue(v), font: 'L', align: 'right' });
      });
      return { ops };
    }

    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + rows) this.top = this.index - rows + 1;
    let cursor: Scene['cursor'] = null;
    for (let k = 0; k < rows && this.top + k < this.vars.length; k++) {
      const i = this.top + k;
      const active = i === this.index;
      const line = variableLine(this.vars[i], this.value(this.vars[i]), active ? this.input : undefined, at(k), active);
      ops.push(...line.ops);
      if (line.cursor) cursor = line.cursor;
    }
    return { ops, cursor, status: { up: this.top > 0, down: this.top + rows < this.vars.length } };
  }

  /** Für Tests. */
  get state(): { phase: Phase; variable: string; x?: number; lr?: number; error?: string } {
    return {
      phase: this.phase,
      variable: this.target,
      x: this.solution && V.toNumber(this.solution.x),
      lr: this.solution && V.toNumber(this.solution.lr),
      error: this.error?.message,
    };
  }
}
