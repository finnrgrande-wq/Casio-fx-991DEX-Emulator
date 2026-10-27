// Anwendungen 4 „Matrizen“ und 5 „Vektorrechnung“: Variablen definieren und bearbeiten,
// Rechnungsbildschirm, MatAns/VctAns-Anzeige. Beide Modi teilen sich diesen Bildschirm.

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import * as LA from '../../core/linalg/matrix';
import type { Matrix, Vector } from '../../core/linalg/matrix';
import { parse } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { Editor, type Cursor } from '../../editor/model';
import type { KeyId } from '../../keys/keymap';
import { evalContext } from '../../calculator/context';
import { ListMenu, closeMenus, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { applyInsertAction, continuesWithAns } from '../calc/input';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';
import { TensorEvaluator, loadTensor, saveTensor, type StoredTensor } from './tensorEval';

export type TensorKind = 'mat' | 'vec';
type Phase = 'pick' | 'rows' | 'cols' | 'dim' | 'editor' | 'calc' | 'result' | 'ans' | 'error';

const DIGITS: KeyId[] = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
/** Tasten für A–D (ohne ALPHA), z. B. zum Kopieren nach STO. */
const SLOT_KEYS: KeyId[] = ['NEG', 'DMS', 'INV', 'SIN'];
const VISIBLE_ROWS = 3;

export class TensorScreen implements Screen {
  private phase: Phase = 'pick';
  private pickEdit = false;
  private slot = 0;
  private rowsWanted = 1;
  private r = 0;
  private c = 0;
  private top = 0;
  private readonly input = new ValueInput();
  private readonly editor = new Editor();
  private result: { value: Value; exact?: ResultForm; showExact: boolean } | undefined;
  private error: CalcError | undefined;
  private stoPending = false;

  constructor(
    private readonly host: Host,
    readonly kind: TensorKind,
  ) {}

  private get names(): string[] {
    const p = this.kind === 'mat' ? 'Mat' : 'Vct';
    return [`${p}A`, `${p}B`, `${p}C`, `${p}D`];
  }

  private get ansName(): string {
    return this.kind === 'mat' ? 'MatAns' : 'VctAns';
  }

  private get linear(): boolean {
    const io = this.host.state.settings.io;
    return io === 'linLin' || io === 'linDec';
  }

  // --- Speicher ---

  private get stored(): Record<string, StoredTensor> {
    const data = this.host.state.modeData;
    data[this.kind] ??= {};
    return data[this.kind] as Record<string, StoredTensor>;
  }

  private get(name: string): Matrix | Vector | undefined {
    const s = this.stored[name];
    return s && loadTensor(s);
  }

  private put(name: string, t: Matrix | Vector): void {
    this.stored[name] = saveTensor(t);
    this.host.persist();
  }

  /** Die gerade bearbeitete oder angezeigte Variable. */
  private get current(): Matrix | Vector | undefined {
    return this.get(this.phase === 'ans' ? this.ansName : this.names[this.slot]);
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const target = SLOT_KEYS.indexOf(ev.key);
      const src = this.current;
      if (target >= 0 && src && (this.phase === 'editor' || this.phase === 'ans')) {
        // Kopieren in eine andere Variable, danach deren Editor
        this.put(this.names[target], src);
        this.openEditor(target);
      }
      return true;
    }
    if (a === 'sys:optn' && this.phase !== 'pick' && this.phase !== 'rows' && this.phase !== 'cols' && this.phase !== 'dim') {
      host.push(new ListMenu(this.optnMenu(), { paged: true }));
      return true;
    }
    switch (this.phase) {
      case 'pick': {
        const d = DIGITS.indexOf(ev.key) - 1;
        if (d >= 0 && d < 4) {
          this.slot = d;
          const existing = this.get(this.names[d]);
          if (this.pickEdit && existing) this.openEditor(d);
          else this.phase = this.kind === 'mat' ? 'rows' : 'dim';
        } else if (a === 'sys:ac') this.phase = 'calc';
        return true;
      }
      case 'rows':
      case 'cols':
      case 'dim':
        return this.handleDimension(ev.key, a);
      case 'editor':
        return this.handleEditor(a);
      case 'error':
        if (a === 'sys:ac') this.phase = 'calc';
        else if (a === 'nav:left' || a === 'nav:right') {
          this.phase = 'calc';
          if (this.error?.at) this.setCursor(this.error.at);
        }
        return true;
      case 'ans':
        return this.handleAns(a);
      case 'result':
      case 'calc':
        return this.handleCalc(a);
    }
  }

  private handleDimension(key: KeyId, a: string | undefined): boolean {
    const d = DIGITS.indexOf(key);
    if (a === 'sys:ac') {
      this.phase = 'calc';
      return true;
    }
    if (this.phase === 'dim') {
      if (d === 2 || d === 3) {
        this.put(this.names[this.slot], LA.vec(...Array.from({ length: d }, () => V.ZERO)));
        this.openEditor(this.slot);
      }
      return true;
    }
    if (d < 1 || d > 4) return true;
    if (this.phase === 'rows') {
      this.rowsWanted = d;
      this.phase = 'cols';
      return true;
    }
    this.put(this.names[this.slot], LA.mat(Array.from({ length: this.rowsWanted }, () => Array.from({ length: d }, () => V.ZERO))));
    this.openEditor(this.slot);
    return true;
  }

  private openEditor(slot: number): void {
    this.slot = slot;
    this.r = 0;
    this.c = 0;
    this.top = 0;
    this.input.cancel();
    this.phase = 'editor';
  }

  private dims(t: Matrix | Vector): [number, number] {
    return 'rows' in t ? [t.rows, t.cols] : [t.n, 1];
  }

  private handleEditor(a: string | undefined): boolean {
    if (!a) return true;
    const t = this.current!;
    const [rows, cols] = this.dims(t);
    switch (a) {
      case 'sys:ac':
        if (this.input.editing) this.input.cancel();
        else this.toCalc();
        return true;
      case 'cmd:sto':
        this.stoPending = true;
        return true;
      case 'cmd:exe':
        if (this.input.editing && this.commit()) this.step(rows, cols, 'nav:right');
        return true;
      case 'nav:up':
      case 'nav:down':
      case 'nav:left':
      case 'nav:right':
        if (this.input.editing && (a === 'nav:left' || a === 'nav:right')) return this.input.handle(a);
        if (this.commit()) this.step(rows, cols, a);
        return true;
    }
    this.input.handle(a);
    return true;
  }

  /** Schreibt eine laufende Eingabe in die aktuelle Zelle. */
  private commit(): boolean {
    try {
      const v = this.input.commit(evalContext(this.host.state));
      if (!v) return true;
      const t = this.current!;
      if ('rows' in t) {
        const a = t.a.map((row) => [...row]);
        a[this.r][this.c] = v;
        this.put(this.names[this.slot], LA.mat(a));
      } else {
        const vv = [...t.v];
        vv[this.r] = v;
        this.put(this.names[this.slot], LA.vec(...vv));
      }
      return true;
    } catch (e) {
      return this.fail(e);
    }
  }

  private step(rows: number, cols: number, a: string): void {
    if (a === 'nav:right') {
      if (this.c < cols - 1) this.c++;
      else if (this.r < rows - 1) (this.r++, (this.c = 0));
    } else if (a === 'nav:left') {
      if (this.c > 0) this.c--;
      else if (this.r > 0) (this.r--, (this.c = cols - 1));
    } else if (a === 'nav:down') this.r = Math.min(rows - 1, this.r + 1);
    else this.r = Math.max(0, this.r - 1);
    if (this.r < this.top) this.top = this.r;
    if (this.r >= this.top + VISIBLE_ROWS) this.top = this.r - VISIBLE_ROWS + 1;
  }

  private handleAns(a: string | undefined): boolean {
    if (!a) return true;
    const t = this.current;
    if (!t) return true;
    const [rows, cols] = this.dims(t);
    if (a.startsWith('nav:')) {
      this.step(rows, cols, a);
      return true;
    }
    if (a === 'cmd:sto') {
      this.stoPending = true;
      return true;
    }
    if (a === 'sys:ac') {
      this.toCalc();
      return true;
    }
    // Operatoren setzen mit MatAns/VctAns fort
    if (continuesWithAns(a) || a === 'in:inverse' || a === 'in:square' || a === 'in:cube') {
      this.toCalc();
      this.editor.insertToken(this.ansName);
      applyInsertAction(this.editor, a, this.linear);
    }
    return true;
  }

  private handleCalc(a: string | undefined): boolean {
    if (!a) return true;
    const ed = this.editor;
    if (this.phase === 'result') {
      if (a === 'cmd:sd' && this.result?.exact) {
        this.result.showExact = !this.result.showExact;
        return true;
      }
      if (a === 'sys:ac' || a.startsWith('nav:') || a === 'cmd:exe') {
        if (a === 'nav:left' || a === 'nav:right') this.phase = 'calc';
        else if (a === 'sys:ac') this.toCalc();
        return true;
      }
      ed.clear();
      this.phase = 'calc';
      if (continuesWithAns(a)) ed.insertToken('Ans');
    }
    switch (a) {
      case 'sys:ac': ed.clear(); return true;
      case 'nav:left': ed.moveLeft(); return true;
      case 'nav:right': ed.moveRight(); return true;
      case 'nav:up': ed.moveVertical(-1); return true;
      case 'nav:down': ed.moveVertical(1); return true;
      case 'edit:del': ed.del(); return true;
      case 'edit:undo': ed.undo(); return true;
      case 'edit:ins':
        if (this.linear) ed.overwrite = !ed.overwrite;
        else ed.wrapNext = true;
        return true;
      case 'cmd:exe':
      case 'cmd:approx':
        this.execute(a === 'cmd:approx');
        return true;
    }
    applyInsertAction(ed, a, this.linear);
    return true;
  }

  private toCalc(): void {
    this.input.cancel();
    this.editor.clear();
    this.phase = 'calc';
  }

  private setCursor(at: Cursor): void {
    try {
      if (at.pos <= this.editor.slotAt(at.path).length) this.editor.setCursor(at);
    } catch {
      // Fehlerstelle nicht erreichbar – Cursor bleibt am Ende
    }
  }

  private execute(approx: boolean): void {
    if (this.editor.isEmpty) return;
    try {
      const statements = parse(this.editor.root);
      if (statements.length !== 1 || statements[0].kind !== 'expr') throw new CalcError('syntax');
      const ev = new TensorEvaluator(evalContext(this.host.state), { get: (n) => this.get(n) });
      ev.angleUnit = this.host.state.settings.angle;
      const res = ev.eval(statements[0].expr);
      if (res.k === 'scalar') {
        const s = this.host.state.settings;
        this.host.state.ans = V.serialize(res.v);
        const exact = exactForm(res.v, s);
        this.result = { value: res.v, exact, showExact: !approx && s.io === 'mathMath' && !!exact };
        this.phase = 'result';
      } else {
        this.put(this.ansName, res.k === 'mat' ? res.m : res.v);
        this.r = 0;
        this.c = 0;
        this.top = 0;
        this.phase = 'ans';
      }
      this.host.persist();
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): false {
    if (!(e instanceof CalcError)) throw e;
    this.error = e;
    this.phase = 'error';
    return false;
  }

  private optnMenu(): MenuItem[] {
    const put = (tok: string) => (h: Host) => {
      closeMenus(h);
      if (this.phase !== 'calc') this.toCalc();
      this.editor.insertToken(tok);
    };
    const define = (edit: boolean) => (h: Host) => {
      closeMenus(h);
      this.pickEdit = edit;
      this.phase = 'pick';
    };
    if (this.kind === 'mat') {
      return [
        { label: 'Mat. definieren', run: define(false) },
        { label: 'Mat. bearbeiten', run: define(true) },
        ...['MatA', 'MatB', 'MatC', 'MatD', 'MatAns'].map((n) => ({ label: n, run: put(n) })),
        { label: 'Determinante', run: put('Det(') },
        { label: 'Transponierte', run: put('Trn(') },
        { label: 'Einheitsmatrix', run: put('Identity(') },
        { label: 'Stufenform REF', run: put('Ref(') },
        { label: 'Stufenform RREF', run: put('Rref(') },
      ];
    }
    return [
      { label: 'Vek. definieren', run: define(false) },
      { label: 'Vek. bearbeiten', run: define(true) },
      ...['VctA', 'VctB', 'VctC', 'VctD', 'VctAns'].map((n) => ({ label: n, run: put(n) })),
      { label: 'Skalarprodukt', run: put('•') },
      { label: 'Winkel', run: put('Angle(') },
      { label: 'Einheitsvektor', run: put('UnitV(') },
    ];
  }

  // --- Anzeige ---

  render(): Scene {
    const lines = (texts: string[]): Scene => ({
      ops: texts.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp),
    });
    const name = this.names[this.slot];
    switch (this.phase) {
      case 'pick': {
        const p = this.kind === 'mat' ? 'Mat' : 'Vek';
        const n = this.names;
        return lines([`${p}. ${this.pickEdit ? 'bearbeiten' : 'definieren'}`, `1:${n[0]}   2:${n[1]}`, `3:${n[2]}   4:${n[3]}`]);
      }
      case 'rows':
        return lines([name, 'Zeilen?', '', '1~4 wählen']);
      case 'cols':
        return lines([name, 'Spalten?', '', '1~4 wählen']);
      case 'dim':
        return lines([name, 'Dimension?', '', '2~3 wählen']);
      case 'error':
        return errorScene(this.error!.message);
      case 'editor':
      case 'ans':
        return this.renderGrid(this.phase === 'ans' ? this.ansName : name);
      case 'result':
      case 'calc':
        return this.renderCalc();
    }
  }

  private renderGrid(label: string): Scene {
    const t = this.get(label);
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: `${label}=`, font: 'S' }];
    if (!t) return { ops };
    const [rows, cols] = this.dims(t);
    const cell = (r: number, c: number): Value => ('rows' in t ? t.a[r][c] : t.v[r]);
    const x0 = 8;
    const cellW = Math.floor((LCD_WIDTH - x0 - 6) / cols);
    const visible = Math.min(rows, VISIBLE_ROWS);
    const y0 = 10;
    ops.push({ kind: 'line', x1: x0 - 4, y1: y0 - 1, x2: x0 - 4, y2: y0 + visible * 11 - 2 });
    ops.push({ kind: 'line', x1: x0 - 4, y1: y0 - 1, x2: x0 - 2, y2: y0 - 1 });
    ops.push({ kind: 'line', x1: x0 - 4, y1: y0 + visible * 11 - 2, x2: x0 - 2, y2: y0 + visible * 11 - 2 });
    const xr = x0 + cols * cellW;
    ops.push({ kind: 'line', x1: xr, y1: y0 - 1, x2: xr, y2: y0 + visible * 11 - 2 });
    ops.push({ kind: 'line', x1: xr - 2, y1: y0 - 1, x2: xr, y2: y0 - 1 });
    ops.push({ kind: 'line', x1: xr - 2, y1: y0 + visible * 11 - 2, x2: xr, y2: y0 + visible * 11 - 2 });
    for (let k = 0; k < visible; k++) {
      const r = this.top + k;
      for (let c = 0; c < cols; c++) {
        const active = r === this.r && c === this.c;
        const x = x0 + c * cellW;
        const y = y0 + k * 11;
        const text = clip(shortValue(cell(r, c)), cellW - 3);
        if (active) ops.push({ kind: 'rect', x, y: y - 1, w: cellW - 2, h: 9, fill: true });
        ops.push({ kind: 'text', x: x + cellW - 4, y, text, font: 'S', align: 'right', invert: active });
      }
    }
    let cursor: Scene['cursor'] = null;
    if (this.phase === 'editor' && this.input.editing) {
      const lay = this.input.laid();
      ops.push(...translate(lay, 0, 48));
      if (lay.cursor) cursor = { x: lay.cursor.x, y: lay.cursor.y + 48, h: lay.cursor.h };
    } else {
      ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: 48, text: shortValue(cell(this.r, this.c)), font: 'L', align: 'right' });
    }
    return { ops, cursor, status: { up: this.top > 0, down: this.top + visible < rows } };
  }

  private renderCalc(): Scene {
    const mode = this.linear ? 'linear' : 'math';
    const lay = layoutInput(this.editor.root, this.phase === 'calc' ? this.editor.cursor : null, mode);
    const ops = translate(lay, 0, 0);
    if (this.phase === 'result' && this.result) {
      const res = layoutResult(this.form()!, mode);
      ops.push(...translate(res, Math.max(0, LCD_WIDTH - res.w), LCD_HEIGHT - res.h));
      return { ops };
    }
    return { ops, cursor: lay.cursor ?? null };
  }

  private form(): ResultForm | undefined {
    const r = this.result;
    if (!r) return undefined;
    return r.showExact && r.exact ? r.exact : decimalForm(r.value, this.host.state.settings);
  }

  /** Für Tests. */
  get state(): { phase: Phase; result?: ResultForm; ans?: Value[][] } {
    const t = this.phase === 'ans' ? this.get(this.ansName) : undefined;
    return {
      phase: this.phase,
      result: this.phase === 'result' ? this.form() : undefined,
      ans: t && ('rows' in t ? t.a : t.v.map((x) => [x])),
    };
  }
}

function clip(text: string, maxPx: number): string {
  const max = Math.max(1, Math.floor(maxPx / 6));
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
