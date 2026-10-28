// Anwendung 2 „Komplexe Zahlen“: wie Berechnungen, aber mit komplexen Werten a+bi (exakte Teile).
// Ausgabe als a+bi oder r∠θ (SETUP bzw. ▸a+bi / ▸r∠θ), S⇔D wechselt exakt/dezimal.

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import { parse, type Statement } from '../../core/parser/parser';
import { freeVariables } from '../../core/parser/vars';
import * as V from '../../core/value';
import type { SerializedValue } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import { formToText, type ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { Editor, type Cursor, type Slot } from '../../editor/model';
import type { KeyId } from '../../keys/keymap';
import type { VarName } from '../../calculator/state';
import { evalContext } from '../../calculator/context';
import { ListMenu, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { applyInsertAction, continuesWithAns, isInsertAction } from '../calc/input';
import { RecallScreen } from '../calc/recallScreen';
import { CalcPrompt, type PromptOwner } from '../calc/calcPrompt';
import { cabs, carg, cadd, csub, ComplexEvaluator, isReal, real, type C, type CContext } from './complexEval';

const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

const MAX_HISTORY = 30;

type Force = 'rect' | 'polar';
type View = 'exact' | 'decimal';
type Phase = 'edit' | 'result' | 'error';

interface Entry {
  input: Slot;
  value: C;
  force?: Force;
  views: View[];
  vi: number;
  suffix?: string;
}

/** Komplexe Variablen/Ans neben den reellen Werten in state.vars (dort steht der Realteil). */
interface Store {
  vars: Record<string, { re: SerializedValue; im: SerializedValue }>;
  ans?: { re: SerializedValue; im: SerializedValue };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export class ComplexScreen implements Screen, PromptOwner {
  readonly editor = new Editor();
  private phase: Phase = 'edit';
  private history: Entry[] = [];
  private view = 0;
  private error: CalcError | undefined;
  private stoPending = false;
  private scrollX = 0;

  constructor(private readonly host: Host) {}

  private get settings() {
    return this.host.state.settings;
  }

  private get linear(): boolean {
    return this.settings.io === 'linLin' || this.settings.io === 'linDec';
  }

  private get shown(): Entry | undefined {
    return this.history[this.history.length - 1 - this.view];
  }

  private get store(): Store {
    const md = this.host.state.modeData;
    return (md.complex ??= { vars: {} }) as Store;
  }

  // --- Werte ---

  private getC(name: string): C {
    const st = this.host.state;
    const re = V.deserialize(st.vars[name as VarName]);
    const cv = this.store.vars[name];
    // Wurde der Realteil anderswo überschrieben, gilt die Variable als reell
    return cv && same(cv.re, st.vars[name as VarName]) ? { re, im: V.deserialize(cv.im) } : real(re);
  }

  private get ansC(): C {
    const st = this.host.state;
    const a = this.store.ans;
    return a && same(a.re, st.ans) ? { re: V.deserialize(a.re), im: V.deserialize(a.im) } : real(V.deserialize(st.ans));
  }

  private setVar(name: VarName, z: C): void {
    const st = this.host.state;
    st.vars[name] = V.serialize(z.re);
    if (isReal(z)) delete this.store.vars[name];
    else this.store.vars[name] = { re: V.serialize(z.re), im: V.serialize(z.im) };
  }

  context(): CContext {
    return { ...evalContext(this.host.state), getVar: (n) => this.getC(n).re, getC: (n) => this.getC(n), ansC: this.ansC };
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const name = ev.mod === 'none' || ev.mod === 'alpha' ? STO_KEYS[ev.key] : undefined;
      if (name) this.storeTo(name);
      return true;
    }
    if (this.phase === 'error') return this.handleError(a);
    if (!a) return false;

    switch (a) {
      case 'sys:ac':
        this.editor.clear();
        this.phase = 'edit';
        this.view = 0;
        return true;
      case 'cmd:exe':
        if (this.phase === 'result' && this.editor.isEmpty) {
          this.editor.load(this.shown!.input);
          this.execute({});
        } else this.execute({});
        return true;
      case 'cmd:sto':
        this.stoPending = true;
        return true;
      case 'cmd:recall':
        host.push(new RecallScreen((name) => this.insertToken(name)));
        return true;
      case 'cmd:mplus':
      case 'cmd:mminus':
        this.memory(a === 'cmd:mplus' ? 1 : -1);
        return true;
      case 'cmd:calc':
        this.startPrompt();
        return true;
      case 'cmd:solve':
        return true; // SOLVE gibt es nur in Berechnungen
      case 'sys:optn':
        host.push(new ListMenu(this.optnMenu(), { paged: true }));
        return true;
    }
    return this.phase === 'result' ? this.handleResult(a) : this.handleEdit(a);
  }

  private handleEdit(a: string): boolean {
    const ed = this.editor;
    switch (a) {
      case 'nav:left': ed.moveLeft(); return true;
      case 'nav:right': ed.moveRight(); return true;
      case 'nav:up':
        if (!ed.moveVertical(-1) && ed.isEmpty && this.history.length > 0) this.showHistory(0);
        return true;
      case 'nav:down': ed.moveVertical(1); return true;
      case 'edit:del': ed.del(); return true;
      case 'edit:ins':
        if (this.linear) ed.overwrite = !ed.overwrite;
        else ed.wrapNext = true;
        return true;
      case 'edit:undo': ed.undo(); return true;
    }
    return applyInsertAction(ed, a, this.linear);
  }

  private handleResult(a: string): boolean {
    const entry = this.shown!;
    switch (a) {
      case 'nav:left':
      case 'nav:right':
      case 'edit:del':
        this.editor.load(entry.input, a === 'nav:right');
        this.phase = 'edit';
        return true;
      case 'nav:up':
        if (this.view < this.history.length - 1) this.showHistory(this.view + 1);
        return true;
      case 'nav:down':
        if (this.view > 0) this.showHistory(this.view - 1);
        return true;
      case 'cmd:sd':
        if (entry.views.length > 1) entry.vi = (entry.vi + 1) % entry.views.length;
        return true;
    }
    if (!isInsertAction(a)) return false;
    this.editor.clear();
    this.phase = 'edit';
    this.view = 0;
    if (continuesWithAns(a)) this.editor.insertToken('Ans');
    return applyInsertAction(this.editor, a, this.linear);
  }

  private handleError(a: string | undefined): boolean {
    if (a === 'sys:ac') {
      this.editor.clear();
      this.phase = 'edit';
      this.error = undefined;
      return true;
    }
    if (a === 'nav:left' || a === 'nav:right') {
      const at = this.error?.at;
      this.phase = 'edit';
      if (at && this.validCursor(at)) this.editor.setCursor(at);
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

  /** Fügt ein Token ein (auch aus Menüs/RECALL); ▸-Befehle setzen ein Ergebnis mit Ans fort. */
  insertToken(tok: string): void {
    if (this.phase !== 'edit') {
      this.editor.clear();
      this.phase = 'edit';
      this.view = 0;
      if (tok.startsWith('conv:')) this.editor.insertToken('Ans');
    }
    this.editor.insertToken(tok);
  }

  private showHistory(view: number): void {
    this.view = view;
    this.phase = 'result';
    this.editor.clear();
  }

  // --- Rechnen ---

  private execute(opts: { suffix?: string }): Entry | undefined {
    if (this.editor.isEmpty) return undefined;
    const input = this.editor.snapshot().root;
    try {
      const entry = this.evaluate(input);
      entry.suffix = opts.suffix;
      this.finish(entry);
      return entry;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
      return undefined;
    }
  }

  private evaluate(input: Slot): Entry {
    // ▸r∠θ / ▸a+bi am Ende gilt für den ganzen Ausdruck
    let body = input;
    let force: Force | undefined;
    const last = input[input.length - 1];
    if (last?.kind === 'tok' && (last.tok === 'conv:▸r∠θ' || last.tok === 'conv:▸a+bi')) {
      force = last.tok === 'conv:▸r∠θ' ? 'polar' : 'rect';
      body = input.slice(0, -1);
    }
    const ev = new ComplexEvaluator(this.context());
    let value: C = real(V.ZERO);
    for (const st of parse(body)) {
      if (st.kind === 'eq') throw new CalcError('syntax');
      value = ev.eval(st.expr);
    }
    const entry: Entry = { input, value, force, views: ['decimal'], vi: 0 };
    const exact = this.hasExact(entry);
    if (exact) {
      const first = this.settings.io === 'mathMath' || this.settings.io === 'linLin';
      entry.views = first ? ['exact', 'decimal'] : ['decimal', 'exact'];
    }
    return entry;
  }

  private hasExact(e: Entry): boolean {
    const s = this.settings;
    const parts = this.parts(e);
    return parts.some((v) => exactForm(v, s, { linear: this.linear }) !== undefined);
  }

  /** Die angezeigten Werte: a, b bzw. r, θ (oder nur der reelle Wert). */
  private parts(e: Entry): V.Value[] {
    const z = e.value;
    if (isReal(z)) return [z.re];
    if (this.polar(e)) return [cabs(z), carg(z, this.settings.angle)];
    return [z.re, V.abs(z.im)];
  }

  private polar(e: Entry): boolean {
    return (e.force ?? (this.settings.complex === 'polar' ? 'polar' : 'rect')) === 'polar';
  }

  private finish(entry: Entry): void {
    const st = this.host.state;
    st.ans = V.serialize(entry.value.re);
    this.store.ans = isReal(entry.value) ? undefined : { re: V.serialize(entry.value.re), im: V.serialize(entry.value.im) };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.editor.clear();
    this.phase = 'result';
    this.view = 0;
    this.host.persist();
  }

  private storeTo(name: VarName): void {
    let entry: Entry | undefined;
    if (this.phase === 'edit' && !this.editor.isEmpty) entry = this.execute({ suffix: `→${name}` });
    else if (this.phase === 'result') {
      entry = this.shown;
      if (entry) entry.suffix = `→${name}`;
    }
    if (!entry) return;
    this.setVar(name, entry.value);
    this.host.persist();
  }

  private memory(sign: 1 | -1): void {
    const suffix = sign > 0 ? 'M+' : 'M−';
    let entry: Entry | undefined;
    if (this.phase === 'edit' && !this.editor.isEmpty) entry = this.execute({ suffix });
    else if (this.phase === 'result') {
      entry = this.shown;
      if (entry) entry.suffix = suffix;
    }
    if (!entry) return;
    const m = this.getC('M');
    this.setVar('M', sign > 0 ? cadd(m, entry.value) : csub(m, entry.value));
    this.host.persist();
  }

  private optnMenu(): MenuItem[] {
    const put = (tok: string) => (host: Host) => {
      while (host.top !== this) host.pop();
      this.insertToken(tok);
    };
    const fn = (label: string, tok: string): MenuItem => ({ label, run: put(tok) });
    return [
      fn('Argument', 'arg('), fn('Konjugierte', 'Conjg('), fn('Realteil', 'ReP('), fn('Imaginärteil', 'ImP('),
      fn('▸r∠θ', 'conv:▸r∠θ'), fn('▸a+bi', 'conv:▸a+bi'),
    ];
  }

  // --- CALC ---

  private startPrompt(): void {
    const input = !this.editor.isEmpty ? this.editor.snapshot().root : this.phase === 'result' ? this.shown?.input : undefined;
    if (!input) return;
    try {
      const statements = parse(input);
      let vars = freeVariables(statements);
      // Bei „y=…“ wird die linke Variable berechnet, nicht abgefragt
      const first = statements[0];
      if (first.kind === 'eq' && first.l.t === 'var') {
        const target = first.l.name;
        if (!statements.some((s) => freeVariables([{ kind: 'expr', expr: s.kind === 'eq' ? s.r : s.expr } as Statement]).includes(target))) {
          vars = vars.filter((v) => v !== target);
        }
      }
      this.editor.load(input);
      if (vars.length === 0 && !statements.some((s) => s.kind === 'eq')) {
        this.execute({});
        return;
      }
      this.host.push(new CalcPrompt(this.host, this, input, statements, vars));
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.editor.load(input);
      this.error = e;
      this.phase = 'error';
    }
  }

  resume(input: Slot, at?: Cursor): void {
    this.editor.load(input);
    if (at && this.validCursor(at)) this.editor.setCursor(at);
    this.phase = 'edit';
    this.view = 0;
  }

  promptValue(name: string): string {
    const z = this.getC(name);
    return formToText(this.formOf({ input: [], value: z, views: ['decimal'], vi: 0 }));
  }

  promptCommit(name: string, term: Slot): void {
    const [st, ...rest] = parse(term);
    if (rest.length > 0 || st.kind !== 'expr') throw new CalcError('syntax');
    this.setVar(name as VarName, new ComplexEvaluator(this.context()).eval(st.expr));
  }

  promptCompute(statements: Statement[]): { exact?: ResultForm; decimal: ResultForm; showExact: boolean } {
    const ev = new ComplexEvaluator(this.context());
    let value: C = real(V.ZERO);
    for (const s of statements) {
      if (s.kind === 'eq') {
        if (s.l.t !== 'var') throw new CalcError('syntax', s.l.at);
        value = ev.eval(s.r);
        this.setVar(s.l.name as VarName, value);
      } else value = ev.eval(s.expr);
    }
    const st = this.host.state;
    st.ans = V.serialize(value.re);
    this.store.ans = isReal(value) ? undefined : { re: V.serialize(value.re), im: V.serialize(value.im) };
    const entry: Entry = { input: [], value, views: ['decimal'], vi: 0 };
    const decimal = this.formOf(entry);
    if (!this.hasExact(entry)) return { decimal, showExact: false };
    entry.views = ['exact'];
    return { exact: this.formOf(entry), decimal, showExact: this.settings.io === 'mathMath' || this.settings.io === 'linLin' };
  }

  // --- Anzeige ---

  get currentResult(): ResultForm | undefined {
    return this.phase === 'result' && this.shown ? this.formOf(this.shown) : undefined;
  }

  get currentError(): CalcError | undefined {
    return this.phase === 'error' ? this.error : undefined;
  }

  render(): Scene {
    if (this.phase === 'error') {
      const lines = [this.error!.message, '', '[AC] :Abbrechen', '[◀][▶]:Gehe zu'];
      return { ops: lines.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
    }
    const mode = this.linear ? 'linear' : 'math';
    const ops: DrawOp[] = [];
    const status = {
      up: this.phase === 'result' ? this.view < this.history.length - 1 : this.history.length > 0 && this.editor.isEmpty,
      down: this.phase === 'result' && this.view > 0,
      sto: this.stoPending,
    };
    if (this.phase === 'edit') {
      const lay = layoutInput(this.editor.root, this.editor.cursor, mode);
      const c = lay.cursor;
      if (c) {
        if (c.x - this.scrollX > LCD_WIDTH - 3) this.scrollX = c.x - (LCD_WIDTH - 3);
        if (c.x - this.scrollX < 0) this.scrollX = Math.max(0, c.x - 8);
      }
      if (lay.w <= LCD_WIDTH - 2) this.scrollX = 0;
      ops.push(...translate(lay, -this.scrollX, 0));
      return { ops, status, cursor: c ? { x: c.x - this.scrollX, y: c.y, h: c.h } : null };
    }
    const entry = this.shown!;
    const inLay = layoutInput(entry.input, null, mode);
    ops.push(...translate(inLay, 0, 0));
    if (entry.suffix) ops.push({ kind: 'text', x: Math.min(inLay.w, LCD_WIDTH - 33), y: inLay.base - 12, text: entry.suffix, font: 'L' });
    const res = layoutResult(this.formOf(entry), mode);
    const y = Math.max(inLay.h, LCD_HEIGHT - res.h);
    ops.push(...translate(res, Math.max(0, LCD_WIDTH - res.w), Math.min(y, LCD_HEIGHT - res.h)));
    return { ops, status, cursor: null };
  }

  private formOf(e: Entry): ResultForm {
    const s = this.settings;
    const exact = e.views[e.vi] === 'exact';
    const part = (v: V.Value): ResultForm => (exact && exactForm(v, s, { linear: this.linear })) || decimalForm(v, s);
    const z = e.value;
    if (isReal(z)) return part(z.re);
    if (this.polar(e)) return { kind: 'polar', r: part(cabs(z)), theta: part(carg(z, s.angle)) };
    return { kind: 'complex', re: V.isZero(z.re) ? undefined : part(z.re), im: part(V.abs(z.im)), imNegative: V.sign(z.im) < 0 };
  }
}
