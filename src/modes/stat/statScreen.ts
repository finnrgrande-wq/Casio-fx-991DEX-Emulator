// Anwendung 6 „Statistik“: Typauswahl, Statistik-Editor, Bildschirm für statistische Berechnungen,
// Kennwert- und Regressionslisten.

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import { formToText } from '../../display/resultForm';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { Editor, type Slot } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';
import type { KeyId } from '../../keys/keymap';
import type { VarName } from '../../calculator/state';
import { evalContext } from '../../calculator/context';
import { ListMenu, closeMenus, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { applyInsertAction, continuesWithAns, isInsertAction } from '../calc/input';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';
import {
  LIST_ONE, LIST_QUAD, LIST_TWO, MAX_ROWS, TYPES, VAR_BY_ID, StatCalc, isPaired, regIds, typeLabel,
  type StatSet, type StatType,
} from './data';
import { asCalcError, evalStatSlot, numValue } from './evaluate';
import { StatPlot } from './statPlot';

type Phase = 'type' | 'editor' | 'calc' | 'list' | 'reg' | 'error';
type Cell = Value | null;
/** Zeile des Editors: x, y, Freq. */
type Row = [Cell, Cell, Cell];

interface Stored {
  type: StatType;
  freq: boolean;
  rows: (V.SerializedValue | null)[][];
}

const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

const COL_W = 61;
const COL_X0 = 9;
const ROWS_SHOWN = 4;
const LIST_LINES = 6;

interface Entry {
  input: Slot;
  value: Value;
  exact?: ResultForm;
  decimal: ResultForm;
  showExact: boolean;
}

export class StatScreen implements Screen {
  private phase: Phase;
  private type: StatType = 'one';
  private rows: Row[] = [];
  private r = 0;
  private c = 0;
  private top = 0;
  private readonly input = new ValueInput();
  private menu: ListMenu | undefined;
  // Bildschirm für statistische Berechnungen
  private readonly cEd = new Editor();
  private shown: Entry | undefined;
  private stoPending = false;
  // Listen
  private listItems: { label: string; text: string }[] = [];
  private ls = 0;
  private back: 'editor' | 'calc' = 'editor';
  private error: CalcError | undefined;

  constructor(private readonly host: Host) {
    const stored = host.state.modeData.stat as Stored | undefined;
    if (stored) {
      this.type = stored.type;
      // Änderung der Statistik-Einstellung (Freq) löscht die Daten
      if (stored.freq === host.state.settings.statFreq) {
        this.rows = stored.rows.map((row) => [0, 1, 2].map((i) => (row[i] ? V.deserialize(row[i]) : null)) as Row);
      }
      this.phase = 'editor';
      if (stored.freq !== host.state.settings.statFreq) this.save();
    } else {
      this.phase = 'type';
      this.menu = new ListMenu(this.typeItems());
    }
  }

  private get paired(): boolean {
    return isPaired(this.type);
  }

  private get freq(): boolean {
    return this.host.state.settings.statFreq;
  }

  /** Spalten des Editors als Index in die Zeile (0 = x, 1 = y, 2 = Freq). */
  private get cols(): number[] {
    return [0, ...(this.paired ? [1] : []), ...(this.freq ? [2] : [])];
  }

  private get maxRows(): number {
    return MAX_ROWS[this.cols.length];
  }

  /** Datenzeilen plus die leere Zeile zum Anhängen. */
  private get displayRows(): number {
    return this.rows.length + (this.rows.length < this.maxRows ? 1 : 0);
  }

  private save(): void {
    const data: Stored = {
      type: this.type,
      freq: this.freq,
      rows: this.rows.map((row) => row.map((c) => (c ? V.serialize(c) : null))),
    };
    this.host.state.modeData.stat = data;
    this.host.persist();
  }

  private setType(t: StatType): void {
    if (isPaired(t) !== this.paired) this.rows = [];
    this.type = t;
    this.r = 0;
    this.c = 0;
    this.top = 0;
    this.input.cancel();
    this.phase = 'editor';
    this.save();
  }

  /** Datensatz für die Berechnung; unvollständige Zeilen sind ein Dimensionsfehler. */
  private buildSet(): StatSet {
    const set: StatSet = { x: [], y: [], f: [] };
    for (const [x, y, f] of this.rows) {
      if (!x && !y) continue;
      if (!x || (this.paired && !y)) throw new CalcError('dimension');
      set.x.push(V.toNumber(x));
      set.y.push(y ? V.toNumber(y) : 0);
      set.f.push(this.freq && f ? V.toNumber(f) : 1);
    }
    return set;
  }

  private stat(): StatCalc {
    return new StatCalc(this.type, () => {
      try {
        return this.buildSet();
      } catch (e) {
        throw asCalcError(e) ?? e;
      }
    });
  }

  private fail(e: unknown, back: 'editor' | 'calc'): void {
    const ce = asCalcError(e);
    if (!ce) throw e;
    this.error = ce;
    this.back = back;
    this.phase = 'error';
  }

  // --- Menüs ---

  private typeItems(): MenuItem[] {
    return TYPES.map((t) => ({ label: t.label, run: (h) => (closeMenus(h), this.setType(t.type)) }));
  }

  private openList(back: 'editor' | 'calc'): void {
    try {
      const calc = this.stat();
      const ids = !this.paired ? LIST_ONE : this.type === 'quad' ? [...LIST_TWO, ...LIST_QUAD] : LIST_TWO;
      this.listItems = ids.map((id) => {
        const e = VAR_BY_ID.get(id)!;
        return { label: e.text, text: this.valueText(numValue(e.get(calc))) };
      });
      this.ls = 0;
      this.back = back;
      this.phase = 'list';
    } catch (e) {
      this.fail(e, back);
    }
  }

  private openReg(back: 'editor' | 'calc'): void {
    try {
      const calc = this.stat();
      this.listItems = regIds(this.type).map((id) => ({
        label: id,
        text: this.valueText(numValue(VAR_BY_ID.get(id)!.get(calc))),
      }));
      this.back = back;
      this.phase = 'reg';
    } catch (e) {
      this.fail(e, back);
    }
  }

  private editorMenu(): MenuItem[] {
    const items: MenuItem[] = [
      { label: 'Typ auswählen', sub: this.typeItems() },
      {
        label: 'Editor',
        sub: [
          { label: 'Zeile einfügen', run: (h) => (closeMenus(h), this.insertRow()) },
          { label: 'Alles löschen', run: (h) => (closeMenus(h), this.clearAll()) },
        ],
      },
      { label: `${this.paired ? 2 : 1}-Variab-Berech`, run: (h) => (closeMenus(h), this.openList('editor')) },
    ];
    if (this.paired) items.push({ label: 'Regression', run: (h) => (closeMenus(h), this.openReg('editor')) });
    return items;
  }

  /** OPTN auf dem Bildschirm für statistische Berechnungen. */
  private calcMenu(): MenuItem[] {
    const put = (tok: string) => (h: Host) => (closeMenus(h), this.insertToken(`stat:${tok}`));
    const entry = (id: string): MenuItem => ({ label: VAR_BY_ID.get(id)?.text ?? id, run: put(id) });
    const group = (ids: string[]): MenuItem[] => ids.map(entry);
    const p = this.paired;
    const items: MenuItem[] = [
      { label: 'Typ auswählen', sub: this.typeItems() },
      { label: `${p ? 2 : 1}-Variab-Berech`, run: (h) => (closeMenus(h), this.openList('calc')) },
    ];
    if (p) items.push({ label: 'Regression', run: (h) => (closeMenus(h), this.openReg('calc')) });
    items.push(
      { label: 'Daten', run: (h) => (closeMenus(h), (this.phase = 'editor')) },
      { label: 'Summe', sub: group(p ? ['sumX', 'sumX2', 'sumY', 'sumY2', 'sumXY', 'sumX3', 'sumX2Y', 'sumX4'] : ['sumX', 'sumX2']) },
      { label: 'Variable', sub: group(p ? ['n', 'meanX', 'varPopX', 'sdPopX', 'varSX', 'sdSX', 'meanY', 'varPopY', 'sdPopY', 'varSY', 'sdSY'] : ['n', 'meanX', 'varPopX', 'sdPopX', 'varSX', 'sdSX']) },
      { label: 'Min/Max', sub: group(p ? ['minX', 'maxX', 'minY', 'maxY'] : ['minX', 'maxX', 'q1', 'med', 'q3']) },
    );
    if (p) {
      const est = this.type === 'quad'
        ? [entry('a'), entry('b'), entry('c'), cmd('x1hat'), cmd('x2hat'), cmd('yhat')]
        : [entry('a'), entry('b'), entry('r'), cmd('xhat'), cmd('yhat')];
      items.push({ label: 'Regressionen', sub: est });
    } else {
      items.push({ label: 'Normal-Vert.', sub: [normalFn('P('), normalFn('Q('), normalFn('R('), cmd('t')] });
    }
    return items;

    function cmd(id: string): MenuItem {
      return { label: TOKENS[`stat:${id}`].text, run: put(id) };
    }
    function normalFn(id: string): MenuItem {
      return { label: id, run: put(id) };
    }
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.phase === 'type') return this.menu!.handle(ev, host);
    if (this.stoPending) {
      this.stoPending = false;
      const name = ev.mod === 'none' || ev.mod === 'alpha' ? STO_KEYS[ev.key] : undefined;
      if (name && this.shown) {
        host.state.vars[name] = V.serialize(this.shown.value);
        host.persist();
      }
      return true;
    }
    if (!a) return false;
    switch (this.phase) {
      case 'editor': return this.handleEditor(a, host);
      case 'calc': return this.handleCalc(a, host);
      case 'list':
      case 'reg': return this.handleList(a);
      case 'error':
        if (a === 'sys:ac') {
          if (this.back === 'calc') this.cEd.clear();
          this.phase = this.back;
        } else if (a === 'nav:left' || a === 'nav:right') this.phase = this.back;
        return true;
    }
    return false;
  }

  private handleList(a: string): boolean {
    if (a === 'sys:ac') this.phase = this.back;
    else if (this.phase === 'list') {
      const max = Math.max(0, this.listItems.length - LIST_LINES);
      if (a === 'nav:down') this.ls = Math.min(max, this.ls + 1);
      else if (a === 'nav:up') this.ls = Math.max(0, this.ls - 1);
    }
    return true;
  }

  // Editor

  private colKind(): number {
    return this.cols[this.c];
  }

  private handleEditor(a: string, host: Host): boolean {
    switch (a) {
      case 'sys:optn':
        host.push(new ListMenu(this.editorMenu()));
        return true;
      case 'sys:qr':
        this.openPlot(host);
        return true;
      case 'sys:ac':
        if (this.input.editing) this.input.cancel();
        else this.phase = 'calc';
        return true;
      case 'cmd:exe':
        if (this.input.editing && !this.commit()) return true;
        this.move('nav:down', false);
        return true;
      case 'nav:up':
      case 'nav:down':
      case 'nav:left':
      case 'nav:right':
        if (this.input.editing && (a === 'nav:left' || a === 'nav:right')) return this.input.handle(a);
        if (this.input.editing && !this.commit()) return true;
        this.move(a, true);
        return true;
      case 'edit:del':
        if (this.input.editing) return this.input.handle(a);
        if (this.r < this.rows.length) {
          this.rows.splice(this.r, 1);
          this.save();
        }
        return true;
    }
    return this.input.handle(a);
  }

  /** Diagramm statt QR-Code; ohne (gültige) Daten passiert nichts. */
  private openPlot(host: Host): void {
    try {
      const set = this.buildSet();
      if (set.x.length > 0) host.push(new StatPlot(set, this.stat()));
    } catch {
      // keine Daten: nichts tun
    }
  }

  private commit(): boolean {
    try {
      const v = this.input.commit(evalContext(this.host.state));
      if (v) {
        if (!Number.isFinite(V.toNumber(v))) throw new CalcError('math');
        this.write(v);
      }
      return true;
    } catch (e) {
      this.fail(e, 'editor');
      return false;
    }
  }

  private write(v: Value): void {
    let row = this.rows[this.r];
    if (!row) {
      if (this.rows.length >= this.maxRows) return;
      row = [null, null, V.ONE];
      this.rows.push(row);
    }
    row[this.colKind()] = v;
    this.save();
  }

  private move(a: string, wrap: boolean): void {
    const n = this.displayRows;
    if (a === 'nav:down') this.r = this.r + 1 < n ? this.r + 1 : wrap ? 0 : this.r;
    else if (a === 'nav:up') this.r = this.r > 0 ? this.r - 1 : wrap ? n - 1 : 0;
    else if (a === 'nav:left') this.c = Math.max(0, this.c - 1);
    else this.c = Math.min(this.cols.length - 1, this.c + 1);
    if (this.r < this.top) this.top = this.r;
    if (this.r > this.top + ROWS_SHOWN - 1) this.top = this.r - ROWS_SHOWN + 1;
  }

  private insertRow(): void {
    if (this.rows.length < this.maxRows) {
      this.rows.splice(Math.min(this.r, this.rows.length), 0, [null, null, V.ONE]);
      this.save();
    }
  }

  private clearAll(): void {
    this.rows = [];
    this.r = this.c = this.top = 0;
    this.save();
  }

  // Berechnungsbildschirm

  private get linear(): boolean {
    const io = this.host.state.settings.io;
    return io === 'linLin' || io === 'linDec';
  }

  /** Fügt ein Token ein; ein angezeigtes Ergebnis startet eine neue Eingabe (Befehle mit Argument setzen Ans fort). */
  insertToken(tok: string): void {
    this.startInput(TOKENS[tok]?.kind === 'postfix');
    this.cEd.insertToken(tok);
    this.phase = 'calc';
  }

  private startInput(withAns: boolean): void {
    if (this.shown) {
      this.cEd.clear();
      this.shown = undefined;
      if (withAns) this.cEd.insertToken('Ans');
    }
  }

  private handleCalc(a: string, host: Host): boolean {
    const ed = this.cEd;
    switch (a) {
      case 'sys:optn':
        host.push(new ListMenu(this.calcMenu()));
        return true;
      case 'sys:qr':
        this.openPlot(host);
        return true;
      case 'sys:ac':
        ed.clear();
        this.shown = undefined;
        return true;
      case 'cmd:exe':
        if (this.shown && ed.isEmpty) ed.load(this.shown.input);
        this.evaluate();
        return true;
      case 'cmd:sto':
        this.stoPending = true;
        return true;
      case 'cmd:sd':
        if (this.shown?.exact) this.shown.showExact = !this.shown.showExact;
        return true;
      case 'nav:left':
      case 'nav:right':
      case 'edit:del':
        if (this.shown) {
          ed.load(this.shown.input, a === 'nav:right');
          this.shown = undefined;
        } else if (a === 'nav:left') ed.moveLeft();
        else if (a === 'nav:right') ed.moveRight();
        else ed.del();
        return true;
      case 'nav:up': ed.moveVertical(-1); return true;
      case 'nav:down': ed.moveVertical(1); return true;
      case 'edit:undo': ed.undo(); return true;
      case 'edit:ins': return true;
    }
    if (!isInsertAction(a)) return false;
    this.startInput(continuesWithAns(a));
    return applyInsertAction(ed, a, this.linear);
  }

  private evaluate(): void {
    const ed = this.cEd;
    if (ed.isEmpty) return;
    const input = ed.snapshot().root;
    try {
      const st = this.host.state;
      const value = evalStatSlot(input, this.stat(), evalContext(st));
      const s = st.settings;
      const exact = exactForm(value, s, { linear: this.linear, mixed: s.fraction === 'mixed' });
      this.shown = { input, value, exact, decimal: decimalForm(value, s), showExact: s.io === 'mathMath' || s.io === 'linLin' };
      st.ans = V.serialize(value);
      ed.clear();
      this.host.persist();
    } catch (e) {
      this.fail(e, 'calc');
    }
  }

  private formOf(e: Entry): ResultForm {
    return e.exact && e.showExact ? e.exact : e.decimal;
  }

  // --- Anzeige ---

  /** Wert im aktuellen Zahlenformat als einzeiliger Text. */
  private valueText(v: Value): string {
    const f = decimalForm(v, this.host.state.settings);
    return f.kind === 'decimal' ? f.mantissa + (f.exponent !== undefined ? `×10^${f.exponent}` : '') : '';
  }

  render(): Scene {
    switch (this.phase) {
      case 'type': return this.menu!.render();
      case 'error': return errorScene(this.error!.message);
      case 'editor': return this.renderEditor();
      case 'calc': return this.renderCalc();
      case 'list': return this.renderList();
      case 'reg': return this.renderReg();
    }
  }

  private renderEditor(): Scene {
    const ops: DrawOp[] = [];
    const cols = this.cols;
    const names = ['𝑥', '𝑦', 'Freq'];
    cols.forEach((k, ci) => {
      const x0 = COL_X0 + ci * COL_W;
      ops.push({ kind: 'text', x: x0 + Math.floor(COL_W / 2) - (k === 2 ? 11 : 3), y: 0, text: names[k], font: 'S' });
      ops.push({ kind: 'line', x1: x0 + COL_W - 1, y1: 9, x2: x0 + COL_W - 1, y2: 46 });
    });
    ops.push({ kind: 'line', x1: 8, y1: 9, x2: 8, y2: 46 });
    for (let i = 0; i < ROWS_SHOWN; i++) {
      const ri = this.top + i;
      if (ri >= this.displayRows) break;
      const y = 10 + i * 9;
      ops.push({ kind: 'text', x: 6, y, text: String(ri + 1), font: 'S', align: 'right' });
      cols.forEach((k, ci) => {
        const x0 = COL_X0 + ci * COL_W;
        const cell = this.rows[ri]?.[k];
        const active = ri === this.r && ci === this.c;
        if (active) ops.push({ kind: 'rect', x: x0, y: y - 1, w: COL_W - 1, h: 9, fill: true });
        if (cell) ops.push({ kind: 'text', x: x0 + COL_W - 4, y, text: clip(shortValue(cell), COL_W - 8), font: 'S', align: 'right', invert: active });
      });
    }
    let cursor: Scene['cursor'] = null;
    if (this.input.editing) {
      const lay = this.input.laid();
      const shift = Math.max(0, lay.w - (LCD_WIDTH - 2));
      ops.push({ kind: 'rect', x: 0, y: 48, w: LCD_WIDTH, h: 16, fill: true, erase: true });
      ops.push(...translate(lay, -shift, 48));
      if (lay.cursor) cursor = { x: lay.cursor.x - shift, y: lay.cursor.y + 48, h: lay.cursor.h };
    } else {
      const cell = this.rows[this.r]?.[this.colKind()];
      if (cell) ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: 48, text: shortValue(cell), font: 'L', align: 'right' });
    }
    return { ops, cursor };
  }

  private renderCalc(): Scene {
    const mode = this.linear ? 'linear' : 'math';
    const status = { sto: this.stoPending };
    if (!this.shown) {
      const lay = layoutInput(this.cEd.root, this.cEd.cursor, mode);
      const c = lay.cursor;
      const shift = c ? Math.max(0, c.x - (LCD_WIDTH - 3)) : 0;
      return { ops: translate(lay, -shift, 0), status, cursor: c ? { x: c.x - shift, y: c.y, h: c.h } : null };
    }
    const inLay = layoutInput(this.shown.input, null, mode);
    const res = layoutResult(this.formOf(this.shown), mode);
    const ops = [...translate(inLay, 0, 0), ...translate(res, Math.max(0, LCD_WIDTH - res.w), Math.max(inLay.h, LCD_HEIGHT - res.h))];
    return { ops, status, cursor: null };
  }

  private renderList(): Scene {
    const ops: DrawOp[] = [];
    this.listItems.slice(this.ls, this.ls + LIST_LINES).forEach((it, i) => {
      ops.push({ kind: 'text', x: 0, y: 1 + i * 10, text: it.label, font: 'S' });
      ops.push({ kind: 'text', x: 38, y: 1 + i * 10, text: `=${it.text}`, font: 'S' });
    });
    const n = this.listItems.length;
    if (n > LIST_LINES) {
      const h = Math.max(6, Math.floor((64 * LIST_LINES) / n));
      ops.push({ kind: 'rect', x: 189, y: Math.floor(((64 - h) * this.ls) / (n - LIST_LINES)), w: 3, h, fill: true });
    }
    return { ops, status: { up: this.ls > 0, down: this.ls + LIST_LINES < n } };
  }

  private renderReg(): Scene {
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 1, text: typeLabel(this.type), font: 'S' }];
    this.listItems.forEach((it, i) => ops.push({ kind: 'text', x: 24, y: 11 + i * 10, text: `${it.label}=${it.text}`, font: 'S' }));
    return { ops };
  }

  /** Für Tests. */
  get state(): { phase: Phase; type: StatType; rows: number; lines: string[]; result?: string } {
    const lines =
      this.phase === 'list' ? this.listItems.map((i) => `${i.label}=${i.text}`)
      : this.phase === 'reg' ? [typeLabel(this.type), ...this.listItems.map((i) => `${i.label}=${i.text}`)]
      : [];
    return { phase: this.phase, type: this.type, rows: this.rows.length, lines, result: this.shown && formToText(this.formOf(this.shown)) };
  }
}

function clip(text: string, maxPx: number): string {
  const max = Math.max(1, Math.floor(maxPx / 6));
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

