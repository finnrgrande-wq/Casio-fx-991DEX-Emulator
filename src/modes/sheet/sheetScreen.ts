// Anwendung 8 „Tabellenkalk.“: Tabelle A–E × 1–45 mit Konstanten und Formeln, Füllen, Kopieren/Einfügen.

import { CalcError } from '../../core/errors';
import * as V from '../../core/value';
import { layoutInput, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_WIDTH } from '../../display/types';
import type { VarName } from '../../calculator/state';
import { evalContext } from '../../calculator/context';
import { Editor, type Item, type Slot } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';
import type { KeyId } from '../../keys/keymap';
import { ListMenu, closeMenus } from '../listMenu';
import { applyInsertAction, isInsertAction } from '../calc/input';
import { RecallScreen } from '../calc/recallScreen';
import { errorScene, shortValue } from '../calc/prompt';
import type { Host, KeyEvent, Screen } from '../screen';
import { COLS, ROWS, CAPACITY, SheetModel, colOf, idxOf, parseRange, refItems, refName, rowOf, shiftSlot, toRef, type Cell, type SheetJson } from './model';

type Pick = { cur: number };

type Phase = 'grid' | 'dialog' | 'message' | 'error';

const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

const VISIBLE_ROWS = 4;
const VISIBLE_COLS = 4;
const ROW_H = 9;
const TOP = 9;
const NUM_W = 10;
const CELL_W = 45;
const EDIT_Y = 48;

interface Dialog {
  kind: 'formula' | 'value';
  fields: [Editor, Editor];
  row: 0 | 1;
}

interface Clip {
  cell: Cell;
  from: number;
  cut: boolean;
}

export class SheetScreen implements Screen {
  readonly model: SheetModel;
  private phase: Phase = 'grid';
  private cur = 0;
  private topRow = 1;
  private leftCol = 0;
  private readonly ed = new Editor();
  private editing = false;
  private dialog: Dialog | undefined;
  private clip: Clip | undefined;
  private message: string[] = [];
  private error: CalcError | undefined;
  private stoPending = false;
  private scrollX = 0;
  /** Zell-Auswahl beim Bearbeiten einer Formel. */
  private pick: Pick | undefined;

  constructor(private readonly host: Host) {
    this.model = new SheetModel(
      () => evalContext(host.state),
      () => host.state.settings.sheetAutoCalc,
      host.state.modeData.sheet as SheetJson | undefined,
    );
    this.ed.overwrite = false;
  }

  private save(): void {
    this.host.state.modeData.sheet = this.model.toJSON();
    this.host.persist();
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const name = ev.mod === 'none' || ev.mod === 'alpha' ? STO_KEYS[ev.key] : undefined;
      const r = this.model.result(this.cur);
      if (name && r && 'v' in r) {
        host.state.vars[name] = V.serialize(r.v);
        host.persist();
      }
      return true;
    }
    if (this.pick && this.phase === 'grid') return this.handlePick(ev.action);
    if (this.phase === 'error') {
      if (a === 'sys:ac' || a === 'cmd:exe') this.phase = this.dialog ? 'dialog' : 'grid';
      return true;
    }
    if (this.phase === 'message') {
      if (a === 'sys:ac' || a === 'cmd:exe') this.phase = 'grid';
      return true;
    }
    if (!a) return true;
    if (a === 'sys:optn') {
      if (this.dialog || this.editing) host.push(this.functionMenu());
      else if (!this.clip) host.push(this.mainMenu());
      return true;
    }
    if (a === 'cmd:recall') {
      if (this.dialog || this.editing || !this.clip) host.push(new RecallScreen((name) => this.insertVariable(name)));
      return true;
    }
    return this.dialog ? this.handleDialog(a) : this.handleGrid(a);
  }

  private handleGrid(a: string): boolean {
    switch (a) {
      case 'sys:ac':
        if (this.clip) this.clip = undefined;
        else if (this.editing) this.stopEdit();
        return true;
      case 'nav:left':
      case 'nav:right':
        if (this.editing) a === 'nav:left' ? this.ed.moveLeft() : this.ed.moveRight();
        else this.move(a === 'nav:left' ? -1 : 1, 0);
        return true;
      case 'nav:up':
      case 'nav:down':
        if (!this.editing) this.move(0, a === 'nav:up' ? -1 : 1);
        return true;
      case 'cmd:exe':
        if (this.editing) this.commit();
        else if (this.clip) this.doPaste();
        return true;
      case 'edit:del':
        if (this.editing) this.ed.del();
        else if (!this.clip) this.tryRun(() => this.model.clear(this.cur));
        return true;
      case 'edit:undo':
        if (this.editing) this.ed.undo();
        return true;
      case 'cmd:sto':
        if (!this.editing && !this.clip) this.stoPending = true;
        return true;
    }
    if (this.clip || !isInsertAction(a)) return true;
    if (!this.editing) {
      this.ed.clear();
      this.editing = true;
    }
    applyInsertAction(this.ed, a, true);
    return true;
  }

  /** Zell-Auswahl: Pfeiltasten bewegen die Markierung, = fügt den Bezug ein, AC bricht ab. */
  private handlePick(a: string | undefined): boolean {
    const p = this.pick!;
    const step: Record<string, [number, number]> = { 'nav:left': [-1, 0], 'nav:right': [1, 0], 'nav:up': [0, -1], 'nav:down': [0, 1] };
    if (a && step[a]) {
      const [dc, dr] = step[a];
      p.cur = idxOf(Math.min(COLS - 1, Math.max(0, colOf(p.cur) + dc)), Math.min(ROWS, Math.max(1, rowOf(p.cur) + dr)));
      this.scroll(p.cur);
    } else if (a === 'cmd:exe') {
      for (const it of refItems(toRef(p.cur))) if (it.kind === 'tok') this.ed.insertToken(it.tok);
      this.pick = undefined;
      this.scroll(this.cur);
    } else if (a === 'sys:ac') {
      this.pick = undefined;
      this.scroll(this.cur);
    }
    return true;
  }

  private stopEdit(): void {
    this.editing = false;
    this.ed.clear();
  }

  private move(dc: number, dr: number): void {
    const c = Math.min(COLS - 1, Math.max(0, colOf(this.cur) + dc));
    const r = Math.min(ROWS, Math.max(1, rowOf(this.cur) + dr));
    this.cur = idxOf(c, r);
    this.scroll(this.cur);
  }

  private scroll(idx: number): void {
    const c = colOf(idx);
    const r = rowOf(idx);
    if (r < this.topRow) this.topRow = r;
    if (r >= this.topRow + VISIBLE_ROWS) this.topRow = r - VISIBLE_ROWS + 1;
    if (c < this.leftCol) this.leftCol = c;
    if (c >= this.leftCol + VISIBLE_COLS) this.leftCol = c - VISIBLE_COLS + 1;
  }

  /** Führt eine Änderung aus; Fehler erscheinen im Fehlerbildschirm. */
  private tryRun(f: () => void): boolean {
    try {
      f();
      this.save();
      return true;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
      return false;
    }
  }

  private commit(): void {
    const input = this.ed.snapshot().root;
    if (this.tryRun(() => this.model.enter(this.cur, input))) {
      this.stopEdit();
      this.move(0, 1);
    }
  }

  private doPaste(): void {
    const clip = this.clip!;
    if (this.cur === clip.from) return;
    const cell: Cell = clip.cut || !clip.cell.f ? clip.cell : { ...clip.cell, t: shiftSlot(clip.cell.t, colOf(this.cur) - colOf(clip.from), rowOf(this.cur) - rowOf(clip.from)) };
    const ok = this.tryRun(() => {
      this.model.paste(this.cur, cell);
      if (clip.cut) this.model.clear(clip.from);
    });
    if (ok && clip.cut) this.clip = undefined;
  }

  // --- Menüs ---

  private mainMenu(): ListMenu {
    const run = (f: () => void) => (h: Host) => {
      closeMenus(h);
      f();
    };
    const grab = (cut: boolean) =>
      run(() => {
        const cell = this.model.cells.get(this.cur);
        if (cell) this.clip = { cell, from: this.cur, cut };
      });
    return new ListMenu(
      [
        { label: 'Formel füllen', run: run(() => this.openDialog('formula')) },
        { label: 'Wert füllen', run: run(() => this.openDialog('value')) },
        { label: 'Zelle bearbeit.', run: run(() => this.editCell()) },
        { label: 'Freier Speicher', run: run(() => ((this.message = ['Freier Speicher', `${CAPACITY - this.model.used}`]), (this.phase = 'message'))) },
        { label: 'Ausschn.&Einf.', run: grab(true) },
        { label: 'Kopier & Einfüg', run: grab(false) },
        { label: 'Alles löschen', run: run(() => this.tryRun(() => this.model.clearAll())) },
        { label: 'Neu berechnen', run: run(() => this.tryRun(() => this.model.recalc())) },
      ],
      { paged: true },
    );
  }

  private functionMenu(): ListMenu {
    const put = (t: string) => (h: Host) => {
      closeMenus(h);
      this.insertToken(t);
    };
    return new ListMenu(
      [
        { label: 'Minimum', run: put('Min(') },
        { label: 'Maximum', run: put('Max(') },
        { label: 'Mittelwert', run: put('Mean(') },
        { label: 'Summe', run: put('Sum(') },
        { label: '$', run: put('$') },
        ...(this.dialog
          ? []
          : [
              {
                label: 'Zell-Auswahl',
                run: (h: Host) => {
                  closeMenus(h);
                  this.pick = { cur: this.cur };
                },
              },
            ]),
      ],
      { paged: true },
    );
  }

  private editCell(): void {
    const c = this.model.cells.get(this.cur);
    const root: Slot = c ? (c.f ? [{ kind: 'tok', tok: '=' }, ...c.t] : c.t) : [];
    this.ed.load(root);
    this.editing = true;
  }

  private openDialog(kind: 'formula' | 'value'): void {
    const f1 = new Editor();
    const f2 = new Editor();
    const here = refName(this.cur);
    for (const ch of `${here}:${here}`) f2.insertToken(ch === ':' ? ':' : ch);
    this.dialog = { kind, fields: [f1, f2], row: 0 };
    this.stopEdit();
  }

  private target(): Editor {
    return this.dialog ? this.dialog.fields[this.dialog.row] : this.ed;
  }

  private insertToken(t: string): void {
    if (!this.dialog && !this.editing) {
      this.ed.clear();
      this.editing = true;
    }
    this.target().insertToken(t);
  }

  /** RECALL: Wert der Variablen einfügen; exakte Werte (Bruch, Wurzel, π) bleiben exakt. */
  private insertVariable(name: VarName): void {
    const v = V.deserialize(this.host.state.vars[name]);
    if (!this.dialog && !this.editing) {
      this.ed.clear();
      this.editing = true;
    }
    const ed = this.target();
    const put = (s: string) => {
      for (const ch of s) ed.insertToken(ch === '-' ? 'neg' : ch);
    };
    if (v.k === 'f') {
      const [mant, exp] = shortValue(v).split('×10^');
      put(mant);
      if (exp !== undefined) {
        ed.insertTemplate('e10');
        put(exp);
        ed.moveRight();
      }
      return;
    }
    // Terme: [negativ, Zähler, Nenner, Radikand bzw. 'π']
    const abs = (n: bigint) => (n < 0n ? -n : n);
    const terms: [boolean, bigint, bigint, string][] =
      v.k === 'pi'
        ? v.q.isZero ? [] : [[v.q.num < 0n, abs(v.q.num), v.q.den, 'π']]
        : v.s.terms.map((t) => [t.coef.num < 0n, abs(t.coef.num), t.coef.den, t.rad.toString()]);
    if (terms.length === 0) return put('0');
    const wrap = terms.length > 1 || terms[0][2] !== 1n;
    if (wrap) ed.insertToken('(');
    terms.forEach(([negative, n, d, r], k) => {
      if (k === 0) {
        if (negative) ed.insertToken('neg');
      } else ed.insertToken(negative ? '−' : '+');
      const root = r !== '1';
      if (!(n === 1n && d === 1n && root)) {
        if (d !== 1n && root) ed.insertToken('(');
        for (const ch of d === 1n ? `${n}` : `${n}÷${d}`) ed.insertToken(ch);
        if (d !== 1n && root) ed.insertToken(')');
        if (root) ed.insertToken('×');
      }
      if (r === 'π') ed.insertToken('π');
      else if (root) {
        ed.insertTemplate('sqrt');
        put(r);
        ed.moveRight();
      }
    });
    if (wrap) ed.insertToken(')');
  }

  // --- Dialog Formel/Wert füllen ---

  private handleDialog(a: string): boolean {
    const d = this.dialog!;
    const ed = d.fields[d.row];
    switch (a) {
      case 'sys:ac':
        this.dialog = undefined;
        return true;
      case 'nav:up':
        d.row = 0;
        return true;
      case 'nav:down':
        d.row = 1;
        return true;
      case 'nav:left':
        if (ed.cursor.path.length === 0 && ed.cursor.pos === 0 && d.row === 1) {
          d.row = 0;
          d.fields[0].cursor = { path: [], pos: d.fields[0].root.length };
        } else ed.moveLeft();
        return true;
      case 'nav:right':
        if (ed.cursor.path.length === 0 && ed.cursor.pos >= ed.root.length && d.row === 0) {
          d.row = 1;
          d.fields[1].cursor = { path: [], pos: d.fields[1].root.length };
        } else ed.moveRight();
        return true;
      case 'cmd:exe':
        if (d.row === 0) d.row = 1;
        else this.applyDialog();
        return true;
      case 'edit:del':
        ed.del();
        return true;
      case 'edit:undo':
        ed.undo();
        return true;
    }
    if (isInsertAction(a)) applyInsertAction(ed, a, true);
    return true;
  }

  private applyDialog(): void {
    const d = this.dialog!;
    const ok = this.tryRun(() => {
      const { a, b } = parseRange(d.fields[1].snapshot().root);
      const input = d.fields[0].snapshot().root;
      if (input.length === 0) throw new CalcError('syntax');
      if (d.kind === 'formula') this.model.fillFormula(a, b, input);
      else this.model.fillValue(a, b, input);
    });
    if (ok) this.dialog = undefined;
  }

  // --- Anzeige ---

  /** Für Tests: Wert der Zelle als Text („ERROR“, undefined = leer). */
  valueText(ref: string): string | undefined {
    const r = this.model.result(refIdx(ref));
    if (!r) return undefined;
    return 'err' in r ? 'ERROR' : shortValue(r.v);
  }

  /** Für Tests: Inhalt der Zelle als Text („=A1+1“ bzw. Konstante). */
  contentText(ref: string): string | undefined {
    const c = this.model.cells.get(refIdx(ref));
    return c ? slotText(c.f ? [{ kind: 'tok', tok: '=' }, ...c.t] : c.t) : undefined;
  }

  get cursorRef(): string {
    return refName(this.cur);
  }

  get pasteMode(): boolean {
    return this.clip !== undefined;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  get errorKind(): string | undefined {
    return this.error?.kind;
  }

  render(): Scene {
    switch (this.phase) {
      case 'error':
        return errorScene(this.error!.message);
      case 'message':
        return { ops: this.message.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
    }
    return this.dialog ? this.renderDialog(this.dialog) : this.renderGrid();
  }

  private renderGrid(): Scene {
    const ops: DrawOp[] = [];
    ops.push({ kind: 'rect', x: NUM_W, y: 0, w: LCD_WIDTH - NUM_W, h: 8, fill: true });
    for (let k = 0; k < VISIBLE_COLS; k++) {
      const c = this.leftCol + k;
      const x = NUM_W + k * CELL_W;
      ops.push({ kind: 'text', x: x + 20, y: 1, text: 'ABCDE'[c], font: 'S', invert: true });
      ops.push({ kind: 'line', x1: x + CELL_W - 1, y1: TOP, x2: x + CELL_W - 1, y2: TOP + VISIBLE_ROWS * ROW_H - 1 });
    }
    ops.push({ kind: 'rect', x: 0, y: TOP, w: NUM_W, h: VISIBLE_ROWS * ROW_H, fill: true });
    for (let k = 0; k < VISIBLE_ROWS; k++) {
      const r = this.topRow + k;
      const y = TOP + k * ROW_H;
      ops.push({ kind: 'text', x: 2, y: y + 1, text: String(r), font: 'S', invert: true });
      for (let j = 0; j < VISIBLE_COLS; j++) {
        const c = this.leftCol + j;
        const idx = idxOf(c, r);
        const x = NUM_W + j * CELL_W;
        const active = idx === (this.pick ? this.pick.cur : this.cur);
        const res = this.model.result(idx);
        const text = res ? ('err' in res ? 'ERROR' : clip(shortValue(res.v), 7)) : '';
        if (active) ops.push({ kind: 'rect', x, y, w: CELL_W - 1, h: ROW_H, fill: true });
        if (text) ops.push({ kind: 'text', x: x + CELL_W - 3, y: y + 1, text, font: 'S', align: 'right', invert: active });
      }
    }
    let cursor: Scene['cursor'] = null;
    if (this.editing) {
      const lay = layoutInput(this.ed.root, this.ed.cursor, 'linear');
      const c = lay.cursor;
      if (c) {
        if (c.x - this.scrollX > LCD_WIDTH - 3) this.scrollX = c.x - (LCD_WIDTH - 3);
        if (c.x - this.scrollX < 0) this.scrollX = Math.max(0, c.x - 8);
      }
      if (lay.w <= LCD_WIDTH - 2) this.scrollX = 0;
      ops.push({ kind: 'rect', x: 0, y: EDIT_Y, w: LCD_WIDTH, h: 16, fill: true, erase: true });
      ops.push(...translate(lay, -this.scrollX, EDIT_Y));
      if (c) cursor = { x: c.x - this.scrollX, y: c.y + EDIT_Y, h: c.h };
    } else if (this.clip) {
      ops.push({ kind: 'text', x: 0, y: EDIT_Y, text: 'Einfügen:[=]', font: 'L' });
    } else {
      const c = this.model.cells.get(this.cur);
      let root: Slot = [];
      if (c) {
        const showFormula = c.f && this.host.state.settings.sheetShowFormula;
        if (showFormula) root = [{ kind: 'tok', tok: '=' }, ...c.t];
        else {
          const res = this.model.result(this.cur);
          root = textItems(res ? ('err' in res ? 'ERROR' : shortValue(res.v)) : '');
        }
      }
      if (root.length > 0) {
        const lay = layoutInput(root, null, 'linear');
        ops.push(...translate(lay, Math.max(0, LCD_WIDTH - lay.w), EDIT_Y));
      }
    }
    return { ops, cursor, status: { up: this.topRow > 1, down: this.topRow + VISIBLE_ROWS <= ROWS } };
  }

  private renderDialog(d: Dialog): Scene {
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: d.kind === 'formula' ? 'Formel füllen' : 'Wert füllen', font: 'L' }];
    const labels = [d.kind === 'formula' ? 'Formel=' : 'Wert  :', 'Zellen:'];
    let cursor: Scene['cursor'] = null;
    labels.forEach((label, i) => {
      const y = 16 + i * 16;
      const x0 = [...label].length * 11;
      ops.push({ kind: 'text', x: 0, y, text: label, font: 'L' });
      const lay = layoutInput(d.fields[i].root, i === d.row ? d.fields[i].cursor : null, 'linear');
      const shift = Math.max(0, x0 + lay.w - 190);
      ops.push(...translate(lay, x0 - shift, y));
      if (i === d.row && lay.cursor) cursor = { x: lay.cursor.x + x0 - shift, y: lay.cursor.y + y, h: lay.cursor.h };
    });
    return { ops, cursor };
  }
}

function refIdx(ref: string): number {
  const m = /^([A-E])(\d+)$/.exec(ref)!;
  return idxOf('ABCDE'.indexOf(m[1]), Number(m[2]));
}

function textItems(s: string): Item[] {
  return [...s].map((ch) => ({ kind: 'tok', tok: ch === '-' ? 'neg' : ch }));
}

function slotText(slot: Slot): string {
  return slot.map((it) => (it.kind === 'tok' ? (TOKENS[it.tok]?.text ?? it.tok) : '▫')).join('');
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
