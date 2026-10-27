// Anwendung 9 „Tabellen“: f(𝑥) (und g(𝑥)) eingeben, Bereich festlegen, Wertetabelle erzeugen und bearbeiten.
// SHIFT OPTN zeigt statt des QR-Codes eine Grafik der Funktionen.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { round15 } from '../../core/format/number';
import { NumericError } from '../../core/numeric/errors';
import { parse, type Node } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { SerializedValue, Value } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { textWidth } from '../../display/framebuffer';
import { Editor, type Cursor, type Slot } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';
import type { IoMode, VarName } from '../../calculator/state';
import { applyInsertAction } from '../calc/input';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';
import type { Host, KeyEvent, Screen } from '../screen';
import { cellText, fullForm } from './format';
import { GraphScreen, type Curve } from './tableGraph';

type Phase = 'f' | 'g' | 'range' | 'table' | 'error';
/** Zahl oder Fehlertext (Anzeige „ERROR“). */
type Cell = number | string;

interface Row {
  x: Value;
  f?: Cell;
  g?: Cell;
}

/** Dauerhafte Daten unter modeData.table. */
interface TableData {
  io: IoMode;
  f: Slot;
  g: Slot;
  /** Start, Ende, Inkre. */
  range: SerializedValue[];
  /** x-Werte der erzeugten Tabelle (null: keine Tabelle). */
  rows: SerializedValue[] | null;
}

const MAX_ROWS = { f: 45, fg: 30 } as const;
const VISIBLE = 4;
const ROW_H = 9;
const FIRST_Y = 10;
const BIG_Y = 48;

/** Spalten (links, rechts) von x, f, g. */
const COLS: readonly [number, number][] = [[12, 63], [64, 103], [104, 143]];
const RANGE_LABELS = ['Start:', 'Ende :', 'Inkre:'];

const defaultRange = (): SerializedValue[] => [1, 5, 1].map((n) => V.serialize(V.int(n)));

function isData(d: unknown): d is TableData {
  const t = d as Partial<TableData> | undefined;
  return !!t && Array.isArray(t.f) && Array.isArray(t.g) && Array.isArray(t.range) && t.range.length === 3;
}

export class TableScreen implements Screen {
  private phase: Phase = 'f';
  private readonly editor = new Editor();
  private readonly input = new ValueInput();
  private table: Row[] = [];
  private hasGFlag = false;
  private nodes: { f?: Node; g?: Node } = {};
  private sel = { r: 0, c: 0 };
  private first = 0;
  private index = 0;
  private scrollX = 0;
  private error: CalcError | undefined;
  private errorFrom: Phase = 'f';

  constructor(private readonly host: Host) {
    const d = this.data;
    this.editor.load(d.f);
    if (d.rows && d.rows.length > 0) this.restore(d.rows);
  }

  private get settings() {
    return this.host.state.settings;
  }

  private get linear(): boolean {
    return this.settings.io === 'linLin' || this.settings.io === 'linDec';
  }

  private get maxRows(): number {
    return MAX_ROWS[this.settings.tableFunctions];
  }

  /** Dauerhafte Daten; eine Änderung von Eingabe/Ausgabe löscht die Funktionen. */
  private get data(): TableData {
    const store = this.host.state.modeData;
    const d = store.table;
    if (isData(d) && d.io === this.settings.io) return d;
    const fresh: TableData = { io: this.settings.io, f: [], g: [], range: defaultRange(), rows: null };
    store.table = fresh;
    return fresh;
  }

  private context(): EvalContext {
    const st = this.host.state;
    return {
      angle: st.settings.angle,
      format: st.settings.format,
      getVar: (name) => V.deserialize(st.vars[name as VarName]),
      ans: V.deserialize(st.ans),
      random: Math.random,
    };
  }

  private rangeValue(i: number): Value {
    return V.deserialize(this.data.range[i]);
  }

  // --- Test-Schnittstelle ---

  get currentPhase(): Phase {
    return this.phase;
  }

  get currentError(): CalcError | undefined {
    return this.phase === 'error' ? this.error : undefined;
  }

  get hasG(): boolean {
    return this.hasGFlag;
  }

  get selected(): { row: number; col: number } {
    return { row: this.sel.r, col: this.sel.c };
  }

  /** Zahlenwerte der Tabelle (null bei Fehler in der Zelle). */
  get rows(): { x: number; f: number | null; g: number | null }[] {
    const num = (c: Cell | undefined) => (typeof c === 'number' ? c : null);
    return this.table.map((r) => ({ x: V.toNumber(r.x), f: num(r.f), g: num(r.g) }));
  }

  /** Angezeigte Zellentexte je Zeile (x, f, g). */
  get cells(): string[][] {
    return this.table.map((r) => this.rowTexts(r));
  }

  // --- Tasten ---

  handle(ev: KeyEvent): boolean {
    const a = ev.action;
    if (!a) return false;
    switch (this.phase) {
      case 'error': return this.handleError(a);
      case 'range': return this.handleRange(a);
      case 'table': return this.handleTable(a);
      default: return this.handleInput(a);
    }
  }

  private handleInput(a: string): boolean {
    const ed = this.editor;
    switch (a) {
      case 'cmd:exe': this.confirmFunction(); return true;
      case 'sys:ac': ed.clear(); break;
      case 'nav:left': ed.moveLeft(); break;
      case 'nav:right': ed.moveRight(); break;
      case 'nav:up':
        if (!ed.moveVertical(-1) && this.phase === 'g') this.enterInput('f');
        break;
      case 'nav:down': ed.moveVertical(1); break;
      case 'edit:del': ed.del(); break;
      case 'edit:ins':
        if (this.linear) ed.overwrite = !ed.overwrite;
        else ed.wrapNext = true;
        break;
      case 'edit:undo': ed.undo(); break;
      default:
        if (!applyInsertAction(ed, a, this.linear)) return false;
    }
    this.saveFunction();
    return true;
  }

  /** Legt den Editorinhalt als f bzw. g ab. */
  private saveFunction(): void {
    const d = this.data;
    d[this.phase === 'g' ? 'g' : 'f'] = this.editor.snapshot().root;
    this.host.persist();
  }

  private enterInput(phase: 'f' | 'g'): void {
    this.saveFunction();
    this.phase = phase;
    this.editor.load(this.data[phase]);
    this.scrollX = 0;
  }

  /** Prüft die Eingabe; f(𝑥) → g(𝑥) (bei f(𝑥),g(𝑥)) → Bereich. */
  private confirmFunction(): void {
    const ed = this.editor;
    if (this.phase === 'f' && ed.isEmpty) return;
    try {
      compile(ed.snapshot().root);
    } catch (e) {
      this.fail(e, this.phase);
      return;
    }
    if (this.phase === 'f' && this.settings.tableFunctions === 'fg') {
      this.enterInput('g');
      return;
    }
    this.saveFunction();
    this.phase = 'range';
    this.index = 0;
    this.input.cancel();
  }

  private handleRange(a: string): boolean {
    if (a === 'sys:ac') {
      if (this.input.editing) this.input.cancel();
      else this.backToInput();
      return true;
    }
    if (a === 'nav:up' || a === 'nav:down') {
      if (this.commitRange()) this.index = (this.index + (a === 'nav:down' ? 1 : 2)) % 3;
      return true;
    }
    if (a === 'cmd:exe') {
      if (!this.commitRange()) return true;
      if (this.index < 2) this.index++;
      else this.build();
      return true;
    }
    this.input.handle(a);
    return true;
  }

  private commitRange(): boolean {
    try {
      const v = this.input.commit(this.context());
      if (v) {
        this.data.range[this.index] = V.serialize(v);
        this.host.persist();
      }
      return true;
    } catch (e) {
      return this.fail(e, 'range');
    }
  }

  private handleTable(a: string): boolean {
    const inp = this.input;
    switch (a) {
      case 'sys:ac':
        if (inp.editing) inp.cancel();
        else this.backToInput();
        return true;
      case 'sys:qr':
        this.showGraph();
        return true;
      case 'cmd:exe':
        if (inp.editing) this.commitX();
        return true;
    }
    if (inp.editing && inp.handle(a)) return true;
    switch (a) {
      case 'nav:up': this.move(-1, 0); return true;
      case 'nav:down': this.move(1, 0); return true;
      case 'nav:left': this.move(0, -1); return true;
      case 'nav:right': this.move(0, 1); return true;
    }
    if (this.sel.c !== 0) return true;
    // +/− in einer leeren x-Zelle: Wert der Zeile darüber ± Schrittweite
    if ((a === 'in:add' || a === 'in:sub') && this.sel.r > 0 && !inp.editing) {
      const prev = this.table[this.sel.r - 1].x;
      const step = this.rangeValue(2);
      this.setX(a === 'in:add' ? V.add(prev, step) : V.sub(prev, step));
      return true;
    }
    inp.handle(a);
    return true;
  }

  private move(dr: number, dc: number): void {
    this.input.cancel();
    const append = this.table.length < this.maxRows;
    const lastRow = append ? this.table.length : this.table.length - 1;
    this.sel.r = Math.max(0, Math.min(lastRow, this.sel.r + dr));
    const cols = this.hasGFlag ? 3 : 2;
    this.sel.c = this.sel.r >= this.table.length ? 0 : Math.max(0, Math.min(cols - 1, this.sel.c + dc));
  }

  private commitX(): void {
    try {
      const v = this.input.commit(this.context());
      if (v) this.setX(v);
    } catch (e) {
      this.fail(e, 'table');
    }
  }

  /** Setzt x der gewählten Zeile (hängt eine neue Zeile an) und berechnet die Zeile neu. */
  private setX(x: Value): void {
    const r = this.sel.r;
    if (r >= this.table.length) {
      if (this.table.length >= this.maxRows) return;
      this.table.push({ x });
    } else {
      this.table[r].x = x;
    }
    this.evalRow(this.table[r]);
    this.host.state.vars.x = V.serialize(x);
    this.persistRows();
  }

  private persistRows(): void {
    this.data.rows = this.table.map((r) => V.serialize(r.x));
    this.host.persist();
  }

  private backToInput(): void {
    this.input.cancel();
    this.data.rows = null;
    this.table = [];
    this.phase = 'f';
    this.editor.load(this.data.f);
    this.scrollX = 0;
    this.host.persist();
  }

  private handleError(a: string): boolean {
    if (a === 'sys:ac' || a === 'nav:left' || a === 'nav:right') {
      this.phase = this.errorFrom;
      const at = this.error?.at;
      if (a !== 'sys:ac' && (this.phase === 'f' || this.phase === 'g') && at && this.validCursor(at)) this.editor.setCursor(at);
      this.error = undefined;
    }
    return true;
  }

  private validCursor(c: Cursor): boolean {
    try {
      return c.pos <= this.editor.slotAt(c.path).length;
    } catch {
      return false;
    }
  }

  private fail(e: unknown, from: Phase): false {
    if (e instanceof NumericError) e = new CalcError('math');
    if (!(e instanceof CalcError)) throw e;
    this.error = e;
    this.errorFrom = from;
    this.phase = 'error';
    this.input.cancel();
    return false;
  }

  // --- Tabelle erzeugen ---

  private build(): void {
    try {
      this.nodes = this.compileAll();
      const start = this.rangeValue(0);
      const step = this.rangeValue(2);
      const s = V.toNumber(start);
      const st = V.toNumber(step);
      const e = V.toNumber(this.rangeValue(1));
      if (!(st > 0) || e < s) throw new CalcError('range');
      const n = Math.floor(round15((e - s) / st)) + 1;
      if (n > this.maxRows) throw new CalcError('range');
      this.table = Array.from({ length: n }, (_, i) => ({ x: i === 0 ? start : V.add(start, V.mul(V.int(i), step)) }));
    } catch (e) {
      this.fail(e, 'range');
      return;
    }
    this.finishBuild();
    this.host.state.vars.x = V.serialize(this.table[this.table.length - 1].x);
    this.persistRows();
  }

  /** Funktionen übersetzen und alle Zeilen auswerten. */
  private finishBuild(): void {
    this.hasGFlag = this.settings.tableFunctions === 'fg' && this.nodes.g !== undefined;
    for (const r of this.table) this.evalRow(r);
    this.sel = { r: 0, c: 0 };
    this.first = 0;
    this.phase = 'table';
    this.input.cancel();
  }

  private restore(xs: SerializedValue[]): void {
    try {
      this.nodes = this.compileAll();
      if (!this.nodes.f) return;
      this.table = xs.slice(0, this.maxRows).map((x) => ({ x: V.deserialize(x) }));
      this.finishBuild();
    } catch {
      this.table = [];
      this.phase = 'f';
    }
  }

  private compileAll(): { f?: Node; g?: Node } {
    const d = this.data;
    const f = compile(d.f);
    if (!f) throw new CalcError('syntax');
    return { f, g: compile(d.g) };
  }

  private evalRow(row: Row): void {
    const ev = new Evaluator(this.context());
    const calc = (node: Node | undefined): Cell | undefined => {
      if (!node) return undefined;
      try {
        return round15(V.toNumber(ev.eval(node, new Map([['x', row.x]]))));
      } catch (e) {
        if (e instanceof CalcError || e instanceof NumericError) return e instanceof CalcError ? e.message : 'Mathem. Fehler';
        throw e;
      }
    };
    row.f = calc(this.nodes.f);
    row.g = this.hasGFlag ? calc(this.nodes.g) : undefined;
  }

  // --- Grafik ---

  private showGraph(): void {
    if (this.table.length === 0 || !this.nodes.f) return;
    const ev = new Evaluator(this.context());
    const fn = (node: Node) => (x: number): number => {
      try {
        return V.toNumber(ev.eval(node, new Map([['x', V.fl(x)]])));
      } catch {
        return NaN;
      }
    };
    const num = (c: Cell | undefined) => (typeof c === 'number' ? c : NaN);
    const curves: Curve[] = [{ fn: fn(this.nodes.f), ys: this.table.map((r) => num(r.f)), dotted: false }];
    if (this.hasGFlag && this.nodes.g) curves.push({ fn: fn(this.nodes.g), ys: this.table.map((r) => num(r.g)), dotted: true });
    this.host.push(new GraphScreen({ xs: this.table.map((r) => V.toNumber(r.x)), curves }));
  }

  // --- Anzeige ---

  private rowTexts(r: Row): string[] {
    const cell = (c: Cell | undefined) => (c === undefined ? '' : typeof c === 'number' ? cellText(c) : 'ERROR');
    const out = [cellText(round15(V.toNumber(r.x))), cell(r.f)];
    if (this.hasGFlag) out.push(cell(r.g));
    return out;
  }

  render(): Scene {
    switch (this.phase) {
      case 'error': return errorScene(this.error!.message);
      case 'range': return this.renderRange();
      case 'table': return this.renderTable();
      default: return this.renderInput();
    }
  }

  private renderInput(): Scene {
    const label = this.phase === 'g' ? 'g(𝑥)=' : 'f(𝑥)=';
    const x0 = [...label].length * 11;
    const lay = layoutInput(this.editor.root, this.editor.cursor, this.linear ? 'linear' : 'math');
    const c = lay.cursor;
    if (c) {
      if (x0 + c.x - this.scrollX > LCD_WIDTH - 3) this.scrollX = x0 + c.x - (LCD_WIDTH - 3);
      if (x0 + c.x - this.scrollX < 0) this.scrollX = Math.max(0, x0 + c.x - 8);
    }
    if (x0 + lay.w <= LCD_WIDTH - 2) this.scrollX = 0;
    const ops: DrawOp[] = [{ kind: 'text', x: -this.scrollX, y: Math.max(0, lay.base - 12), text: label, font: 'L' }];
    ops.push(...translate(lay, x0 - this.scrollX, 0));
    return { ops, cursor: c ? { x: x0 + c.x - this.scrollX, y: c.y, h: c.h } : null };
  }

  private renderRange(): Scene {
    const ops: DrawOp[] = [];
    let cursor: Scene['cursor'] = null;
    const x0 = RANGE_LABELS[0].length * 11;
    RANGE_LABELS.forEach((label, i) => {
      const y = i * 16;
      const active = i === this.index;
      if (active) ops.push({ kind: 'rect', x: 0, y, w: x0, h: 16, fill: true });
      ops.push({ kind: 'text', x: 0, y, text: label, font: 'L', invert: active });
      if (active && this.input.editing) {
        const lay = this.input.laid();
        const shift = Math.max(0, x0 + lay.w - 190);
        ops.push(...translate(lay, x0 - shift, y));
        const c = lay.cursor;
        if (c) cursor = { x: c.x + x0 - shift, y: c.y + y, h: c.h };
      } else {
        ops.push({ kind: 'text', x: x0, y, text: shortValue(this.rangeValue(i)), font: 'L' });
      }
    });
    return { ops, cursor };
  }

  private renderTable(): Scene {
    const ops: DrawOp[] = [];
    const cols = this.hasGFlag ? 3 : 2;
    const append = this.table.length < this.maxRows;
    const total = this.table.length + (append ? 1 : 0);
    const shown = this.table.length + (this.sel.r >= this.table.length ? 1 : 0);
    if (this.sel.r < this.first) this.first = this.sel.r;
    if (this.sel.r >= this.first + VISIBLE) this.first = this.sel.r - VISIBLE + 1;

    // Kopfzeile und Trennlinien
    ['𝑥', 'f(𝑥)', 'g(𝑥)'].slice(0, cols).forEach((h, c) => {
      const [l, r] = COLS[c];
      ops.push({ kind: 'text', x: l + Math.floor((r - l - textWidth(h, 'S')) / 2), y: 0, text: h, font: 'S' });
      ops.push({ kind: 'line', x1: r, y1: 0, x2: r, y2: FIRST_Y + VISIBLE * ROW_H - 2 });
    });

    const editing = this.input.editing;
    for (let k = 0; k < VISIBLE && this.first + k < shown; k++) {
      const i = this.first + k;
      const y = FIRST_Y + k * ROW_H;
      ops.push({ kind: 'text', x: COLS[0][0] - 2, y: y + 1, text: String(i + 1), font: 'S', align: 'right' });
      const texts = i < this.table.length ? this.rowTexts(this.table[i]) : [];
      for (let c = 0; c < cols; c++) {
        const [l, r] = COLS[c];
        const active = i === this.sel.r && c === this.sel.c;
        let t = texts[c] ?? '';
        if (active && editing && c === 0) t = typed(this.input.editor.root);
        if (active) ops.push({ kind: 'rect', x: l, y, w: r - l, h: ROW_H, fill: true });
        ops.push({ kind: 'text', x: r - 2, y: y + 1, text: t, font: 'S', align: 'right', invert: active });
      }
    }

    // Wert der hervorgehobenen Zelle groß unten rechts
    let cursor: Scene['cursor'] = null;
    if (editing) {
      const lay = this.input.laid();
      const x = LCD_WIDTH - 2 - lay.w;
      ops.push(...translate(lay, x, LCD_HEIGHT - 16));
      const c = lay.cursor;
      if (c) cursor = { x: c.x + x, y: c.y + LCD_HEIGHT - 16, h: c.h };
    } else if (this.sel.r < this.table.length) {
      const row = this.table[this.sel.r];
      const cell = this.sel.c === 0 ? V.toNumber(row.x) : this.sel.c === 1 ? row.f : row.g;
      const form = typeof cell === 'string' ? ({ kind: 'text', text: cell } as const) : fullForm(cell!);
      const res = layoutResult(form, 'math');
      ops.push(...translate(res, Math.max(0, LCD_WIDTH - res.w), Math.min(BIG_Y, LCD_HEIGHT - res.h)));
    }
    return { ops, cursor, status: { up: this.first > 0, down: this.first + VISIBLE < total } };
  }
}

/** Eingegebener Text einer x-Zelle (nur oberste Ebene, letzte Zeichen). */
function typed(root: Slot): string {
  const s = root.map((it) => (it.kind === 'tok' ? (it.tok === 'neg' ? '-' : (TOKENS[it.tok]?.text ?? it.tok)) : '▯')).join('');
  return s.length > 7 ? s.slice(-7) : s;
}

/** Wandelt einen Eingabebaum in einen Ausdruck (leer → undefined). Wirft CalcError. */
function compile(slot: Slot): Node | undefined {
  if (slot.length === 0) return undefined;
  const [st, ...rest] = parse(slot);
  if (rest.length > 0 || st.kind !== 'expr') throw new CalcError('syntax');
  return st.expr;
}
