// Anwendung 1 „Berechnungen“: Eingabe mit natürlicher Darstellung, Ergebnis, Ablaufspeicher,
// Fehleranzeige mit Sprung zur Fehlerstelle, STO/RECALL, M+/M−, S⇔D, ENG, OPTN.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import * as T from '../../core/eval/trig';
import { formatEng } from '../../core/format/number';
import { decimalForm, exactForm, recognizeFraction, recurringForm } from '../../core/format/result';
import { parse, type Node } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutInput, layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { Editor, type Cursor, type Slot } from '../../editor/model';
import { PREFIXES } from '../../editor/tokens';
import type { KeyId } from '../../keys/keymap';
import type { VarName } from '../../calculator/state';
import { ListMenu, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { RecallScreen } from './recallScreen';
import { applyInsertAction, continuesWithAns, isInsertAction } from './input';
import { CalcPrompt, type PromptOwner } from './calcPrompt';
import { evalContext } from '../../calculator/context';
import { SolveScreen } from './solveScreen';
import { freeVariables } from '../../core/parser/vars';
import { CONST_CATEGORIES } from '../../data/constants';
import { CONV_CATEGORIES } from '../../data/conversions';

/** Nach STO ohne ALPHA erreichbare Variablen (Taste → Name). */
const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

const MAX_HISTORY = 30;

interface Entry {
  input: Slot;
  value: Value;
  exact?: ResultForm;
  decimal: ResultForm;
  /** Sonderausgabe (Pol/Rec, ÷R) statt exakter/dezimaler Form. */
  text?: ResultForm;
  /** Darstellungen, zwischen denen S⇔D wechselt, in Reihenfolge; vi = aktuelle. */
  views: View[];
  vi: number;
  recurring?: ResultForm;
  mixed: boolean;
  eng?: number;
  /** FACT-Ansicht aktiv. */
  factors?: boolean;
  /** Anhang hinter der Eingabe, z. B. „→A“ oder „M+“. */
  suffix?: string;
}

type Phase = 'edit' | 'result' | 'error';
type View = 'exact' | 'recurring' | 'decimal';

export class CalcScreen implements Screen, PromptOwner {
  readonly editor = new Editor();
  private phase: Phase = 'edit';
  private history: Entry[] = [];
  /** Index der angezeigten Ablaufspeicher-Zeile (0 = neueste) im Ergebnismodus. */
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

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const name = ev.mod === 'none' || ev.mod === 'alpha' ? STO_KEYS[ev.key] : undefined;
      if (name) this.store(name);
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
        if (this.phase === 'result' && this.editor.isEmpty) this.recompute(this.shown!);
        else this.execute({});
        return true;
      case 'cmd:approx':
        this.execute({ approx: true });
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
      case 'cmd:solve':
        this.startPrompt(a === 'cmd:solve');
        return true;
      case 'sys:const':
        host.push(new ListMenu(this.catalogMenu(CONST_CATEGORIES.map((c) => ({
          title: c.title,
          items: c.items.map((k) => ({ label: k.symbol, tok: `const:${k.symbol}` })),
        })))));
        return true;
      case 'sys:conv':
        host.push(new ListMenu(this.catalogMenu(CONV_CATEGORIES.map((c) => ({
          title: c.title,
          items: c.items.map((k) => ({ label: k.label, tok: `conv:${k.label}` })),
        })))));
        return true;
      case 'sys:optn':
        host.push(new ListMenu(this.optnMenu()));
        return true;
    }

    if (this.phase === 'result') return this.handleResult(a);
    return this.handleEdit(a);
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
    return this.insertAction(a);
  }

  private handleResult(a: string): boolean {
    const entry = this.shown!;
    switch (a) {
      case 'nav:left':
      case 'nav:right':
      case 'edit:del':
        // Wiederholungsfunktion: angezeigte Rechnung bearbeiten
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
        if (!entry.text && entry.views.length > 1) {
          entry.vi = (entry.vi + 1) % entry.views.length;
          entry.eng = undefined;
        }
        return true;
      case 'cmd:fact':
        this.toggleFactors(entry);
        return true;
      case 'cmd:mixedToggle':
        if (entry.exact?.kind === 'fraction') {
          entry.mixed = !entry.mixed;
          entry.exact = exactForm(entry.value, this.settings, { linear: this.linear, mixed: entry.mixed });
          entry.vi = Math.max(0, entry.views.indexOf('exact'));
        }
        return true;
      case 'cmd:eng':
      case 'cmd:engLeft':
        if (!entry.text) {
          entry.eng = entry.eng === undefined ? 0 : entry.eng + (a === 'cmd:eng' ? 1 : -1);
          entry.vi = Math.max(0, entry.views.indexOf('decimal'));
        }
        return true;
    }
    // Neue Eingabe: Operatoren setzen mit Ans fort, alles andere beginnt neu
    if (!isInsertAction(a)) return false;
    this.editor.clear();
    this.phase = 'edit';
    this.view = 0;
    if (continuesWithAns(a)) this.editor.insertToken('Ans');
    return this.insertAction(a);
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
      return true;
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

  private insertAction(a: string): boolean {
    return applyInsertAction(this.editor, a, this.linear);
  }

  /** Fügt ein Token ein (auch aus Menüs/RECALL); ein angezeigtes Ergebnis startet eine neue Eingabe. */
  insertToken(tok: string): void {
    if (this.phase !== 'edit') {
      this.editor.clear();
      this.phase = 'edit';
      this.view = 0;
    }
    this.editor.insertToken(tok);
  }

  private showHistory(view: number): void {
    this.view = view;
    this.phase = 'result';
    this.editor.clear();
  }

  // --- Rechnen ---

  context(): EvalContext {
    return evalContext(this.host.state);
  }

  /** Wertet die aktuelle Eingabe aus und legt sie im Ablaufspeicher ab. */
  private execute(opts: { approx?: boolean; suffix?: string }): Entry | undefined {
    if (this.editor.isEmpty) return undefined;
    const input = this.editor.snapshot().root;
    try {
      const entry = this.evaluate(input, opts.approx ?? false);
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

  private recompute(entry: Entry): void {
    this.editor.load(entry.input);
    this.execute({});
  }

  private evaluate(input: Slot, approx: boolean): Entry {
    const ev = new Evaluator(this.context());
    let value: Value = V.ZERO;
    let text: ResultForm | undefined;
    for (const st of parse(input)) {
      if (st.kind === 'eq') throw new CalcError('syntax', equalsPosition(input));
      const special = this.special(st.expr, ev);
      if (special) {
        value = special.value;
        text = special.text;
      } else {
        value = ev.eval(st.expr);
        text = undefined;
      }
    }
    const s = this.settings;
    const mixed = s.fraction === 'mixed';
    const exact = text ? undefined : exactForm(value, s, { linear: this.linear, mixed });
    const decimal = text ?? decimalForm(value, s);
    // Periodische Darstellung (SETUP „Period. Darst.“) nur in der Math-Ausgabe
    const q = value.k === 's' ? value.s.toRational() : value.k === 'f' && value.numeric ? recognizeFraction(value.x) : undefined;
    const recurring = !text && !this.linear && s.recurring && q ? recurringForm(q) : undefined;
    // Math → Math und Lin. → Linear zeigen zuerst die exakte Form, sonst zuerst die Dezimalzahl
    const exactFirst = (s.io === 'mathMath' || s.io === 'linLin') && !approx;
    const order: View[] = exactFirst ? ['exact', 'recurring', 'decimal'] : ['decimal', 'recurring', 'exact'];
    const views = order.filter((v) => (v === 'exact' ? !!exact : v === 'recurring' ? !!recurring : true));
    return { input, value, exact, decimal, text, recurring, views, vi: 0, mixed };
  }

  /** Pol/Rec (zwei Ergebnisse → x, y) und Division mit Rest auf oberster Ebene. */
  private special(node: Node, ev: Evaluator): { value: Value; text: ResultForm } | undefined {
    const st = this.host.state;
    const fmt = (v: Value) => {
      const f = decimalForm(v, this.settings);
      return f.kind === 'decimal' ? f.mantissa + (f.exponent !== undefined ? `×10^${f.exponent}` : '') : '';
    };
    if (node.t === 'call' && (node.fn === 'Pol(' || node.fn === 'Rec(')) {
      const [a, b] = node.args.map((n) => ev.eval(n));
      const unit = this.settings.angle;
      let p: Value;
      let q: Value;
      if (node.fn === 'Pol(') {
        p = V.sqrt(V.add(V.pow(a, V.int(2)), V.pow(b, V.int(2))));
        q = polarAngle(a, b, unit);
      } else {
        p = V.mul(a, T.cos(b, unit));
        q = V.mul(a, T.sin(b, unit));
      }
      st.vars.x = V.serialize(p);
      st.vars.y = V.serialize(q);
      const [l1, l2] = node.fn === 'Pol(' ? ['r', 'θ'] : ['𝑥', '𝑦'];
      return { value: p, text: { kind: 'text', text: `${l1}=${fmt(p)};${l2}=${fmt(q)}` } };
    }
    if (node.t === 'bin' && node.op === '÷R') {
      const a = ev.eval(node.l);
      const b = ev.eval(node.r);
      const n = V.asInteger(a);
      const d = V.asInteger(b);
      if (n !== undefined && d !== undefined && n >= 0n && d > 0n && n < 10n ** 10n) {
        const quot = V.int(n / d);
        return { value: quot, text: { kind: 'text', text: `${n / d};R=${n % d}` } };
      }
    }
    return undefined;
  }

  private finish(entry: Entry): void {
    const st = this.host.state;
    st.ans = V.serialize(entry.value);
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.editor.clear();
    this.phase = 'result';
    this.view = 0;
    this.host.persist();
  }

  private store(name: VarName): void {
    const st = this.host.state;
    let entry: Entry | undefined;
    if (this.phase === 'edit' && !this.editor.isEmpty) entry = this.execute({ suffix: `→${name}` });
    else if (this.phase === 'result') {
      entry = this.shown;
      if (entry) entry.suffix = `→${name}`;
    }
    if (!entry) return;
    st.vars[name] = V.serialize(entry.value);
    this.host.persist();
  }

  private memory(sign: 1 | -1): void {
    const st = this.host.state;
    const suffix = sign > 0 ? 'M+' : 'M−';
    let entry: Entry | undefined;
    if (this.phase === 'edit' && !this.editor.isEmpty) entry = this.execute({ suffix });
    else if (this.phase === 'result') {
      entry = this.shown;
      if (entry) entry.suffix = suffix;
    }
    if (!entry) return;
    const m = V.deserialize(st.vars.M);
    st.vars.M = V.serialize(sign > 0 ? V.add(m, entry.value) : V.sub(m, entry.value));
    this.host.persist();
  }

  /** Rückkehr aus CALC/SOLVE: Term wieder in der Eingabe, ggf. Cursor an der Fehlerstelle. */
  resume(input: Slot, at?: Cursor): void {
    this.editor.load(input);
    if (at && this.validCursor(at)) this.editor.setCursor(at);
    this.phase = 'edit';
    this.view = 0;
  }

  /** CALC bzw. SOLVE für die aktuelle Eingabe oder die angezeigte Rechnung. */
  private startPrompt(solveMode: boolean): void {
    const input = !this.editor.isEmpty ? this.editor.snapshot().root : this.phase === 'result' ? this.shown?.input : undefined;
    if (!input) return;
    try {
      const statements = parse(input);
      let vars = freeVariables(statements);
      if (solveMode) {
        if (statements.length !== 1) throw new CalcError('syntax');
        if (vars.length === 0) throw new CalcError('variable');
        this.host.push(new SolveScreen(this.host, this, input, statements[0], vars));
        return;
      }
      // Bei „y=…“ wird die linke Variable berechnet, nicht abgefragt
      const first = statements[0];
      if (first.kind === 'eq' && first.l.t === 'var') {
        const target = first.l.name;
        if (!statements.some((s) => s.kind === 'eq' ? s.r && containsVar(s.r, target) : containsVar(s.expr, target))) vars = vars.filter((v) => v !== target);
      }
      if (vars.length === 0 && !statements.some((s) => s.kind === 'eq')) {
        this.editor.load(input);
        this.execute({});
        return;
      }
      this.editor.load(input);
      this.host.push(new CalcPrompt(this.host, this, input, statements, vars));
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.editor.load(input);
      this.error = e;
      this.phase = 'error';
    }
  }

  /** Kategorie-Menü (CONST/CONV) mit Untermenü der Einträge; Auswahl fügt das Token ein. */
  private catalogMenu(categories: { title: string; items: { label: string; tok: string }[] }[]): MenuItem[] {
    const put = (tok: string) => (host: Host) => {
      while (host.top !== this) host.pop();
      this.insertCatalogToken(tok);
    };
    return categories.map((c) => ({ label: c.title, sub: c.items.map((it) => ({ label: it.label, run: put(it.tok) })) }));
  }

  /** Umrechnungen setzen ein angezeigtes Ergebnis mit Ans fort, Konstanten beginnen neu. */
  private insertCatalogToken(tok: string): void {
    if (this.phase === 'result' && tok.startsWith('conv:')) {
      this.editor.clear();
      this.editor.insertToken('Ans');
      this.phase = 'edit';
      this.view = 0;
    }
    this.insertToken(tok);
  }

  /** FACT: Primfaktorzerlegung des angezeigten Ergebnisses (erneut FACT oder = schaltet zurück). */
  private toggleFactors(entry: Entry): void {
    if (entry.text && entry.factors) {
      entry.text = undefined;
      entry.factors = false;
      return;
    }
    const n = V.asInteger(entry.value);
    if (entry.text || n === undefined || n <= 0n || n >= 10n ** 10n) {
      this.error = new CalcError('math');
      this.phase = 'error';
      return;
    }
    entry.text = { kind: 'text', text: primeFactors(n) };
    entry.factors = true;
  }

  private optnMenu(): MenuItem[] {
    const put = (tok: string) => (host: Host) => {
      while (host.top !== this) host.pop();
      this.insertToken(tok);
    };
    const fn = (label: string, tok: string): MenuItem => ({ label, run: put(tok) });
    return [
      {
        label: 'Hyperbol. Fkt.',
        sub: [
          fn('sinh', 'sinh('), fn('cosh', 'cosh('), fn('tanh', 'tanh('),
          fn('sinh⁻¹', 'sinh⁻¹('), fn('cosh⁻¹', 'cosh⁻¹('), fn('tanh⁻¹', 'tanh⁻¹('),
        ],
      },
      { label: 'Winkeleinheit', sub: [fn('°', 'deg'), fn('ʳ', 'rad'), fn('ᵍ', 'gra')] },
      {
        label: 'Dezimalpräfixe',
        sub: PREFIXES.map(([sym]) => fn(sym, `pfx:${sym}`)),
      },
    ];
  }

  // --- Anzeige ---

  /** Angezeigtes Ergebnis (oder undefined bei Eingabe/Fehler). */
  get currentResult(): ResultForm | undefined {
    return this.phase === 'result' && this.shown ? this.formOf(this.shown) : undefined;
  }

  get currentError(): CalcError | undefined {
    return this.phase === 'error' ? this.error : undefined;
  }


  render(): Scene {
    if (this.phase === 'error') return this.renderError();
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
      // Pfeile, wenn die Eingabe links oder rechts über das Display hinausgeht
      if (this.scrollX > 0) {
        ops.push({ kind: 'rect', x: 0, y: 0, w: 6, h: 9, fill: true, erase: true });
        ops.push({ kind: 'text', x: 0, y: 1, text: '◀', font: 'S' });
      }
      if (lay.w - this.scrollX > LCD_WIDTH) {
        ops.push({ kind: 'rect', x: LCD_WIDTH - 6, y: 0, w: 6, h: 9, fill: true, erase: true });
        ops.push({ kind: 'text', x: LCD_WIDTH - 5, y: 1, text: '▶', font: 'S' });
      }
      return { ops, status, cursor: c ? { x: c.x - this.scrollX, y: c.y, h: c.h } : null };
    }

    const entry = this.shown!;
    const inLay = layoutInput(entry.input, null, mode);
    ops.push(...translate(inLay, 0, 0));
    if (entry.suffix) ops.push({ kind: 'text', x: Math.min(inLay.w, LCD_WIDTH - 33), y: inLay.base - 12, text: entry.suffix, font: 'L' });
    const form = this.formOf(entry);
    const res = layoutResult(form, mode);
    const x = Math.max(0, LCD_WIDTH - res.w);
    const y = Math.max(inLay.h, LCD_HEIGHT - res.h);
    ops.push(...translate(res, x, Math.min(y, LCD_HEIGHT - res.h)));
    return { ops, status, cursor: null };
  }

  private formOf(e: Entry): ResultForm {
    if (e.text) return e.text;
    const view = e.views[e.vi];
    if (view === 'exact' && e.exact) return e.exact;
    if (view === 'recurring' && e.recurring) return e.recurring;
    if (e.eng !== undefined) {
      const d = formatEng(V.toNumber(e.value), e.eng);
      return { kind: 'decimal', mantissa: d.mantissa, exponent: d.exponent };
    }
    return e.decimal;
  }

  private renderError(): Scene {
    const lines = [this.error!.message, '', '[AC] :Abbrechen', '[◀][▶]:Gehe zu'];
    return { ops: lines.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
  }
}


function containsVar(n: Node, name: string): boolean {
  return freeVariables([{ kind: 'expr', expr: n }]).includes(name);
}

/** Primfaktoren wie am Original: 2×3×13², nicht zerlegbare Reste in Klammern. */
export function primeFactors(n: bigint): string {
  const parts: string[] = [];
  const sup = (e: number) => (e === 1 ? '' : e === 2 ? '²' : e === 3 ? '³' : `^${e}`);
  let rest = n;
  for (let p = 2n; p * p <= rest && p < 1018081n; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (rest % p === 0n) {
      rest /= p;
      e++;
    }
    if (e > 0) parts.push(`${p}${sup(e)}`);
  }
  if (rest > 1n) parts.push(rest >= 1018081n * 1018081n ? `(${rest})` : rest.toString());
  return parts.join('×') || '1';
}

function equalsPosition(input: Slot): Cursor {
  const idx = input.findIndex((it) => it.kind === 'tok' && it.tok === '=');
  return { path: [], pos: Math.max(0, idx) };
}

/** Winkel des Punktes (a, b) im Bereich −180° < θ ≤ 180°. */
function polarAngle(a: Value, b: Value, unit: 'D' | 'R' | 'G'): Value {
  const x = V.toNumber(a);
  const y = V.toNumber(b);
  if (x === 0 && y === 0) throw new CalcError('math');
  if (x > 0) return T.atan(V.div(b, a), unit);
  const turn = unit === 'D' ? 360 : unit === 'G' ? 400 : 2 * Math.PI;
  return V.fl((Math.atan2(y, x) * turn) / (2 * Math.PI));
}
