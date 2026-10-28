// Datenmodell der Tabellenkalkulation: Zellen (Konstante oder Formel), Zellenbezüge, Neuberechnung.
// Zellenbezüge sind keine Token des gemeinsamen Parsers; sie werden vor der Auswertung durch
// Platzhaltervariablen ersetzt, deren Werte rekursiv berechnet werden.

import { CalcError } from '../../core/errors';
import { Evaluator, type EvalContext } from '../../core/eval/evaluate';
import { parse } from '../../core/parser/parser';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { TENSOR_VARS } from '../../editor/tokens';
import type { Item, Slot } from '../../editor/model';

export const COLS = 5;
export const ROWS = 45;
export const CAPACITY = 1700;
const MAX_FORMULA_ITEMS = 38;

/** Zelle: Formel (t ohne „=“) oder Konstante (t = Eingabetext, v = fester Wert). */
export interface Cell {
  f: boolean;
  t: Slot;
  v?: V.SerializedValue;
}

export type Result = { v: Value } | { err: CalcError };

export interface Ref {
  cabs: boolean;
  /** Spalte 0–4, −1 = „?“ (außerhalb nach Kopieren). */
  col: number;
  rabs: boolean;
  /** Zeile 1–45, −1 = „?“. */
  row: number;
}

const tok = (t: string): Item => ({ kind: 'tok', tok: t });
const tokOf = (it: Item | undefined): string | undefined => (it?.kind === 'tok' ? it.tok : undefined);
const LETTERS = 'ABCDE';
const RANGE_FNS = ['Min(', 'Max(', 'Mean(', 'Sum('];
const POOL: readonly string[] = TENSOR_VARS;

export const idxOf = (col: number, row: number): number => (row - 1) * COLS + col;
export const colOf = (idx: number): number => idx % COLS;
export const rowOf = (idx: number): number => Math.floor(idx / COLS) + 1;
export const refName = (idx: number): string => `${LETTERS[colOf(idx)]}${rowOf(idx)}`;

function refItems(r: Ref): Item[] {
  const out: Item[] = [];
  if (r.cabs) out.push(tok('$'));
  out.push(tok(r.col < 0 ? '?' : LETTERS[r.col]));
  if (r.rabs) out.push(tok('$'));
  if (r.row < 0) out.push(tok('?'));
  else for (const d of String(r.row)) out.push(tok(d));
  return out;
}

/** Erkennt einen Zellenbezug ab Position i; liefert Bezug und Länge. */
function readRef(slot: Slot, i: number): { ref: Ref; len: number } | undefined {
  let j = i;
  let cabs = false;
  let rabs = false;
  if (tokOf(slot[j]) === '$') (cabs = true), j++;
  const l = tokOf(slot[j]);
  if (l === undefined || !(l === '?' || (l.length === 1 && LETTERS.includes(l)))) return undefined;
  const col = l === '?' ? -1 : LETTERS.indexOf(l);
  j++;
  if (tokOf(slot[j]) === '$') (rabs = true), j++;
  const d1 = tokOf(slot[j]);
  let row: number;
  if (d1 === '?') {
    row = -1;
    j++;
  } else if (d1 !== undefined && /^\d$/.test(d1)) {
    row = Number(d1);
    j++;
    const d2 = tokOf(slot[j]);
    if (d2 !== undefined && /^\d$/.test(d2) && row * 10 + Number(d2) <= ROWS) {
      row = row * 10 + Number(d2);
      j++;
    }
    if (row < 1) row = -1;
  } else return undefined;
  return { ref: { cabs, col, rabs, row }, len: j - i };
}

interface Walker {
  ref(r: Ref): Item[];
  /** Bereichsfunktion fn(a:b[)] */
  range(fn: string, a: Ref, b: Ref, closed: boolean): Item[];
}

/** Durchläuft ein Feld (auch Schablonenfelder) und ersetzt Bezüge und Bereichsfunktionen. */
function walk(slot: Slot, h: Walker): Slot {
  const out: Slot = [];
  let i = 0;
  while (i < slot.length) {
    const it = slot[i];
    if (it.kind === 'tpl') {
      out.push({ ...it, slots: it.slots.map((s) => walk(s, h)) });
      i++;
      continue;
    }
    if (RANGE_FNS.includes(it.tok)) {
      const a = readRef(slot, i + 1);
      if (a && tokOf(slot[i + 1 + a.len]) === ':') {
        const b = readRef(slot, i + 2 + a.len);
        if (b) {
          let end = i + 2 + a.len + b.len;
          const closed = tokOf(slot[end]) === ')';
          if (closed) end++;
          out.push(...h.range(it.tok, a.ref, b.ref, closed));
          i = end;
          continue;
        }
      }
    }
    const r = readRef(slot, i);
    if (r) {
      out.push(...h.ref(r.ref));
      i += r.len;
      continue;
    }
    out.push(it);
    i++;
  }
  return out;
}

/** Verschiebt relative Bezüge um (dc, dr); Ziele außerhalb der Tabelle werden zu „?“. */
export function shiftSlot(slot: Slot, dc: number, dr: number): Slot {
  const sh = (r: Ref): Ref => ({
    ...r,
    col: r.cabs || r.col < 0 ? r.col : r.col + dc >= 0 && r.col + dc < COLS ? r.col + dc : -1,
    row: r.rabs || r.row < 0 ? r.row : r.row + dr >= 1 && r.row + dr <= ROWS ? r.row + dr : -1,
  });
  return walk(slot, {
    ref: (r) => refItems(sh(r)),
    range: (fn, a, b, closed) => [tok(fn), ...refItems(sh(a)), tok(':'), ...refItems(sh(b)), ...(closed ? [tok(')')] : [])],
  });
}

const count = (slot: Slot): number => slot.reduce((n, it) => n + 1 + (it.kind === 'tpl' ? it.slots.reduce((m, s) => m + count(s), 0) : 0), 0);

function cellRange(a: Ref, b: Ref): number[] {
  if (a.col < 0 || b.col < 0 || a.row < 1 || b.row < 1) throw new CalcError('syntax');
  const out: number[] = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(idxOf(c, r));
  return out;
}

export interface SheetJson {
  cells: [number, Cell][];
}

export class SheetModel {
  readonly cells = new Map<number, Cell>();
  private vals = new Map<number, Result>();

  constructor(
    private readonly ctx: () => EvalContext,
    private readonly auto: () => boolean,
    json?: SheetJson,
  ) {
    for (const [i, c] of json?.cells ?? []) this.cells.set(i, c);
    this.recalc();
  }

  toJSON(): SheetJson {
    return { cells: [...this.cells.entries()] };
  }

  static bytesOf(c: Cell): number {
    return c.f ? 11 + count(c.t) : 10;
  }

  get used(): number {
    let n = 0;
    for (const c of this.cells.values()) n += SheetModel.bytesOf(c);
    return n;
  }

  result(idx: number): Result | undefined {
    const c = this.cells.get(idx);
    if (!c) return undefined;
    if (!c.f) return { v: V.deserialize(c.v) };
    return this.vals.get(idx);
  }

  // --- Neuberechnung ---

  recalc(): void {
    this.vals.clear();
    for (const [i, c] of this.cells) if (c.f) this.compute(i);
  }

  private compute(idx: number): Result {
    const known = this.vals.get(idx);
    if (known) return known;
    const cell = this.cells.get(idx)!;
    let res: Result;
    try {
      res = { v: this.evalSlot(cell.t) };
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      res = { err: e };
    }
    this.vals.set(idx, res);
    return res;
  }

  private read(idx: number): Result | undefined {
    const c = this.cells.get(idx);
    if (!c) return undefined;
    if (!c.f) return { v: V.deserialize(c.v) };
    return this.vals.get(idx) ?? this.compute(idx);
  }

  private valueAt(idx: number): Value | undefined {
    const r = this.read(idx);
    if (!r) return undefined;
    if ('err' in r) throw new CalcError(r.err.kind);
    return r.v;
  }

  /** Wertet einen Zelleninhalt (ohne „=“) aus. */
  evalSlot(slot: Slot): Value {
    const bind = new Map<string, Value>();
    const names = new Map<string, string>();
    const place = (key: string, get: () => Value): Item[] => {
      let name = names.get(key);
      if (!name) {
        if (names.size >= POOL.length) throw new CalcError('memory');
        name = POOL[names.size];
        names.set(key, name);
        bind.set(name, get());
      }
      return [tok(name)];
    };
    const single = (r: Ref): number => {
      if (r.col < 0 || r.row < 1) throw new CalcError('syntax');
      return idxOf(r.col, r.row);
    };
    const out = walk(slot, {
      ref: (r) => place(`c${single(r)}`, () => this.valueAt(single(r)) ?? V.ZERO),
      range: (fn, a, b) => place(`${fn}${single(a)}:${single(b)}`, () => this.rangeValue(fn, cellRange(a, b))),
    });
    const sts = parse(out);
    if (sts.length !== 1 || sts[0].kind !== 'expr') throw new CalcError('syntax');
    return new Evaluator(this.ctx()).eval(sts[0].expr, bind);
  }

  private rangeValue(fn: string, idxs: number[]): Value {
    const vs: Value[] = [];
    for (const i of idxs) {
      const v = this.valueAt(i);
      if (v) vs.push(v);
    }
    if (fn === 'Sum(') return vs.reduce((a, b) => V.add(a, b), V.ZERO);
    if (vs.length === 0) throw new CalcError('math');
    if (fn === 'Mean(') return V.div(vs.reduce((a, b) => V.add(a, b), V.ZERO), V.int(vs.length));
    const pick = fn === 'Min(' ? (a: Value, b: Value) => (V.toNumber(b) < V.toNumber(a) ? b : a) : (a: Value, b: Value) => (V.toNumber(b) > V.toNumber(a) ? b : a);
    return vs.reduce(pick);
  }

  // --- Zirkelbezug ---

  private deps(slot: Slot): number[] {
    const out: number[] = [];
    walk(slot, {
      ref: (r) => (r.col >= 0 && r.row >= 1 && out.push(idxOf(r.col, r.row)), []),
      range: (_fn, a, b) => {
        try {
          out.push(...cellRange(a, b));
        } catch {
          /* ungültiger Bereich: kein Bezug */
        }
        return [];
      },
    });
    return out;
  }

  private cyclic(idx: number, cell: Cell): boolean {
    if (!cell.f) return false;
    const seen = new Set<number>();
    const stack = this.deps(cell.t);
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (i === idx) return true;
      if (seen.has(i)) continue;
      seen.add(i);
      const c = this.cells.get(i);
      if (c?.f) stack.push(...this.deps(c.t));
    }
    return false;
  }

  // --- Ändern ---

  /** Setzt eine Zelle (prüft Zirkelbezug und Speicher); bei Fehler bleibt alles unverändert. */
  private store(idx: number, cell: Cell | undefined): void {
    const old = this.cells.get(idx);
    if (cell) {
      if (cell.f && count(cell.t) > MAX_FORMULA_ITEMS) throw new CalcError('memory');
      if (this.cyclic(idx, cell)) throw new CalcError('circular');
      const total = this.used - (old ? SheetModel.bytesOf(old) : 0) + SheetModel.bytesOf(cell);
      if (total > CAPACITY) throw new CalcError('memory');
      this.cells.set(idx, cell);
    } else this.cells.delete(idx);
    this.vals.delete(idx);
    if (this.auto()) this.recalc();
    else if (cell?.f) this.compute(idx);
  }

  private restore(idx: number, old: Cell | undefined): void {
    if (old) this.cells.set(idx, old);
    else this.cells.delete(idx);
    this.vals.delete(idx);
    if (this.auto()) this.recalc();
  }

  /** Eingabe wie am Gerät: mit „=“ beginnend = Formel, sonst Konstante (einmal ausgewertet). */
  enter(idx: number, input: Slot): void {
    if (input.length === 0) return this.store(idx, undefined);
    const old = this.cells.get(idx);
    if (tokOf(input[0]) === '=') {
      this.store(idx, { f: true, t: input.slice(1) });
      const r = this.vals.get(idx);
      if (r && 'err' in r) {
        this.restore(idx, old);
        throw r.err;
      }
    } else {
      const v = this.evalSlot(input);
      this.store(idx, { f: false, t: input, v: V.serialize(v) });
    }
  }

  clear(idx: number): void {
    this.store(idx, undefined);
  }

  clearAll(): void {
    this.cells.clear();
    this.vals.clear();
  }

  /** Einfügen (Kopieren/Ausschneiden); Fehler in der Zelle erscheinen als ERROR. */
  paste(idx: number, cell: Cell): void {
    this.store(idx, cell);
  }

  /** Formel füllen: gleiche Formel in alle Zellen des Bereichs (relativ zur Zelle oben links). */
  fillFormula(a: Ref, b: Ref, input: Slot): void {
    const idxs = cellRange(a, b);
    const first = idxs[0];
    for (const i of idxs) {
      const t = shiftSlot(tokOf(input[0]) === '=' ? input.slice(1) : input, colOf(i) - colOf(first), rowOf(i) - rowOf(first));
      this.store(i, { f: true, t });
    }
  }

  /** Wert füllen: Ergebnis des Ausdrucks je Zelle als Konstante. */
  fillValue(a: Ref, b: Ref, input: Slot): void {
    const idxs = cellRange(a, b);
    const first = idxs[0];
    for (const i of idxs) {
      const t = shiftSlot(input, colOf(i) - colOf(first), rowOf(i) - rowOf(first));
      this.store(i, { f: false, t, v: V.serialize(this.evalSlot(t)) });
    }
  }
}

/** Bereich „A2:A20“ aus einem Eingabefeld. */
export function parseRange(slot: Slot): { a: Ref; b: Ref } {
  const a = readRef(slot, 0);
  if (!a || tokOf(slot[a.len]) !== ':') throw new CalcError('syntax');
  const b = readRef(slot, a.len + 1);
  if (!b || a.len + 1 + b.len !== slot.length) throw new CalcError('syntax');
  return { a: a.ref, b: b.ref };
}

export function toRef(idx: number): Ref {
  return { cabs: false, col: colOf(idx), rabs: false, row: rowOf(idx) };
}

export { refItems };
