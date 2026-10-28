// Bausteine für CALC und SOLVE: Eingabezeile für Variablenwerte und Fehlerbildschirm.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { decimalForm } from '../../core/format/result';
import { parse } from '../../core/parser/parser';
import type { Value } from '../../core/value';
import { layoutInput, type Laid } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { DEFAULT_SETTINGS } from '../../calculator/state';
import { Editor, type Slot } from '../../editor/model';
import { applyInsertAction, isInsertAction } from './input';

/** Anzeigename einer Variablen (x und y kursiv). */
export const varLabel = (name: string): string => (name === 'x' ? '𝑥' : name === 'y' ? '𝑦' : name);

/** Wert im Format Norm 1 als einzeiliger Text. */
export function shortValue(v: Value): string {
  const f = decimalForm(v, DEFAULT_SETTINGS);
  return f.kind === 'decimal' ? f.mantissa + (f.exponent !== undefined ? `×10^${f.exponent}` : '') : '';
}

/** Lineare Eingabezeile für einen Variablenwert (nach CALC/SOLVE gilt die lineare Eingabe). */
export class ValueInput {
  readonly editor = new Editor();
  editing = false;

  /** Verarbeitet Eingabe- und Editiertasten; false, wenn die Taste nicht zur Eingabe gehört. */
  handle(a: string): boolean {
    const ed = this.editor;
    if (this.editing) {
      switch (a) {
        case 'nav:left': ed.moveLeft(); return true;
        case 'nav:right': ed.moveRight(); return true;
        case 'edit:del': ed.del(); return true;
        case 'edit:undo': ed.undo(); return true;
      }
    }
    if (!isInsertAction(a)) return false;
    if (!this.editing) {
      ed.clear();
      this.editing = true;
    }
    return applyInsertAction(ed, a, true);
  }

  /** Wertet die Eingabe aus (undefined, wenn nichts eingegeben wurde). Wirft CalcError. */
  commit(ctx: EvalContext): Value | undefined {
    if (!this.editing) return undefined;
    this.editing = false;
    if (this.editor.isEmpty) return undefined;
    const [st, ...rest] = parse(this.editor.root);
    if (rest.length > 0 || st.kind !== 'expr') throw new CalcError('syntax');
    return new Evaluator(ctx).eval(st.expr);
  }

  /** Wie commit, liefert aber nur den Term (die Auswertung übernimmt z. B. der Komplex-Modus). */
  commitSlot(): Slot | undefined {
    if (!this.editing) return undefined;
    this.editing = false;
    return this.editor.isEmpty ? undefined : this.editor.snapshot().root;
  }

  cancel(): void {
    this.editing = false;
  }

  laid(): Laid {
    return layoutInput(this.editor.root, this.editor.cursor, 'linear');
  }
}

/** Zeile „Name =Wert“ bzw. mit laufender Eingabe; liefert Ops und Cursor. */
export function variableLine(
  name: string,
  value: Value | string,
  input: ValueInput | undefined,
  y: number,
  highlight = false,
): { ops: DrawOp[]; cursor: Scene['cursor'] } {
  const label = `${varLabel(name)} =`;
  const x0 = [...label].length * 11;
  const ops: DrawOp[] = [];
  if (highlight) ops.push({ kind: 'rect', x: 0, y, w: 192, h: 16, fill: true });
  ops.push({ kind: 'text', x: 0, y, text: label, font: 'L', invert: highlight });
  if (input?.editing) {
    const lay = input.laid();
    const shift = Math.max(0, x0 + lay.w - 190);
    for (const op of lay.ops) ops.push(shiftOp(op, x0 - shift, y));
    const c = lay.cursor;
    return { ops, cursor: c ? { x: c.x + x0 - shift, y: c.y + y, h: c.h } : null };
  }
  ops.push({ kind: 'text', x: x0, y, text: typeof value === 'string' ? value : shortValue(value), font: 'L', invert: highlight });
  return { ops, cursor: null };
}

function shiftOp(op: DrawOp, dx: number, dy: number): DrawOp {
  switch (op.kind) {
    case 'line': return { ...op, x1: op.x1 + dx, x2: op.x2 + dx, y1: op.y1 + dy, y2: op.y2 + dy };
    default: return { ...op, x: op.x + dx, y: op.y + dy };
  }
}

/** Fehlerbildschirm des Originals (Meldung, AC: Abbrechen, ◀▶: zur Fehlerstelle). */
export function errorScene(message: string): Scene {
  const lines = [message, '', '[AC] :Abbrechen', '[◀][▶]:Gehe zu'];
  return { ops: lines.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
}
