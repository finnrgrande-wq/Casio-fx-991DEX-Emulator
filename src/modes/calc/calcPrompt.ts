// CALC: fragt die Variablen eines Terms nacheinander ab (▲▼ wählt), dann folgt das Ergebnis.
// „y=…“ berechnet die rechte Seite und weist sie y zu.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { decimalForm, exactForm } from '../../core/format/result';
import type { Statement } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { Cursor, Slot } from '../../editor/model';
import type { VarName } from '../../calculator/state';
import type { Host, KeyEvent, Screen } from '../screen';
import { ValueInput, errorScene, variableLine } from './prompt';

export interface PromptOwner {
  context(): EvalContext;
  /** Rückkehr in die Eingabe; optional mit Cursor an einer Fehlerstelle. */
  resume(input: Slot, at?: Cursor): void;
}

type Phase = 'prompt' | 'result' | 'error';

export class CalcPrompt implements Screen {
  private phase: Phase = 'prompt';
  private index = 0;
  private readonly input = new ValueInput();
  private result: { value: Value; exact?: ResultForm; decimal: ResultForm; showExact: boolean } | undefined;
  private error: CalcError | undefined;
  /** Fehler in der Werteingabe (statt im Term) führen zurück zur Abfrage. */
  private errorInPrompt = false;

  constructor(
    private readonly host: Host,
    private readonly owner: PromptOwner,
    private readonly source: Slot,
    private readonly statements: Statement[],
    private readonly vars: string[],
  ) {}

  private value(name: string): Value {
    return V.deserialize(this.host.state.vars[name as VarName]);
  }

  handle(ev: KeyEvent): boolean {
    const a = ev.action;
    if (this.phase === 'error') {
      if (a === 'sys:ac') this.phase = 'prompt';
      else if ((a === 'nav:left' || a === 'nav:right') && !this.errorInPrompt) this.exit(this.error?.at);
      else if (a === 'nav:left' || a === 'nav:right') this.phase = 'prompt';
      return true;
    }
    if (a === 'sys:ac') {
      this.exit();
      return true;
    }
    if (this.phase === 'result') {
      if (a === 'cmd:calc' || a === 'cmd:exe') this.restart();
      else if (a === 'cmd:sd' && this.result?.exact) this.result.showExact = !this.result.showExact;
      return true;
    }
    if (!a) return true;
    if (a === 'nav:up' || a === 'nav:down' || a === 'cmd:exe') {
      if (!this.commit()) return true;
      if (a === 'nav:up') this.index = Math.max(0, this.index - 1);
      else if (this.index < this.vars.length - 1) this.index++;
      else if (a === 'cmd:exe') this.compute();
      return true;
    }
    if (a === 'cmd:calc') {
      this.restart();
      return true;
    }
    this.input.handle(a);
    return true;
  }

  /** Übernimmt eine laufende Eingabe in die aktuelle Variable. */
  private commit(): boolean {
    try {
      const v = this.input.commit(this.owner.context());
      if (v) {
        this.host.state.vars[this.vars[this.index] as VarName] = V.serialize(v);
        this.host.persist();
      }
      return true;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.errorInPrompt = true;
      this.phase = 'error';
      return false;
    }
  }

  private restart(): void {
    this.phase = 'prompt';
    this.index = 0;
    this.input.cancel();
  }

  private compute(): void {
    const st = this.host.state;
    try {
      const ev = new Evaluator(this.owner.context());
      let value: Value = V.ZERO;
      for (const s of this.statements) {
        if (s.kind === 'eq') {
          if (s.l.t !== 'var') throw new CalcError('syntax', s.l.at);
          value = ev.eval(s.r);
          st.vars[s.l.name as VarName] = V.serialize(value);
        } else value = ev.eval(s.expr);
      }
      st.ans = V.serialize(value);
      this.host.persist();
      const exact = exactForm(value, st.settings);
      this.result = { value, exact, decimal: decimalForm(value, st.settings), showExact: st.settings.io === 'mathMath' && !!exact };
      this.phase = 'result';
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.errorInPrompt = false;
      this.phase = 'error';
    }
  }

  private exit(at?: Cursor): void {
    this.host.pop();
    this.owner.resume(this.source, at);
  }

  render(): Scene {
    if (this.phase === 'error') return errorScene(this.error!.message);
    const ops: DrawOp[] = [];
    const term = layoutInput(this.source, null, 'math');
    ops.push(...translate(term, 0, 0));
    if (this.phase === 'result' && this.result) {
      const r = this.result;
      const lay = layoutResult(r.showExact && r.exact ? r.exact : r.decimal, 'math');
      ops.push(...translate(lay, Math.max(0, LCD_WIDTH - lay.w), LCD_HEIGHT - lay.h));
      return { ops };
    }
    const name = this.vars[this.index];
    const line = variableLine(name, this.value(name), this.input, LCD_HEIGHT - 16);
    // Platz für die Abfragezeile freihalten
    ops.push({ kind: 'rect', x: 0, y: LCD_HEIGHT - 16, w: LCD_WIDTH, h: 16, fill: true, erase: true });
    return {
      ops: [...ops, ...line.ops],
      cursor: line.cursor,
      status: { up: this.index > 0, down: this.index < this.vars.length - 1 },
    };
  }

  /** Für Tests: angezeigtes Ergebnis bzw. abgefragte Variable. */
  get state(): { phase: Phase; variable?: string; result?: ResultForm } {
    const r = this.result;
    return {
      phase: this.phase,
      variable: this.phase === 'prompt' ? this.vars[this.index] : undefined,
      result: this.phase === 'result' && r ? (r.showExact && r.exact ? r.exact : r.decimal) : undefined,
    };
  }
}
