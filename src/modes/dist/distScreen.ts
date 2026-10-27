// Anwendung 7 „Verteilungsfkt.“: Typmenü, Variablen-Eingabe, Einzelergebnis und Listenbildschirm
// (k-Werte und P-Spalte) für die sieben Verteilungsfunktionen.

import { DistError } from '../../core/dist/distributions';
import { CalcError } from '../../core/errors';
import type { EvalContext } from '../../core/eval/evaluate';
import { decimalForm } from '../../core/format/result';
import { formatNumber } from '../../core/format/number';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutResult, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { KeyId } from '../../keys/keymap';
import type { Settings, VarName } from '../../calculator/state';
import { ValueInput, errorScene } from '../calc/prompt';
import { ListMenu, closeMenus, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import {
  DIST_TYPES, MAX_ROWS, PARAM_LABEL, defaultParam, distInfo, evaluate, loadData,
  type DistData, type DistInfo, type ParamKey,
} from './model';

/** Nach STO erreichbare Variablen (Taste → Name). */
const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

type Stage = 'type' | 'method' | 'params' | 'result' | 'list' | 'error';
type Cell = number | 'err';

/** Zeilen der Variablen-Eingabe unterhalb des Titels. */
const PARAM_LINES = 3;
/** Geometrie des Listenbildschirms (Punkte). */
const ROWS = 4;
const ROW_Y = 9;
const ROW_H = 8;
const X_L1 = 12;
const K_EDGE = 52;
const X_L2 = 53;
const P_X = 55;
const X_L3 = 91;
const LABEL_X = 93;
const VALUE_Y = 48;

export class DistScreen implements Screen {
  private cache: DistData | undefined;
  private stage: Stage = 'type';
  /** Eingebettetes Menü (Typ bzw. Eingabemethode), solange stage = 'type' | 'method'. */
  private menu: ListMenu | undefined;
  /** Bildschirm, zu dem AC im Typmenü zurückkehrt (nur wenn es über OPTN geöffnet wurde). */
  private resume: Stage | undefined;
  private readonly input = new ValueInput();
  private paramIdx = 0;
  private paramTop = 0;
  private result: number | undefined;
  private results: (Cell | undefined)[] | undefined;
  private row = 0;
  private col: 0 | 1 = 0;
  private listTop = 0;
  private stoPending = false;
  private error = '';
  private errorReturn: Stage = 'params';

  constructor(private readonly host: Host) {
    this.openTypeMenu();
  }

  // --- Zustand ---

  private get data(): DistData {
    const md = this.host.state.modeData;
    if (!this.cache || md.dist !== this.cache) this.cache = loadData(md);
    return this.cache!;
  }

  private get info(): DistInfo {
    return distInfo(this.data.type);
  }

  private get listMode(): boolean {
    return !!this.info.list && this.data.asList;
  }

  /** Abgefragte Variablen (bei Listeneingabe ohne k). */
  private get keys(): readonly ParamKey[] {
    return this.listMode ? this.info.params.filter((k) => k !== 'k') : this.info.params;
  }

  private param(key: ParamKey): Value {
    return V.deserialize(this.data.params[key] ?? defaultParam(key));
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

  private get list(): (V.SerializedValue | null)[] {
    return this.data.list;
  }

  private trimList(): void {
    const l = this.list;
    while (l.length > 0 && l[l.length - 1] === null) l.pop();
  }

  /** Zeilen des Listenbildschirms einschließlich der leeren Zeile am Ende. */
  private get rowCount(): number {
    return Math.min(this.list.length + 1, MAX_ROWS);
  }

  // --- Menüs ---

  private openTypeMenu(): void {
    this.stage = 'type';
    this.input.cancel();
    this.menu = new ListMenu(
      DIST_TYPES.map((t): MenuItem => ({ label: t.name, run: () => this.chooseType(t) })),
      { paged: true },
    );
  }

  private chooseType(t: DistInfo): void {
    const d = this.data;
    d.type = t.id;
    this.results = undefined;
    this.resume = undefined;
    if (!t.list) {
      d.asList = false;
      this.menu = undefined;
      this.enterParams();
      return;
    }
    this.stage = 'method';
    this.menu = new ListMenu(
      [
        { label: 'Liste', run: () => this.chooseMethod(true) },
        { label: 'Variable', run: () => this.chooseMethod(false) },
      ],
      { paged: true, title: 'Daten (k)' },
    );
  }

  private chooseMethod(asList: boolean): void {
    this.data.asList = asList;
    this.menu = undefined;
    if (asList) {
      this.stage = 'list';
      this.row = 0;
      this.col = 0;
      this.listTop = 0;
    } else this.enterParams();
    this.host.persist();
  }

  private enterParams(): void {
    this.stage = 'params';
    this.paramIdx = 0;
    this.paramTop = 0;
    this.input.cancel();
    this.host.persist();
  }

  private optnMenu(): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: 'Typ auswählen',
        run: (h) => {
          closeMenus(h);
          this.resume = this.stage;
          this.openTypeMenu();
        },
      },
    ];
    if (this.stage === 'list') {
      items.push({
        label: 'Editor',
        sub: [
          { label: 'Zeile einfügen', run: (h) => { closeMenus(h); this.insertRow(); } },
          { label: 'Alles löschen', run: (h) => { closeMenus(h); this.clearList(); } },
        ],
      });
    }
    return items;
  }

  // --- Tasten ---

  handle(ev: KeyEvent): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const name = ev.mod === 'none' || ev.mod === 'alpha' ? STO_KEYS[ev.key] : undefined;
      if (name) this.store(name);
      return true;
    }
    if (this.menu) return this.handleMenu(ev);
    if (!a) return false;
    if (a === 'sys:optn' && this.stage !== 'error') {
      this.host.push(new ListMenu(this.optnMenu()));
      return true;
    }
    switch (this.stage) {
      case 'params': return this.handleParams(a);
      case 'result': return this.handleResult(a);
      case 'list': return this.handleList(a);
      case 'error': return this.handleError(a);
    }
    return false;
  }

  private handleMenu(ev: KeyEvent): boolean {
    if (ev.action === 'sys:ac') {
      if (this.stage === 'method') this.openTypeMenu();
      else if (this.resume) {
        this.menu = undefined;
        this.stage = this.resume;
        this.resume = undefined;
      }
      return true;
    }
    return this.menu!.handle(ev, this.host);
  }

  private handleParams(a: string): boolean {
    const keys = this.keys;
    if (a === 'sys:ac') {
      if (this.input.editing) this.input.cancel();
      else if (this.listMode) this.stage = 'list';
      return true;
    }
    if (a === 'nav:up' || a === 'nav:down' || a === 'cmd:exe') {
      if (!this.commitParam()) return true;
      if (a === 'nav:up') this.paramIdx = Math.max(0, this.paramIdx - 1);
      else if (this.paramIdx < keys.length - 1) this.paramIdx++;
      else if (a === 'cmd:exe') this.compute();
      this.scrollParams();
      return true;
    }
    this.input.handle(a);
    return true;
  }

  private scrollParams(): void {
    if (this.paramIdx < this.paramTop) this.paramTop = this.paramIdx;
    if (this.paramIdx >= this.paramTop + PARAM_LINES) this.paramTop = this.paramIdx - PARAM_LINES + 1;
  }

  /** Übernimmt eine laufende Eingabe in die markierte Variable; false bei Fehler. */
  private commitParam(): boolean {
    try {
      const v = this.input.commit(this.context());
      if (v) {
        this.data.params[this.keys[this.paramIdx]] = V.serialize(v);
        this.results = undefined;
        this.host.persist();
      }
      return true;
    } catch (e) {
      return this.fail(e, 'params');
    }
  }

  private handleResult(a: string): boolean {
    if (a === 'cmd:exe' || a === 'sys:ac') this.enterParams();
    else if (a === 'cmd:sto') this.stoPending = true;
    return true;
  }

  private handleError(a: string): boolean {
    if (a === 'sys:ac' || a === 'nav:left' || a === 'nav:right') this.stage = this.errorReturn;
    return true;
  }

  private handleList(a: string): boolean {
    const ed = this.input.editing;
    switch (a) {
      case 'sys:ac':
        this.input.cancel();
        return true;
      case 'cmd:exe':
        if (ed) this.commitCell();
        else if (this.list.some((v) => v !== null)) this.enterParams();
        return true;
      case 'nav:up':
      case 'nav:down':
        this.input.cancel();
        this.moveRow(a === 'nav:down' ? 1 : -1);
        return true;
      case 'nav:left':
      case 'nav:right':
        if (ed) this.input.handle(a);
        else this.col = a === 'nav:left' ? 0 : 1;
        return true;
      case 'edit:del':
        if (ed) this.input.handle(a);
        else this.deleteRow();
        return true;
      case 'cmd:sto':
        if (!ed) this.stoPending = true;
        return true;
    }
    // Eingabe nur in der k-Spalte
    if (this.col === 0 || ed) this.input.handle(a);
    return true;
  }

  private moveRow(d: number): void {
    this.row = Math.min(this.rowCount - 1, Math.max(0, this.row + d));
    if (this.row < this.listTop) this.listTop = this.row;
    if (this.row >= this.listTop + ROWS) this.listTop = this.row - ROWS + 1;
  }

  /** Schreibt den eingegebenen k-Wert in die Zelle; alle Ergebnisse entfallen. */
  private commitCell(): void {
    try {
      const v = this.input.commit(this.context());
      if (v) {
        const l = this.list;
        while (l.length < this.row) l.push(null);
        l[this.row] = V.serialize(v);
        this.results = undefined;
        this.host.persist();
      }
      this.moveRow(1);
    } catch (e) {
      this.fail(e, 'list');
    }
  }

  private deleteRow(): void {
    if (this.row >= this.list.length) return;
    this.list.splice(this.row, 1);
    this.trimList();
    this.results = undefined;
    this.host.persist();
  }

  private insertRow(): void {
    if (this.row >= this.list.length || this.list.length >= MAX_ROWS) return;
    this.list.splice(this.row, 0, null);
    this.results = undefined;
    this.host.persist();
  }

  private clearList(): void {
    this.data.list = [];
    this.results = undefined;
    this.row = 0;
    this.col = 0;
    this.listTop = 0;
    this.host.persist();
  }

  // --- Rechnen ---

  private fail(e: unknown, back: Stage): false {
    if (!(e instanceof CalcError) && !(e instanceof DistError)) throw e;
    this.error = e.message;
    this.errorReturn = back;
    this.input.cancel();
    this.stage = 'error';
    return false;
  }

  private num(key: ParamKey): number {
    return V.toNumber(this.param(key));
  }

  private compute(): void {
    const type = this.data.type;
    try {
      if (!this.listMode) {
        const x = evaluate(type, (k) => this.num(k));
        this.result = x;
        const st = this.host.state;
        st.ans = V.serialize(V.fl(x));
        this.host.persist();
        this.stage = 'result';
        return;
      }
      // Ungültige n, p, μ … gelten für alle Zeilen: Fehlermeldung statt „ERROR“ je Zeile
      evaluate(type, (k) => (k === 'k' ? 0 : this.num(k)));
      this.results = this.list.map((kv) => {
        if (kv === null) return undefined;
        const k = V.toNumber(V.deserialize(kv));
        try {
          return evaluate(type, (key) => (key === 'k' ? k : this.num(key)));
        } catch (e) {
          if (e instanceof DistError) return 'err';
          throw e;
        }
      });
      this.stage = 'list';
    } catch (e) {
      this.fail(e, 'params');
    }
  }

  /** Wert der markierten Zelle bzw. des Einzelergebnisses. */
  private current(): Value | undefined {
    if (this.stage === 'result') return this.result === undefined ? undefined : V.fl(this.result);
    if (this.col === 0) {
      const kv = this.list[this.row];
      return kv ? V.deserialize(kv) : undefined;
    }
    const r = this.results?.[this.row];
    return typeof r === 'number' ? V.fl(r) : undefined;
  }

  private store(name: VarName): void {
    const v = this.current();
    if (!v) return;
    this.host.state.vars[name] = V.serialize(v);
    this.host.persist();
  }

  // --- Anzeige ---

  render(): Scene {
    const sto = this.stoPending;
    if (this.menu) return this.menu.render();
    switch (this.stage) {
      case 'error': return errorScene(this.error);
      case 'result': return { ...this.renderResult(), status: { sto } };
      case 'list': return { ...this.renderList(), status: { sto, up: this.listTop > 0, down: this.listTop + ROWS < this.rowCount } };
      default: return this.renderParams();
    }
  }

  private text(v: Value): string {
    return valueText(v, this.host.state.settings);
  }

  private renderParams(): Scene {
    const keys = this.keys;
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: this.info.name, font: 'L' }];
    let cursor: Scene['cursor'] = null;
    keys.slice(this.paramTop, this.paramTop + PARAM_LINES).forEach((key, r) => {
      const i = this.paramTop + r;
      const y = 16 + 16 * r;
      const current = i === this.paramIdx;
      const editing = current && this.input.editing;
      const hi = current && !editing;
      const label = `${paramLabel(key)}:`;
      const x0 = [...label].length * 11;
      if (hi) ops.push({ kind: 'rect', x: 0, y, w: LCD_WIDTH, h: 16, fill: true });
      ops.push({ kind: 'text', x: 0, y, text: label, font: 'L', invert: hi });
      if (editing) {
        const lay = this.input.laid();
        const shift = Math.max(0, x0 + lay.w - 190);
        for (const op of lay.ops) ops.push(shiftOp(op, x0 - shift, y));
        const c = lay.cursor;
        if (c) cursor = { x: c.x + x0 - shift, y: c.y + y, h: c.h };
      } else {
        ops.push({ kind: 'text', x: x0, y, text: this.text(this.param(key)), font: 'L', invert: hi });
      }
    });
    return {
      ops,
      cursor,
      status: { up: this.paramTop > 0, down: this.paramTop + PARAM_LINES < keys.length },
    };
  }

  private renderResult(): Scene {
    const ops: DrawOp[] = [
      { kind: 'text', x: 0, y: 0, text: this.info.name, font: 'L' },
      { kind: 'text', x: 0, y: 16, text: this.info.label, font: 'L' },
    ];
    ops.push(...this.bottomValue(this.current()));
    return { ops };
  }

  /** Wert unten rechts in großer Schrift. */
  private bottomValue(v: Value | undefined): DrawOp[] {
    if (!v) return [];
    try {
      const lay = layoutResult(decimalForm(v, this.host.state.settings), 'math');
      return translate(lay, Math.max(0, LCD_WIDTH - lay.w), LCD_HEIGHT - lay.h);
    } catch {
      return [];
    }
  }

  private renderList(): Scene {
    const ops: DrawOp[] = [];
    const lab = this.info.list ?? ['', ''];
    ops.push({ kind: 'text', x: LABEL_X, y: 0, text: lab[0], font: 'L' });
    ops.push({ kind: 'text', x: LABEL_X, y: 16, text: lab[1], font: 'L' });
    ops.push({ kind: 'text', x: 31, y: 0, text: 'k', font: 'S' });
    ops.push({ kind: 'text', x: 70, y: 0, text: 'P', font: 'S' });
    const bottom = ROW_Y + ROWS * ROW_H;
    for (const x of [X_L1, X_L2, X_L3]) ops.push({ kind: 'line', x1: x, y1: 0, x2: x, y2: bottom });

    for (let r = 0; r < ROWS; r++) {
      const i = this.listTop + r;
      if (i >= this.rowCount) break;
      const y = ROW_Y + r * ROW_H;
      ops.push({ kind: 'text', x: 0, y, text: String(i + 1), font: 'S' });
      const kv = this.list[i];
      const res = this.results?.[i];
      const kText = kv ? cellText(V.toNumber(V.deserialize(kv)), 6) : '';
      const pText = res === 'err' ? 'ERROR' : res === undefined ? '' : cellText(res, 6);
      const sel = i === this.row;
      if (sel && this.col === 0) ops.push({ kind: 'rect', x: X_L1 + 1, y, w: K_EDGE - X_L1 - 1, h: ROW_H, fill: true });
      if (sel && this.col === 1) ops.push({ kind: 'rect', x: X_L2 + 1, y, w: X_L3 - X_L2 - 1, h: ROW_H, fill: true });
      ops.push({ kind: 'text', x: K_EDGE, y, text: kText, font: 'S', align: 'right', invert: sel && this.col === 0 });
      ops.push({ kind: 'text', x: P_X, y, text: pText, font: 'S', invert: sel && this.col === 1 });
    }

    if (this.input.editing) {
      const lay = this.input.laid();
      const shift = Math.max(0, lay.w - 190);
      for (const op of lay.ops) ops.push(shiftOp(op, -shift, VALUE_Y));
      const c = lay.cursor;
      return { ops, cursor: c ? { x: c.x - shift, y: c.y + VALUE_Y, h: c.h } : null };
    }
    ops.push(...this.bottomValue(this.current()));
    return { ops };
  }

  /** Für Tests: Bildschirmzustand und Listenergebnisse. */
  get state(): { stage: Stage; type: string; result?: number; results?: (Cell | undefined)[]; row: number; col: number } {
    return { stage: this.stage, type: this.data.type, result: this.result, results: this.results, row: this.row, col: this.col };
  }
}

/** Beschriftung der Parameterzeile: Symbole eingerückt, auf 6 Zeichen aufgefüllt. */
function paramLabel(key: ParamKey): string {
  const l = PARAM_LABEL[key];
  const s = [...l].length <= 2 ? ` ${l}` : l;
  return s + ' '.repeat(Math.max(0, 6 - [...s].length));
}

/** Wert im Format der Einstellungen als einzeiliger Text. */
function valueText(v: Value, s: Settings): string {
  try {
    const f = decimalForm(v, s);
    return f.kind === 'decimal' ? f.mantissa + (f.exponent !== undefined ? `×10^${f.exponent}` : '') : '';
  } catch {
    return '';
  }
}

/** Zahl für eine schmale Listenzelle: überzählige Stellen werden abgeschnitten wie am Original (0,0709; 1,2E-7). */
function cellText(x: number, maxChars: number): string {
  try {
    const d = formatNumber(x, { kind: 'norm', n: 1 });
    const tail = d.exponent !== undefined ? `E${d.exponent}` : '';
    return d.mantissa.slice(0, Math.max(1, maxChars - tail.length)).replace(/,$/, '') + tail;
  } catch {
    return ''; // Überlauf: Zelle bleibt leer
  }
}

function shiftOp(op: DrawOp, dx: number, dy: number): DrawOp {
  switch (op.kind) {
    case 'line': return { ...op, x1: op.x1 + dx, x2: op.x2 + dx, y1: op.y1 + dy, y2: op.y2 + dy };
    default: return { ...op, x: op.x + dx, y: op.y + dy };
  }
}
