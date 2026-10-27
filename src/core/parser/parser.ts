// Parser: Eingabebaum (Slots) → AST. Prioritäten nach der Bedienungsanleitung:
//  Klammern/Funktionen > Postfix (x², x⁻¹, x!, °′″, %, Potenz-Schablonen) > Brüche (Schablonen)
//  > Vorzeichen (−) > implizite Multiplikation > nPr, nCr, ∠ > ×, ÷, ÷R > +, −.
// Fehlende schließende Klammern am Ende eines Feldes werden ergänzt.

import type { Cursor, Item, PathStep, Slot, TemplateType } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';
import { CalcError } from '../errors';

export type Pos = Cursor;

export type BinOp = '+' | '−' | '×' | '÷' | 'imul' | 'nPr' | 'nCr' | '÷R' | '∠';
export type PostOp = '²' | '³' | '⁻¹' | '!' | '%' | 'deg' | 'rad' | 'gra';

export type Node =
  | { t: 'num'; digits: string; frac: string; recurring?: string; exp?: Node; at: Pos }
  | { t: 'var'; name: string; at: Pos }
  | { t: 'const'; name: string; at: Pos }
  | { t: 'neg'; arg: Node; at: Pos }
  | { t: 'bin'; op: BinOp; l: Node; r: Node; at: Pos }
  | { t: 'post'; op: PostOp; arg: Node; at: Pos }
  | { t: 'dms'; parts: Node[]; at: Pos }
  | { t: 'conv'; label: string; arg: Node; at: Pos }
  | { t: 'pow'; base: Node; exp: Node; at: Pos }
  | { t: 'call'; fn: string; args: Node[]; at: Pos }
  | { t: 'tpl'; type: Exclude<TemplateType, 'pow'>; args: Node[]; at: Pos };

export type Statement = { kind: 'expr'; expr: Node } | { kind: 'eq'; l: Node; r: Node };

/** Anzahl der Argumente je Funktion (Bereich). */
const ARITY: Record<string, [number, number]> = {
  'Pol(': [2, 2], 'Rec(': [2, 2], 'GCD(': [2, 2], 'LCM(': [2, 2], 'RndFix(': [2, 2], 'RanInt#(': [2, 2],
  'log(': [1, 2],
};

/** Ein Slot als flache Tokenfolge mit Positionen. */
interface Cell {
  item: Item;
  at: Pos;
}

class SlotReader {
  i = 0;
  constructor(
    readonly cells: Cell[],
    readonly end: Pos,
  ) {}

  peek(k = 0): Cell | undefined {
    return this.cells[this.i + k];
  }

  next(): Cell {
    return this.cells[this.i++];
  }

  get done(): boolean {
    return this.i >= this.cells.length;
  }

  /** Position des aktuellen Elements (oder Feldende). */
  get here(): Pos {
    return this.peek()?.at ?? this.end;
  }
}

const tokOf = (c: Cell | undefined): string | undefined => (c?.item.kind === 'tok' ? c.item.tok : undefined);
const kindOf = (c: Cell | undefined) => {
  const t = tokOf(c);
  return t === undefined ? undefined : TOKENS[t]?.kind;
};

function reader(slot: Slot, path: PathStep[]): SlotReader {
  const cells = slot.map((item, idx) => ({ item, at: { path, pos: idx } }));
  return new SlotReader(cells, { path, pos: slot.length });
}

const syntax = (at: Pos): CalcError => new CalcError('syntax', at);

export class Parser {
  /** Zerlegt die oberste Ebene in Anweisungen (getrennt durch „:“). */
  parseStatements(root: Slot): Statement[] {
    const parts: Slot[] = [[]];
    const offsets = [0];
    root.forEach((it, idx) => {
      if (it.kind === 'tok' && it.tok === ':') {
        parts.push([]);
        offsets.push(idx + 1);
      } else parts[parts.length - 1].push(it);
    });
    return parts.map((part, k) => this.parseStatement(part, offsets[k], root.length));
  }

  private parseStatement(part: Slot, offset: number, rootLen: number): Statement {
    const cells = part.map((item, idx) => ({ item, at: { path: [], pos: offset + idx } }));
    const endPos = { path: [], pos: offset + part.length <= rootLen ? offset + part.length : rootLen };
    const eqIdx = part.findIndex((it) => it.kind === 'tok' && it.tok === '=');
    if (eqIdx >= 0) {
      if (part.findIndex((it, k) => k > eqIdx && it.kind === 'tok' && it.tok === '=') >= 0) {
        throw syntax(cells[part.findIndex((it, k) => k > eqIdx && it.kind === 'tok' && it.tok === '=')].at);
      }
      const l = this.parseAll(new SlotReader(cells.slice(0, eqIdx), cells[eqIdx].at));
      const r = this.parseAll(new SlotReader(cells.slice(eqIdx + 1), endPos));
      return { kind: 'eq', l, r };
    }
    return { kind: 'expr', expr: this.parseAll(new SlotReader(cells, endPos)) };
  }

  /** Parst ein Schablonenfeld vollständig. */
  parseSlot(slot: Slot, path: PathStep[]): Node {
    return this.parseAll(reader(slot, path));
  }

  private parseAll(r: SlotReader): Node {
    if (r.done) throw syntax(r.here);
    const node = this.additive(r);
    if (!r.done) throw syntax(r.here);
    return node;
  }

  private additive(r: SlotReader): Node {
    let l = this.multiplicative(r);
    for (;;) {
      const t = tokOf(r.peek());
      if (t !== '+' && t !== '−') return l;
      const at = r.next().at;
      l = { t: 'bin', op: t, l, r: this.multiplicative(r), at };
    }
  }

  private multiplicative(r: SlotReader): Node {
    let l = this.permutation(r);
    for (;;) {
      const t = tokOf(r.peek());
      if (t !== '×' && t !== '÷' && t !== '÷R') return l;
      const at = r.next().at;
      l = { t: 'bin', op: t, l, r: this.permutation(r), at };
    }
  }

  private permutation(r: SlotReader): Node {
    let l = this.implicit(r);
    for (;;) {
      const t = tokOf(r.peek());
      if (t !== 'nPr' && t !== 'nCr' && t !== '∠') return l;
      const at = r.next().at;
      l = { t: 'bin', op: t, l, r: this.implicit(r), at };
    }
  }

  /** Implizite Multiplikation: Werte, die ohne Operator aufeinander folgen. */
  private implicit(r: SlotReader): Node {
    let l = this.converted(r);
    while (this.startsValue(r.peek())) {
      const at = r.here;
      const right = this.converted(r);
      // Sexagesimal-Eingabe 2°20°30° bildet einen Wert
      if (l.t === 'dms' && right.t === 'dms' && l.parts.length + right.parts.length <= 3) {
        l = { t: 'dms', parts: [...l.parts, ...right.parts], at: l.at };
      } else l = { t: 'bin', op: 'imul', l, r: right, at };
    }
    return l;
  }

  /** Einheitenumrechnung (z. B. 12,5ft▸m): bindet schwächer als das Vorzeichen. */
  private converted(r: SlotReader): Node {
    let node = this.unary(r);
    while (kindOf(r.peek()) === 'conv') {
      const c = r.next();
      node = { t: 'conv', label: tokOf(c)!.slice('conv:'.length), arg: node, at: c.at };
    }
    return node;
  }

  private startsValue(c: Cell | undefined): boolean {
    if (!c) return false;
    if (c.item.kind === 'tpl') return c.item.type !== 'pow';
    const k = kindOf(c);
    return k === 'digit' || k === 'comma' || k === 'var' || k === 'const' || k === 'lparen' || k === 'func' || k === 'neg';
  }

  private unary(r: SlotReader): Node {
    if (tokOf(r.peek()) === 'neg') {
      const at = r.next().at;
      return { t: 'neg', arg: this.unary(r), at };
    }
    return this.postfix(r);
  }

  private postfix(r: SlotReader): Node {
    let node = this.primary(r);
    for (;;) {
      const c = r.peek();
      if (c?.item.kind === 'tpl' && c.item.type === 'pow') {
        r.next();
        node = { t: 'pow', base: node, exp: this.parseSlot(c.item.slots[0], [...c.at.path, { item: c.at.pos, slot: 0 }]), at: c.at };
        continue;
      }
      const t = tokOf(c);
      if (t === undefined) return node;
      if (t === 'dms') {
        r.next();
        node = { t: 'dms', parts: [node], at: c!.at };
        continue;
      }
      if (t === 'deg' || t === 'rad' || t === 'gra' || TOKENS[t]?.kind === 'postfix') {
        r.next();
        node = { t: 'post', op: t as PostOp, arg: node, at: c!.at };
        continue;
      }
      return node;
    }
  }

  private primary(r: SlotReader): Node {
    const c = r.peek();
    if (!c) throw syntax(r.here);
    if (c.item.kind === 'tpl') {
      if (c.item.type === 'pow') throw syntax(c.at);
      // ×10^▫ ohne Mantisse gilt als 1×10^▫
      if (c.item.type === 'e10') return this.number(r);
      r.next();
      const tpl = c.item;
      const args = tpl.slots.map((slot, s) => this.parseSlot(slot, [...c.at.path, { item: c.at.pos, slot: s }]));
      return { t: 'tpl', type: tpl.type as Exclude<TemplateType, 'pow'>, args, at: c.at };
    }
    const tok = c.item.tok;
    const kind = TOKENS[tok]?.kind;
    switch (kind) {
      case 'digit':
      case 'comma':
        return this.number(r);
      case 'var':
        r.next();
        return { t: 'var', name: tok, at: c.at };
      case 'const':
        r.next();
        return { t: 'const', name: tok, at: c.at };
      case 'lparen': {
        r.next();
        const inner = this.additive(r);
        this.closeParen(r);
        return inner;
      }
      case 'func':
        return this.call(r);
    }
    throw syntax(c.at);
  }

  private closeParen(r: SlotReader): void {
    if (r.done) return; // automatisch geschlossen
    if (tokOf(r.peek()) !== ')') throw syntax(r.here);
    r.next();
  }

  private call(r: SlotReader): Node {
    const c = r.next();
    const fn = tokOf(c)!;
    const args: Node[] = [];
    if (!(tokOf(r.peek()) === ')' && ARITY[fn]?.[0] === 0)) {
      args.push(this.additive(r));
      while (tokOf(r.peek()) === ';') {
        r.next();
        args.push(this.additive(r));
      }
    }
    this.closeParen(r);
    const [min, max] = ARITY[fn] ?? [1, 1];
    if (args.length < min || args.length > max) throw syntax(c.at);
    return { t: 'call', fn, args, at: c.at };
  }

  /** Zahl aus Ziffern und Komma, optional mit Periode und ×10^▫. */
  private number(r: SlotReader): Node {
    const at = r.here;
    let digits = '';
    let frac = '';
    let comma = false;
    let any = false;
    for (;;) {
      const k = kindOf(r.peek());
      if (k === 'digit') {
        const d = tokOf(r.next())!;
        if (comma) frac += d;
        else digits += d;
        any = true;
      } else if (k === 'comma') {
        if (comma) throw syntax(r.here);
        comma = true;
        r.next();
      } else break;
    }
    const node: Extract<Node, { t: 'num' }> = { t: 'num', digits: digits || (any || comma ? '0' : '1'), frac, at };
    let c = r.peek();
    if (c?.item.kind === 'tpl' && c.item.type === 'recurring') {
      r.next();
      const rep = c.item.slots[0].map((it) => (it.kind === 'tok' ? it.tok : '?')).join('');
      if (!/^\d+$/.test(rep)) throw syntax(c.at);
      node.recurring = rep;
      c = r.peek();
    }
    if (c?.item.kind === 'tpl' && c.item.type === 'e10') {
      r.next();
      node.exp = this.parseSlot(c.item.slots[0], [...c.at.path, { item: c.at.pos, slot: 0 }]);
    } else if (!any && !comma) {
      throw syntax(at);
    }
    return node;
  }
}

export function parse(root: Slot): Statement[] {
  return new Parser().parseStatements(root);
}
