// Layout der natürlichen Darstellung (Eingabe und Ergebnisse) als Zeichenoperationen.
// Jede Teilformel ist eine Box mit Grundlinie; Schablonen setzen ihre Felder aus Boxen zusammen.
// Alle Koordinaten sind relativ zur linken oberen Ecke der jeweiligen Box.

import { template, type Cursor, type Item, type Slot, type Template } from '../editor/model';
import { TOKENS } from '../editor/tokens';
import { FONTS, splitGlyphs, textWidth } from './framebuffer';
import type { ResultForm } from './resultForm';
import type { DrawOp, FontId } from './scene';

export interface Laid {
  w: number;
  h: number;
  /** y der Hauptgrundlinie (unterste Zeile von Versalien und Ziffern) in der Box. */
  base: number;
  ops: DrawOp[];
  cursor?: { x: number; y: number; h: number };
}

type Mode = 'math' | 'linear';
type Cur = NonNullable<Laid['cursor']>;

/** Box mit Tintenbereich (Zeilen i0..i1, Spalten j0..j1, jeweils Ende exklusiv). */
interface Box extends Laid {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Zeichenabstand hinter der Box (proportionale Schrift). */
  tail: number;
  kind: 'text' | 'pow' | 'other';
}

/** Maße einer Schriftgröße für das Layout. */
interface FP {
  id: FontId;
  base: number;
  h: number;
  /** Höhe der Versalien oberhalb der Grundlinienzeile. */
  capAsc: number;
  /** Abstand der Bruchstrichzeile über der Grundlinie. */
  axis: number;
  /** Anhebung der Grundlinie eines Exponenten. */
  raise: number;
  /** Absenkung der Grundlinie eines Index. */
  sub: number;
  /** Cursor: Oberkante in der Zelle und Höhe. */
  curTop: number;
  curH: number;
}

const FPS: Record<FontId, FP> = {
  L: { id: 'L', base: 12, h: 16, capAsc: 9, axis: 5, raise: 6, sub: 3, curTop: 1, curH: 13 },
  S: { id: 'S', base: 6, h: 8, capAsc: 6, axis: 3, raise: 4, sub: 2, curTop: 0, curH: 7 },
};

// --- Grundbausteine ---------------------------------------------------------------------------

function shiftOp(o: DrawOp, dx: number, dy: number): DrawOp {
  if (o.kind === 'line') return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

const shiftOps = (ops: readonly DrawOp[], dx: number, dy: number): DrawOp[] => ops.map((o) => shiftOp(o, dx, dy));

/** Hilfsfunktion: verschiebt die Operationen einer Box. */
export function translate(l: Laid, dx: number, dy: number): DrawOp[] {
  return shiftOps(l.ops, dx, dy);
}

const advanceOf = (text: string, id: FontId): number => {
  const font = FONTS[id];
  return textWidth(text, id) + (font.advance === undefined && text ? font.spacing : 0);
};

/** Hängt Operationen an; unmittelbar anschließender Text gleicher Schrift wird zusammengefasst. */
function pushOps(out: DrawOp[], ops: DrawOp[]): void {
  for (const o of ops) {
    const last = out[out.length - 1];
    if (
      o.kind === 'text' && last?.kind === 'text' && !o.invert && !last.invert && !o.align && !last.align &&
      last.font === o.font && last.y === o.y && last.x + advanceOf(last.text, last.font) === o.x
    ) {
      out[out.length - 1] = { ...last, text: last.text + o.text };
    } else out.push(o);
  }
}

function textBox(text: string, f: FP): Box {
  const font = FONTS[f.id];
  let x = 0;
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const key of splitGlyphs(text)) {
    const g = font.glyphs[key] ?? font.glyphs['?'] ?? { w: 1, rows: [] };
    g.rows.forEach((row, j) => {
      const a = row.indexOf('#');
      if (a < 0) return;
      r0 = Math.min(r0, j);
      r1 = Math.max(r1, j + 1);
      c0 = Math.min(c0, x + a);
      c1 = Math.max(c1, x + row.lastIndexOf('#') + 1);
    });
    x += font.advance ?? g.w + font.spacing;
  }
  const inked = r1 > r0;
  return {
    w: textWidth(text, f.id), h: font.height, base: font.baseline,
    ops: [{ kind: 'text', x: 0, y: 0, text, font: f.id }],
    i0: inked ? r0 : 0, i1: inked ? r1 : 0, j0: inked ? c0 : 0, j1: inked ? c1 : 0,
    tail: font.advance === undefined ? font.spacing : 0, kind: 'text',
  };
}

/** Unsichtbare Marke für die Cursorposition (Breite 0). Der Balken liegt 1 Punkt links der Marke. */
function cursorBox(f: FP): Box {
  return {
    w: 0, h: f.h, base: f.base, ops: [], cursor: { x: -1, y: f.curTop, h: f.curH },
    i0: 0, i1: 0, j0: 0, j1: 0, tail: 0, kind: 'other',
  };
}

const hasInk = (b: Box): boolean => b.i1 > b.i0 && b.j1 > b.j0;

/** Fügt Boxen nebeneinander auf einer gemeinsamen Grundlinie zusammen (mindestens die Zelle der Schrift). */
function hbox(parts: Box[], minAsc: number, minDesc: number): Box {
  let asc = minAsc;
  let desc = minDesc;
  for (const p of parts) {
    asc = Math.max(asc, p.base);
    desc = Math.max(desc, p.h - p.base);
  }
  const b = new Build();
  let x = 0;
  for (const p of parts) {
    b.add(p, x, asc - p.base);
    x += p.w + p.tail;
  }
  const tail = parts.length ? parts[parts.length - 1].tail : 0;
  return b.done(x - tail, asc + desc, asc, tail);
}

const hb = (parts: Box[], f: FP): Box => hbox(parts, f.base, f.h - f.base);

class Build {
  ops: DrawOp[] = [];
  cursor?: Cur;
  private i0 = Infinity;
  private i1 = -Infinity;
  private j0 = Infinity;
  private j1 = -Infinity;

  add(b: Box, x: number, y: number, clip?: [number, number]): void {
    pushOps(this.ops, shiftOps(b.ops, x, y));
    if (hasInk(b)) this.ink(x + b.j0, y + b.i0, b.j1 - b.j0, b.i1 - b.i0);
    if (b.cursor) {
      let cy = y + b.cursor.y;
      let ce = cy + b.cursor.h;
      if (clip) {
        cy = Math.max(cy, clip[0]);
        ce = Math.min(ce, clip[1]);
      }
      this.cursor = { x: x + b.cursor.x, y: cy, h: Math.max(1, ce - cy) };
    }
  }

  ink(x: number, y: number, w: number, h: number): void {
    this.i0 = Math.min(this.i0, y);
    this.i1 = Math.max(this.i1, y + h);
    this.j0 = Math.min(this.j0, x);
    this.j1 = Math.max(this.j1, x + w);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    this.ops.push({ kind: 'line', x1, y1, x2, y2 });
    this.ink(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) + 1, Math.abs(y2 - y1) + 1);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: 'rect', x, y, w, h, fill: true });
    this.ink(x, y, w, h);
  }

  done(w: number, h: number, base: number, tail = 0, kind: Box['kind'] = 'other'): Box {
    const inked = this.i1 > this.i0;
    let cursor = this.cursor;
    if (cursor) {
      const x = Math.min(Math.max(cursor.x, 0), Math.max(0, w - 1 + tail));
      const y = Math.min(Math.max(cursor.y, 0), Math.max(0, h - 1));
      cursor = { x, y, h: Math.max(1, Math.min(cursor.h, h - y)) };
    }
    return {
      w, h, base, ops: this.ops, cursor,
      i0: inked ? this.i0 : 0, i1: inked ? this.i1 : 0, j0: inked ? this.j0 : 0, j1: inked ? this.j1 : 0,
      tail, kind,
    };
  }
}

/** Beschneidet eine Box auf ihren Tintenbereich (Ursprung = linke obere Tintenecke). */
function crop(b: Box): Box {
  const i0 = hasInk(b) ? b.i0 : 0;
  const i1 = hasInk(b) ? b.i1 : b.h;
  const j0 = hasInk(b) ? b.j0 : 0;
  const j1 = hasInk(b) ? b.j1 : b.w;
  const out: Box = {
    w: j1 - j0, h: i1 - i0, base: b.base - i0, ops: shiftOps(b.ops, -j0, -i0),
    i0: 0, i1: i1 - i0, j0: 0, j1: j1 - j0, tail: 0, kind: b.kind,
  };
  if (b.cursor) out.cursor = { x: Math.max(0, b.cursor.x - j0), y: b.cursor.y - i0, h: b.cursor.h };
  return out;
}

/** Verschiebt eine (beschnittene) Box so, dass die Hauptgrundlinie `raise` Punkte unter ihrer eigenen liegt. */
function atBaseline(s: Box, raise: number, kind: Box['kind']): Box {
  let base = s.base + raise;
  let oy = 0;
  if (base < 0) {
    oy = -base;
    base = 0;
  }
  const b = new Build();
  b.add(s, 0, oy);
  return b.done(s.w, Math.max(s.h + oy, base + 1), base, 0, kind);
}

// --- Schablonen -------------------------------------------------------------------------------

type SubFn = (k: number, font?: FP) => Box;

/** Bruch: Zähler über Nenner (beide beschnitten), Strich 1 Punkt breit auf Höhe der Mittellinie. */
function stack(num: Box, den: Box, f: FP): Box {
  const m = Math.max(num.w, den.w);
  const barY = num.h + 1;
  const h = num.h + den.h + 3;
  const b = new Build();
  b.add(num, 1 + ((m - num.w) >> 1), 0, [0, barY]);
  b.add(den, 1 + ((m - den.w) >> 1), barY + 2, [barY + 1, h]);
  b.rect(0, barY, m + 2, 1);
  return b.done(m + 2, h, barY + f.axis);
}

/** Wurzelzeichen mit Überstrich; `idx` ist der (beschnittene) Wurzelexponent. */
function radical(rad: Box, idx?: Box): Box {
  const r = crop(rad);
  const H = r.h + 2;
  const sw = H <= 10 ? 5 : H <= 14 ? 6 : 7;
  const tick = H <= 10 ? 2 : 3;
  const ox = idx ? Math.max(0, idx.w - 3) : 0;
  const rx = ox + sw + 1;
  const barEnd = rx + r.w;
  const tickY = H - 1 - tick;
  const idxY = idx ? tickY - 1 - idx.h : 0;
  const dy = Math.max(0, -idxY);
  const b = new Build();
  if (idx) b.add(idx, 0, idxY + dy);
  b.line(ox, tickY + dy, ox + tick, H - 1 + dy);
  b.line(ox + tick, H - 1 + dy, ox + sw - 1, dy);
  b.rect(ox + sw - 1, dy, barEnd - (ox + sw - 1) + 1, 1);
  b.add(r, rx, dy + 2, [dy + 1, dy + H]);
  return b.done(barEnd + 1, H + dy, dy + 2 + r.base);
}

/** Senkrechte Striche der Betragsfunktion. */
function absBars(arg: Box): Box {
  const a = crop(arg);
  const H = a.h + 2;
  const b = new Build();
  b.rect(0, 0, 1, H);
  b.add(a, 2, 1, [0, H]);
  b.rect(a.w + 3, 0, 1, H);
  return b.done(a.w + 4, H, 1 + a.base);
}

/** Integralzeichen der Höhe H aus Linien (Haken oben rechts und unten links). */
function integralSign(b: Build, H: number): void {
  b.line(3, 1, 3, H - 2);
  b.line(3, 1, 4, 0);
  b.line(4, 0, 5, 0);
  b.line(5, 0, 6, 1);
  b.line(3, H - 2, 2, H - 1);
  b.line(2, H - 1, 1, H - 1);
  b.line(1, H - 1, 0, H - 2);
}

function integral(g: Box, lower: Box, upper: Box): Box {
  const H = Math.max(g.h + 2, 15, upper.h + lower.h + 2);
  const gx = Math.max(8 + upper.w, 5 + lower.w, 7) + 2;
  const gy = (H - g.h) >> 1;
  const b = new Build();
  integralSign(b, H);
  b.add(upper, 8, 0, [0, H]);
  b.add(lower, 5, H - lower.h, [0, H]);
  b.add(g, gx, gy, [0, H]);
  return b.done(gx + g.w, H, gy + g.base);
}

function sumProd(sym: Box, f: Box, lower: Box, upper: Box, f0: FP): Box {
  const W = Math.max(sym.w, lower.w, upper.w);
  const yS = upper.h + 1;
  const yL = yS + sym.h + 1;
  const b = new Build();
  b.add(upper, (W - upper.w) >> 1, 0);
  b.add(sym, (W - sym.w) >> 1, yS);
  b.add(lower, (W - lower.w) >> 1, yL);
  const col = b.done(W, yL + lower.h, yS + sym.base);
  return hb([col, f], f0);
}

function deriv(fn: Box, at: Box, f: FP): Box {
  const d = stack(crop(textBox('d', f)), crop(textBox('d𝑥', f)), f);
  const g = hb([d, textBox('(', f), fn, textBox(')', f)], f);
  const bottom = g.i1 - 1;
  const sub = crop(hb([textBox('𝑥=', FPS.S), at], FPS.S));
  const sy = bottom - 3;
  const b = new Build();
  b.add(g, 0, 0);
  b.rect(g.w, g.i0, 1, bottom - g.i0 + 1);
  b.add(sub, g.w + 3, sy);
  return b.done(g.w + 3 + sub.w, Math.max(g.h, sy + sub.h), g.base);
}

function recurring(digits: Box): Box {
  const r = crop(digits);
  const b = new Build();
  b.rect(0, 0, r.w, 1);
  b.add(r, 0, 2, [1, r.h + 2]);
  return b.done(r.w, r.h + 2, 2 + r.base);
}

function power(exp: Box, f: FP, prev: Box | undefined): Box {
  const extra = prev && prev.kind === 'other' && hasInk(prev) ? Math.max(0, prev.base - prev.i0 - f.capAsc) : 0;
  return atBaseline(crop(exp), f.raise + extra, 'pow');
}

/** Lineare Schreibweise einer Schablone (eine Zeile in Schrift L). */
function linearTpl(tpl: Template, sub: SubFn): Box {
  const L = FPS.L;
  const T = (s: string): Box => textBox(s, L);
  const s = (k: number): Box => sub(k);
  const parts: Box[] = (() => {
    switch (tpl.type) {
      case 'frac': return [s(0), T('⌟'), s(1)];
      case 'mixed': return [s(0), T('⌟'), s(1), T('⌟'), s(2)];
      case 'sqrt': return [T('√('), s(0), T(')')];
      case 'cbrt': return [T('³√('), s(0), T(')')];
      case 'root': return [s(0), T('√('), s(1), T(')')];
      case 'pow': return [T('^('), s(0), T(')')];
      case 'pow10': return [T('10^('), s(0), T(')')];
      case 'exp': return [T('e^('), s(0), T(')')];
      case 'e10': return [T('×10'), s(0)];
      case 'logab': return [T('log('), s(0), T(';'), s(1), T(')')];
      case 'abs': return [T('Abs('), s(0), T(')')];
      case 'integral': return [T('∫('), s(0), T(';'), s(1), T(';'), s(2), T(')')];
      case 'deriv': return [T('d/d𝑥('), s(0), T(';'), s(1), T(')')];
      case 'sum': return [T('Σ('), s(0), T(';'), s(1), T(';'), s(2), T(')')];
      case 'prod': return [T('Π('), s(0), T(';'), s(1), T(';'), s(2), T(')')];
      case 'recurring': return [recurring(s(0))];
    }
  })();
  return hb(parts, L);
}

/** Natürliche Darstellung einer Schablone in Schriftgröße `f`. */
function mathTpl(tpl: Template, f: FP, sub: SubFn, prev: Box | undefined): Box {
  const T = (s: string): Box => textBox(s, f);
  const S = FPS.S;
  switch (tpl.type) {
    case 'frac':
      return stack(crop(sub(0)), crop(sub(1)), f);
    case 'mixed':
      return hb([sub(0), stack(crop(sub(1)), crop(sub(2)), f)], f);
    case 'sqrt':
      return radical(sub(0));
    case 'cbrt':
      return radical(sub(0), crop(textBox("3", S)));
    case 'root':
      return radical(sub(1), crop(sub(0, S)));
    case 'pow':
      return power(sub(0, S), f, prev);
    case 'pow10':
      return hb([T('10'), power(sub(0, S), f, undefined)], f);
    case 'exp':
      return hb([T('e'), power(sub(0, S), f, undefined)], f);
    case 'e10':
      return hb([T('×10'), power(sub(0, S), f, undefined)], f);
    case 'logab':
      return hb([T('log'), atBaseline(crop(sub(0, S)), -f.sub, 'other'), T('('), sub(1), T(')')], f);
    case 'abs':
      return absBars(sub(0));
    case 'integral': {
      const g = crop(hb([sub(0), T('d𝑥')], f));
      return integral(g, crop(sub(1, S)), crop(sub(2, S)));
    }
    case 'deriv':
      return deriv(sub(0), sub(1, S), f);
    case 'sum':
    case 'prod': {
      const sym = crop(T(tpl.type === 'sum' ? 'Σ' : 'Π'));
      const low = crop(hb([textBox('𝑥=', S), sub(1, S)], S));
      return sumProd(sym, hb([T('('), sub(0), T(')')], f), low, crop(sub(2, S)), f);
    }
    case 'recurring':
      return recurring(sub(0));
  }
}

// --- Felder und Eingabezeile ------------------------------------------------------------------

interface Ctx {
  mode: Mode;
}

function itemBox(it: Item, f: FP, depth: number, ctx: Ctx, cur: Cursor | null, idx: number, prev: Box | undefined): Box {
  if (it.kind === 'tok') return textBox(TOKENS[it.tok]?.text ?? it.tok, f);
  const step = cur && cur.path.length > depth ? cur.path[depth] : undefined;
  const into = step && step.item === idx ? step.slot : -1;
  const sub: SubFn = (k, font = f) =>
    slotBox(it.slots[k] ?? [], ctx.mode === 'linear' ? FPS.L : font, depth + 1, ctx, into === k ? cur : null);
  return ctx.mode === 'linear' ? linearTpl(it, sub) : mathTpl(it, f, sub, prev);
}

/** Ein Feld (Liste von Elementen) als Box; ein leeres Feld zeigt □. */
function slotBox(slot: Slot, f: FP, depth: number, ctx: Ctx, cur: Cursor | null): Box {
  const here = cur !== null && cur.path.length === depth;
  const at = here ? Math.min(Math.max(cur.pos, 0), slot.length) : -1;
  const parts: Box[] = [];
  let last: Box | undefined;
  if (slot.length === 0) {
    if (here) parts.push(cursorBox(f));
    parts.push(textBox('□', f));
  } else {
    for (let i = 0; i <= slot.length; i++) {
      if (i === at) parts.push(cursorBox(f));
      if (i === slot.length) break;
      const bx = itemBox(slot[i], f, depth, ctx, cur, i, last);
      parts.push(bx);
      last = bx;
    }
  }
  const b = hb(parts, f);
  if (b.cursor) b.cursor.x = Math.max(0, b.cursor.x);
  return b;
}

const plain = (b: Box): Laid => {
  const out: Laid = { w: b.w, h: b.h, base: b.base, ops: b.ops };
  if (b.cursor) {
    out.cursor = b.cursor;
    out.w = Math.max(b.w, b.cursor.x + 2);
  }
  return out;
};

/** Eingabezeile (Wurzelfeld) mit Cursor (oder null) in natürlicher oder linearer Darstellung. */
export function layoutInput(root: Slot, cursor: Cursor | null, mode: Mode): Laid {
  return plain(slotBox(root, FPS.L, 0, { mode }, cursor));
}

// --- Ergebnisse -------------------------------------------------------------------------------

export function layoutResult(r: ResultForm, mode: Mode): Laid {
  if (r.kind === 'recurring') {
    // Als Eingabebaum mit Perioden-Schablone zeichnen
    const digits = (t: string): Slot => [...t].map((d) => ({ kind: 'tok' as const, tok: d }));
    const slot: Slot = [...(r.negative ? digits('-').map(() => ({ kind: 'tok' as const, tok: 'neg' })) : []), ...digits(r.int), { kind: 'tok', tok: ',' }, ...digits(r.nonRep), template('recurring', digits(r.rep))];
    return layoutInput(slot, null, mode);
  }
  const L = FPS.L;
  const T = (s: string): Box => textBox(s, L);
  const math = mode === 'math';
  const frac = (num: Box[], den: string): Box =>
    math ? stack(crop(hb(num, L)), crop(T(den)), L) : hb([...num, T('⌟'), T(den)], L);
  const parts: Box[] = [];
  switch (r.kind) {
    case 'text':
      parts.push(T(r.text));
      break;
    case 'decimal':
      parts.push(T(r.exponent === undefined ? r.mantissa : `${r.mantissa}×10`));
      if (r.exponent !== undefined) parts.push(power(textBox(String(r.exponent), FPS.S), L, undefined));
      break;
    case 'fraction':
      if (r.negative) parts.push(T('-'));
      if (r.whole !== undefined) parts.push(T(r.whole), ...(math ? [] : [T('⌟')]));
      parts.push(frac([T(r.num)], r.den));
      break;
    case 'surd': {
      const num: Box[] = [];
      for (const t of r.terms) {
        if (t.a === 0n) continue;
        const neg = t.a < 0n;
        const abs = neg ? -t.a : t.a;
        if (neg) num.push(T('-'));
        else if (num.length) num.push(T('+'));
        if (t.b === 1n) {
          num.push(T(String(abs)));
          continue;
        }
        if (abs !== 1n) num.push(T(String(abs)));
        num.push(math ? radical(T(String(t.b))) : T(`√${t.b}`));
      }
      if (num.length === 0) num.push(T('0'));
      if (r.c <= 1n) parts.push(...num);
      else if (math || r.terms.length <= 1) parts.push(frac(num, String(r.c)));
      else parts.push(frac([T('('), ...num, T(')')], String(r.c)));
      break;
    }
    case 'pi': {
      if (r.num === 0n) {
        parts.push(T('0'));
        break;
      }
      const neg = r.num < 0n;
      const abs = neg ? -r.num : r.num;
      const numText = (abs === 1n ? '' : String(abs)) + 'π';
      if (neg) parts.push(T('-'));
      parts.push(r.den === 1n ? T(numText) : frac([T(numText)], String(r.den)));
      break;
    }
  }
  return plain(hb(parts, L));
}
