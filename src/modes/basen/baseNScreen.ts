// Anwendung 3 „Basis-N“: ganzzahlige Rechnung in DEC/HEX/BIN/OCT mit 32-Bit-Zweierkomplement,
// logische Operatoren, Not/Neg und Zahlensystem-Präfixe.

import { CalcError } from '../../core/errors';
import * as V from '../../core/value';
import { layoutInput, translate } from '../../display/mathLayout';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_WIDTH } from '../../display/types';
import { Editor, type Slot } from '../../editor/model';
import { continuesWithAns } from '../calc/input';
import { errorScene } from '../calc/prompt';
import { ListMenu, closeMenus, type MenuItem } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';

export type Base = 'dec' | 'hex' | 'bin' | 'oct';

const RADIX: Record<Base, number> = { dec: 10, hex: 16, bin: 2, oct: 8 };
const LABEL: Record<Base, string> = { dec: 'Dec', hex: 'Hex', bin: 'Bin', oct: 'Oct' };
const PREFIX_BASE: Record<string, Base> = { 'base:d': 'dec', 'base:h': 'hex', 'base:b': 'bin', 'base:o': 'oct' };
const BASE_KEYS: Record<string, Base> = { 'base:dec': 'dec', 'base:hex': 'hex', 'base:bin': 'bin', 'base:oct': 'oct' };

const MIN = -(1n << 31n);
const MAX = (1n << 31n) - 1n;
const WORD = 1n << 32n;
const MAX_HISTORY = 30;

/** Eingabeaktionen, die im Basis-N-Modus gelten. */
const ALLOWED = new Set(['in:comma', 'in:add', 'in:sub', 'in:mul', 'in:div', 'in:neg', 'in:lparen', 'in:rparen', 'in:ans']);

const inRange = (v: bigint): boolean => v >= MIN && v <= MAX;
const check = (v: bigint): bigint => {
  if (!inRange(v)) throw new CalcError('math');
  return v;
};

/** Auswertung eines Ausdrucks (flacher Slot) im Zahlensystem `base`. */
export function evalBaseN(input: Slot, base: Base, ans: bigint): bigint {
  const toks: string[] = input.map((it) => {
    if (it.kind !== 'tok') throw new CalcError('syntax');
    return it.tok;
  });
  let i = 0;
  const peek = () => toks[i];
  const isDigit = (t: string | undefined) => t !== undefined && (/^\d$/.test(t) || t.startsWith('hex:'));
  const isLiteralStart = (t: string | undefined) => isDigit(t) || (t !== undefined && t in PREFIX_BASE);

  const literal = (): bigint => {
    let b = base;
    if (peek() in PREFIX_BASE) b = PREFIX_BASE[toks[i++]];
    if (!isDigit(peek())) throw new CalcError('syntax');
    const radix = BigInt(RADIX[b]);
    let v = 0n;
    while (isDigit(peek())) {
      const t = toks[i++];
      const d = BigInt(t.startsWith('hex:') ? t.charCodeAt(4) - 55 : Number(t));
      if (d >= radix) throw new CalcError('syntax');
      v = v * radix + d;
      if (v > WORD) v = WORD + 1n; // Überlauf merken, nicht weiterrechnen
    }
    if (b === 'dec') return v;
    if (v >= WORD) throw new CalcError('math');
    return v > MAX ? v - WORD : v;
  };

  const closeParen = () => {
    if (i < toks.length) {
      if (peek() !== ')') throw new CalcError('syntax');
      i++;
    }
  };

  const primary = (): bigint => {
    const t = peek();
    if (t === undefined) throw new CalcError('syntax');
    if (isLiteralStart(t)) return check(literal());
    i++;
    switch (t) {
      case 'Ans': return ans;
      case '(': {
        const v = orLevel();
        closeParen();
        return v;
      }
      case 'Not(': {
        const v = orLevel();
        closeParen();
        return ~v;
      }
      case 'Neg(': {
        const v = orLevel();
        closeParen();
        return BigInt.asIntN(32, -v);
      }
    }
    throw new CalcError('syntax');
  };

  const unary = (): bigint => {
    if (peek() === 'neg' || peek() === '−') {
      i++;
      if (isLiteralStart(peek())) return check(-literal());
      return check(-unary());
    }
    return primary();
  };

  const startsOperand = (t: string | undefined) =>
    t !== undefined && (isLiteralStart(t) || t === '(' || t === 'Ans' || t === 'Not(' || t === 'Neg(');

  const mulLevel = (): bigint => {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t === '×' || t === '÷') {
        i++;
        const r = unary();
        if (t === '×') v = check(v * r);
        else {
          if (r === 0n) throw new CalcError('math');
          v = check(v / r);
        }
      } else if (startsOperand(t)) v = check(v * unary()); // weggelassenes ×
      else return v;
    }
  };

  const addLevel = (): bigint => {
    let v = mulLevel();
    while (peek() === '+' || peek() === '−') v = check(toks[i++] === '+' ? v + mulLevel() : v - mulLevel());
    return v;
  };

  const andLevel = (): bigint => {
    let v = addLevel();
    while (peek() === 'and') {
      i++;
      v &= addLevel();
    }
    return v;
  };

  const orLevel = (): bigint => {
    let v = andLevel();
    for (;;) {
      const t = peek();
      if (t !== 'or' && t !== 'xor' && t !== 'xnor') return v;
      i++;
      const r = andLevel();
      v = t === 'or' ? v | r : t === 'xor' ? v ^ r : ~(v ^ r);
    }
  };

  if (toks.length === 0) throw new CalcError('syntax');
  const v = orLevel();
  if (i < toks.length) throw new CalcError('syntax');
  return v;
}

/** Ergebnis im Zahlensystem als Anzeigezeilen (BIN: zwei Zeilen zu 16 Bit). */
export function formatBaseN(v: bigint, base: Base): string[] {
  if (base === 'dec') return [v.toString()];
  const u = v < 0n ? v + WORD : v;
  if (base === 'hex') return [u.toString(16).toUpperCase().padStart(8, '0')];
  if (base === 'oct') return [u.toString(8).padStart(11, '0')];
  const bits = u.toString(2).padStart(32, '0');
  const group = (s: string) => s.match(/.{4}/g)!.join(' ');
  return [group(bits.slice(0, 16)), group(bits.slice(16))];
}

interface Entry {
  input: Slot;
  value: bigint;
}

type Phase = 'edit' | 'result' | 'error';

export class BaseNScreen implements Screen {
  readonly editor = new Editor();
  private phase: Phase = 'edit';
  private history: Entry[] = [];
  private view = 0;
  private error: CalcError | undefined;
  private scrollX = 0;
  base: Base = 'dec';

  constructor(private readonly host: Host) {
    const stored = host.state.modeData.basen as { base?: Base } | undefined;
    if (stored?.base && stored.base in RADIX) this.base = stored.base;
  }

  private get shown(): Entry | undefined {
    return this.history[this.history.length - 1 - this.view];
  }

  /** Angezeigtes Ergebnis als Zeilen (oder undefined). */
  get resultLines(): string[] | undefined {
    return this.phase === 'result' && this.shown ? formatBaseN(this.shown.value, this.base) : undefined;
  }

  get currentError(): CalcError | undefined {
    return this.phase === 'error' ? this.error : undefined;
  }

  private ans(): bigint {
    const v = V.deserialize(this.host.state.ans);
    const n = V.asInteger(v) ?? BigInt(Math.trunc(V.toNumber(v)));
    return inRange(n) ? n : 0n;
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.phase === 'error') return this.handleError(a);
    if (!a) return false;

    if (a in BASE_KEYS) {
      this.base = BASE_KEYS[a];
      host.state.modeData.basen = { base: this.base };
      host.persist();
      return true;
    }
    switch (a) {
      case 'sys:ac':
        this.editor.clear();
        this.phase = 'edit';
        this.view = 0;
        return true;
      case 'cmd:exe':
        if (this.phase === 'edit') this.execute();
        return true;
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
        if (ed.isEmpty && this.history.length > 0) this.showHistory(0);
        return true;
      case 'edit:del': ed.del(); return true;
      case 'edit:ins': ed.overwrite = !ed.overwrite; return true;
      case 'edit:undo': ed.undo(); return true;
    }
    this.insertAction(a);
    return true;
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
        if (this.view < this.history.length - 1) this.view++;
        return true;
      case 'nav:down':
        if (this.view > 0) this.view--;
        return true;
    }
    if (!this.accepts(a)) return true;
    this.editor.clear();
    this.phase = 'edit';
    this.view = 0;
    if (continuesWithAns(a)) this.editor.insertToken('Ans');
    this.insertAction(a);
    return true;
  }

  private handleError(a: string | undefined): boolean {
    if (a === 'sys:ac') {
      this.editor.clear();
      this.phase = 'edit';
      this.error = undefined;
    } else if (a === 'nav:left' || a === 'nav:right') {
      this.phase = 'edit';
      this.error = undefined;
    }
    return true;
  }

  private accepts(a: string): boolean {
    return a.startsWith('in:digit:') || a.startsWith('in:hex:') || ALLOWED.has(a);
  }

  private insertAction(a: string): void {
    if (!this.accepts(a)) return;
    if (a.startsWith('in:digit:') || a.startsWith('in:hex:')) this.editor.insertToken(a.slice(3).replace('digit:', ''));
    else this.editor.insertToken({ 'in:comma': ',', 'in:add': '+', 'in:sub': '−', 'in:mul': '×', 'in:div': '÷', 'in:neg': 'neg', 'in:lparen': '(', 'in:rparen': ')', 'in:ans': 'Ans' }[a]!);
  }

  /** Token aus dem OPTN-Menü; nach einem Ergebnis setzen Operatoren mit Ans fort. */
  insertToken(tok: string): void {
    if (this.phase !== 'edit') {
      this.editor.clear();
      this.phase = 'edit';
      this.view = 0;
      if (['and', 'or', 'xor', 'xnor'].includes(tok)) this.editor.insertToken('Ans');
    }
    this.editor.insertToken(tok);
  }

  private showHistory(view: number): void {
    this.view = view;
    this.phase = 'result';
    this.editor.clear();
  }

  private execute(): void {
    if (this.editor.isEmpty) return;
    const input = this.editor.snapshot().root;
    try {
      const value = evalBaseN(input, this.base, this.ans());
      this.host.state.ans = V.serialize(V.int(value));
      this.history.push({ input, value });
      if (this.history.length > MAX_HISTORY) this.history.shift();
      this.editor.clear();
      this.phase = 'result';
      this.view = 0;
      this.host.persist();
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
    }
  }

  private optnMenu(): MenuItem[] {
    const put = (tok: string) => (host: Host) => {
      closeMenus(host);
      this.insertToken(tok);
    };
    const fn = (label: string, tok: string): MenuItem => ({ label, run: put(tok) });
    return [
      fn('Neg', 'Neg('), fn('Not', 'Not('), fn('and', 'and'), fn('or', 'or'),
      fn('d', 'base:d'), fn('h', 'base:h'), fn('b', 'base:b'), fn('o', 'base:o'),
      fn('xor', 'xor'), fn('xnor', 'xnor'),
    ];
  }

  // --- Anzeige ---

  render(): Scene {
    if (this.phase === 'error') return errorScene(this.error!.message);
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: `[${LABEL[this.base]}]`, font: 'L' }];
    const status = {
      up: this.phase === 'result' ? this.view < this.history.length - 1 : this.history.length > 0 && this.editor.isEmpty,
      down: this.phase === 'result' && this.view > 0,
    };
    if (this.phase === 'edit') {
      const lay = layoutInput(this.editor.root, this.editor.cursor, 'linear');
      const c = lay.cursor;
      if (c) {
        if (c.x - this.scrollX > LCD_WIDTH - 3) this.scrollX = c.x - (LCD_WIDTH - 3);
        if (c.x - this.scrollX < 0) this.scrollX = Math.max(0, c.x - 8);
      }
      if (lay.w <= LCD_WIDTH - 2) this.scrollX = 0;
      ops.push(...translate(lay, -this.scrollX, 16));
      return { ops, status, cursor: c ? { x: c.x - this.scrollX, y: c.y + 16, h: c.h } : null };
    }
    const entry = this.shown!;
    ops.push(...translate(layoutInput(entry.input, null, 'linear'), 0, 16));
    const lines = formatBaseN(entry.value, this.base);
    const small = lines.length > 1; // BIN: 2 x 19 Zeichen passen nur in der kleinen Schrift
    lines.forEach((text, k) => ops.push(small ? { kind: 'text', x: LCD_WIDTH, y: 42 + 11 * k, text, font: 'S', align: 'right' } : { kind: 'text', x: LCD_WIDTH, y: 48, text, font: 'L', align: 'right' }));
    return { ops, status, cursor: null };
  }
}
