// Anwendung D „Verhältnisse“: A:B = X:D bzw. A:B = C:X mit Koeffizienten-Editor.

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { evalContext } from '../../calculator/context';
import { ListMenu, closeMenus } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';

type Phase = 'type' | 'editor' | 'solution' | 'error';

interface Stored {
  type: 1 | 2;
  vals: V.SerializedValue[];
}

const NAMES = ['A', 'B', 'C', 'D'];
/** Welche Koeffizienten je Typ eingegeben werden (Index in NAMES). */
const FIELDS: Record<1 | 2, number[]> = { 1: [0, 1, 3], 2: [0, 1, 2] };

export class RatioScreen implements Screen {
  private phase: Phase = 'type';
  private type: 1 | 2 = 1;
  private vals: Value[] = [V.ONE, V.ONE, V.ONE, V.ONE];
  private sel = 0;
  private readonly input = new ValueInput();
  private result: Value = V.ZERO;
  private showExact = true;
  private error: CalcError | undefined;

  constructor(private readonly host: Host) {
    const stored = host.state.modeData.ratio as Stored | undefined;
    if (stored) {
      this.type = stored.type;
      this.vals = stored.vals.map((v) => V.deserialize(v));
      this.phase = 'editor';
    }
  }

  private save(): void {
    const data: Stored = { type: this.type, vals: this.vals.map(V.serialize) };
    this.host.state.modeData.ratio = data;
    this.host.persist();
  }

  private setType(t: 1 | 2): void {
    this.type = t;
    this.sel = 0;
    this.phase = 'editor';
    this.save();
  }

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (a === 'sys:optn' && this.phase !== 'type') {
      const pick = (t: 1 | 2) => (h: Host) => (closeMenus(h), this.setType(t));
      host.push(
        new ListMenu([{ label: 'Typ auswählen', sub: [{ label: 'A:B=X:D', run: pick(1) }, { label: 'A:B=C:X', run: pick(2) }] }]),
      );
      return true;
    }
    switch (this.phase) {
      case 'type':
        if (ev.key === 'D1') this.setType(1);
        else if (ev.key === 'D2') this.setType(2);
        return true;
      case 'editor':
        return this.handleEditor(a);
      case 'solution':
        if (a === 'cmd:exe' || a === 'sys:ac') this.phase = 'editor';
        else if (a === 'cmd:sd') this.showExact = !this.showExact;
        return true;
      case 'error':
        if (a === 'sys:ac' || a === 'cmd:exe') this.phase = 'editor';
        return true;
    }
  }

  private handleEditor(a: string | undefined): boolean {
    if (!a) return true;
    const n = FIELDS[this.type].length;
    switch (a) {
      case 'sys:ac':
        if (this.input.editing) this.input.cancel();
        else {
          // AC setzt alle Koeffizienten auf 1
          this.vals = this.vals.map(() => V.ONE);
          this.save();
        }
        return true;
      case 'cmd:exe':
        if (this.input.editing) {
          if (this.commit() && this.sel < n - 1) this.sel++;
        } else this.solve();
        return true;
      case 'nav:up':
      case 'nav:down':
      case 'nav:left':
      case 'nav:right':
        if (this.input.editing && (a === 'nav:left' || a === 'nav:right')) return this.input.handle(a);
        if (!this.commit()) return true;
        if (a === 'nav:right' || a === 'nav:down') this.sel = Math.min(n - 1, this.sel + 1);
        else this.sel = Math.max(0, this.sel - 1);
        return true;
    }
    this.input.handle(a);
    return true;
  }

  private commit(): boolean {
    try {
      const v = this.input.commit(evalContext(this.host.state));
      if (v) {
        this.vals[FIELDS[this.type][this.sel]] = v;
        this.save();
      }
      return true;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
      return false;
    }
  }

  private solve(): void {
    const [A, B, C, D] = this.vals;
    try {
      if (FIELDS[this.type].some((i) => V.isZero(this.vals[i]))) throw new CalcError('math');
      this.result = this.type === 1 ? V.div(V.mul(A, D), B) : V.div(V.mul(B, C), A);
      this.showExact = this.host.state.settings.io === 'mathMath';
      this.phase = 'solution';
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
    }
  }

  // --- Anzeige ---

  render(): Scene {
    switch (this.phase) {
      case 'type':
        return { ops: ['1:A:B=X:D', '2:A:B=C:X'].map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
      case 'error':
        return errorScene(this.error!.message);
      case 'solution': {
        const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: 'X=', font: 'L' }];
        const lay = layoutResult(this.form(), 'math');
        ops.push(...translate(lay, Math.max(0, LCD_WIDTH - lay.w), LCD_HEIGHT - lay.h));
        return { ops };
      }
      case 'editor':
        return this.renderEditor();
    }
  }

  private renderEditor(): Scene {
    const ops: DrawOp[] = [];
    const fields = FIELDS[this.type];
    const cell = (idx: number | undefined, x: number, y: number) => {
      const active = idx !== undefined && fields[this.sel] === idx;
      const text = idx === undefined ? 'X' : shortValue(this.vals[idx]);
      if (active) ops.push({ kind: 'rect', x: x - 1, y: y - 1, w: 68, h: 14, fill: true });
      ops.push({ kind: 'text', x: x + 60, y, text, font: 'L', align: 'right', invert: active });
    };
    // A/B = X/D bzw. A/B = C/X
    cell(0, 4, 2);
    cell(1, 4, 19);
    ops.push({ kind: 'line', x1: 3, y1: 17, x2: 73, y2: 17 });
    ops.push({ kind: 'text', x: 78, y: 10, text: '=', font: 'L' });
    ops.push({ kind: 'line', x1: 94, y1: 17, x2: 164, y2: 17 });
    if (this.type === 1) {
      cell(undefined, 95, 2);
      cell(3, 95, 19);
    } else {
      cell(2, 95, 2);
      cell(undefined, 95, 19);
    }
    let cursor: Scene['cursor'] = null;
    if (this.input.editing) {
      const lay = this.input.laid();
      ops.push({ kind: 'rect', x: 0, y: 48, w: LCD_WIDTH, h: 16, fill: true, erase: true });
      ops.push(...translate(lay, 0, 48));
      if (lay.cursor) cursor = { x: lay.cursor.x, y: lay.cursor.y + 48, h: lay.cursor.h };
    } else {
      const i = fields[this.sel];
      ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: 48, text: `${NAMES[i]}=${shortValue(this.vals[i])}`, font: 'L', align: 'right' });
    }
    return { ops, cursor };
  }

  private form(): ResultForm {
    const s = this.host.state.settings;
    return (this.showExact && exactForm(this.result, s)) || decimalForm(this.result, s);
  }

  /** Für Tests. */
  get state(): { phase: Phase; type: 1 | 2; result?: ResultForm } {
    return { phase: this.phase, type: this.type, result: this.phase === 'solution' ? this.form() : undefined };
  }
}
