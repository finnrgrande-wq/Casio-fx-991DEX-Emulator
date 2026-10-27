// Eingabemodell der natürlichen Darstellung: ein Baum aus Slots (Listen von Elementen).
// Elemente sind Token (Ziffern, Operatoren, Funktionen …) oder Schablonen mit eigenen Slots.

export type TemplateType =
  | 'frac' | 'mixed' | 'sqrt' | 'cbrt' | 'root' | 'pow' | 'pow10' | 'exp' | 'e10'
  | 'logab' | 'abs' | 'integral' | 'deriv' | 'sum' | 'prod' | 'recurring';

/** Anzahl der Eingabefelder je Schablone in Eingabereihenfolge. */
export const SLOT_COUNT: Readonly<Record<TemplateType, number>> = {
  frac: 2, mixed: 3, sqrt: 1, cbrt: 1, root: 2, pow: 1, pow10: 1, exp: 1, e10: 1,
  logab: 2, abs: 1, integral: 3, deriv: 2, sum: 3, prod: 3, recurring: 1,
};

/** Feld, das beim Einfügen mit INS den Wert rechts vom Cursor aufnimmt. */
const WRAP_SLOT: Readonly<Record<TemplateType, number>> = {
  frac: 0, mixed: 1, sqrt: 0, cbrt: 0, root: 1, pow: 0, pow10: 0, exp: 0, e10: 0,
  logab: 1, abs: 0, integral: 0, deriv: 0, sum: 0, prod: 0, recurring: 0,
};

export type Token = string;
export type Item = { kind: 'tok'; tok: Token } | Template;
export interface Template {
  kind: 'tpl';
  type: TemplateType;
  slots: Item[][];
}
export type Slot = Item[];

export interface PathStep {
  item: number;
  slot: number;
}
export interface Cursor {
  path: PathStep[];
  pos: number;
}

const tok = (t: Token): Item => ({ kind: 'tok', tok: t });

export function template(type: TemplateType, ...contents: Slot[]): Template {
  const slots: Slot[] = [];
  for (let i = 0; i < SLOT_COUNT[type]; i++) slots.push(contents[i] ?? []);
  return { kind: 'tpl', type, slots };
}

function cloneSlot(slot: Slot): Slot {
  return slot.map((it) => (it.kind === 'tok' ? it : { ...it, slots: it.slots.map(cloneSlot) }));
}

/** Token, die zusammen mit folgenden Ziffern einen Zahlwert bilden. */
const NUMBER_CHARS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',']);
/** Token, die eine Klammer öffnen (Funktionen enthalten die Klammer). */
export const opensParen = (t: Token): boolean => t.endsWith('(');

export interface EditorSnapshot {
  root: Slot;
  cursor: Cursor;
}

export class Editor {
  root: Slot = [];
  cursor: Cursor = { path: [], pos: 0 };
  /** Überschreibmodus (nur Lin.-Eingabe). */
  overwrite = false;
  /** Nach INS in Math-Eingabe: die nächste Schablone übernimmt den Wert rechts vom Cursor. */
  wrapNext = false;
  private undoState: EditorSnapshot | undefined;

  get isEmpty(): boolean {
    return this.root.length === 0;
  }

  snapshot(): EditorSnapshot {
    return { root: cloneSlot(this.root), cursor: { path: this.cursor.path.map((p) => ({ ...p })), pos: this.cursor.pos } };
  }

  restore(s: EditorSnapshot): void {
    this.root = cloneSlot(s.root);
    this.cursor = { path: s.cursor.path.map((p) => ({ ...p })), pos: s.cursor.pos };
  }

  /** Setzt den Inhalt neu (z. B. aus dem Ablaufspeicher) und den Cursor ans Ende. */
  load(root: Slot, cursorAtStart = false): void {
    this.root = cloneSlot(root);
    this.cursor = { path: [], pos: cursorAtStart ? 0 : this.root.length };
    this.wrapNext = false;
  }

  clear(): void {
    this.root = [];
    this.cursor = { path: [], pos: 0 };
    this.wrapNext = false;
    this.undoState = undefined;
  }

  // --- Navigation im Baum ---

  slotAt(path: PathStep[]): Slot {
    let slot = this.root;
    for (const step of path) {
      const it = slot[step.item];
      if (!it || it.kind !== 'tpl') throw new Error('ungültiger Cursorpfad');
      slot = it.slots[step.slot];
    }
    return slot;
  }

  get slot(): Slot {
    return this.slotAt(this.cursor.path);
  }

  /** Schablone, in deren Feld der Cursor steht (oder undefined auf oberster Ebene). */
  get parent(): { tpl: Template; step: PathStep } | undefined {
    const path = this.cursor.path;
    if (path.length === 0) return undefined;
    const step = path[path.length - 1];
    const tpl = this.slotAt(path.slice(0, -1))[step.item] as Template;
    return { tpl, step };
  }

  // --- Bearbeiten ---

  private remember(): void {
    this.undoState = this.snapshot();
  }

  insertToken(t: Token): void {
    this.remember();
    const slot = this.slot;
    if (this.overwrite && this.cursor.pos < slot.length) slot[this.cursor.pos] = tok(t);
    else slot.splice(this.cursor.pos, 0, tok(t));
    this.cursor.pos++;
  }

  insertTokens(ts: Token[]): void {
    for (const t of ts) this.insertToken(t);
  }

  /** Fügt eine Schablone ein und setzt den Cursor in ihr erstes leeres Feld. */
  insertTemplate(type: TemplateType): void {
    this.remember();
    const slot = this.slot;
    const tpl = template(type);
    let at = this.cursor.pos;
    if (this.wrapNext) {
      const len = this.operandLength(slot, at);
      tpl.slots[WRAP_SLOT[type]] = slot.splice(at, len);
      this.wrapNext = false;
    }
    slot.splice(at, 0, tpl);
    // Erstes leeres Feld ansteuern (beim Umschließen ist das Wertfeld schon gefüllt)
    let target = tpl.slots.findIndex((s) => s.length === 0);
    if (target < 0) target = tpl.slots.length - 1;
    this.cursor.path.push({ item: at, slot: target });
    this.cursor.pos = target === WRAP_SLOT[type] ? tpl.slots[target].length : 0;
    at++;
  }

  /** Länge des Operanden ab Position `at` (für INS): Zahl, Variable, Schablone oder Klammerausdruck. */
  private operandLength(slot: Slot, at: number): number {
    const first = slot[at];
    if (!first) return 0;
    if (first.kind === 'tpl') return 1;
    if (NUMBER_CHARS.has(first.tok)) {
      let n = 0;
      while (at + n < slot.length) {
        const it = slot[at + n];
        if (it.kind !== 'tok' || !NUMBER_CHARS.has(it.tok)) break;
        n++;
      }
      return n;
    }
    if (opensParen(first.tok)) {
      let depth = 0;
      for (let i = at; i < slot.length; i++) {
        const it = slot[i];
        if (it.kind !== 'tok') continue;
        if (opensParen(it.tok)) depth++;
        else if (it.tok === ')' && --depth === 0) return i - at + 1;
      }
      return slot.length - at;
    }
    return 1;
  }

  /** DEL: löscht links vom Cursor. Am Feldanfang wird die umgebende Schablone aufgelöst. */
  del(): void {
    const slot = this.slot;
    const pos = this.cursor.pos;
    if (pos > 0) {
      const prev = slot[pos - 1];
      if (prev.kind === 'tpl' && prev.slots.some((s) => s.length > 0)) {
        // In die gefüllte Schablone hineinspringen statt sie zu löschen
        this.moveLeft();
        return;
      }
      this.remember();
      slot.splice(pos - 1, 1);
      this.cursor.pos--;
      return;
    }
    const parent = this.parent;
    if (!parent) return;
    this.remember();
    const path = this.cursor.path.slice(0, -1);
    const outer = this.slotAt(path);
    const before = parent.tpl.slots.slice(0, parent.step.slot).reduce((n, s) => n + s.length, 0);
    outer.splice(parent.step.item, 1, ...parent.tpl.slots.flat());
    this.cursor = { path, pos: parent.step.item + before };
  }

  /** Umschalten zwischen dem letzten und dem aktuellen Zustand (ALPHA DEL). */
  undo(): void {
    if (!this.undoState) return;
    const current = this.snapshot();
    this.restore(this.undoState);
    this.undoState = current;
  }

  // --- Cursorbewegung ---

  /** Liefert false, wenn der Cursor am Ende der obersten Ebene stand und umbricht. */
  moveRight(): boolean {
    const slot = this.slot;
    const c = this.cursor;
    if (c.pos < slot.length) {
      const it = slot[c.pos];
      if (it.kind === 'tpl') c.path.push({ item: c.pos, slot: 0 }), (c.pos = 0);
      else c.pos++;
      return true;
    }
    const parent = this.parent;
    if (!parent) {
      c.pos = 0;
      return false;
    }
    if (parent.step.slot + 1 < parent.tpl.slots.length) {
      parent.step.slot++;
      c.pos = 0;
    } else {
      c.path.pop();
      c.pos = parent.step.item + 1;
    }
    return true;
  }

  moveLeft(): boolean {
    const slot = this.slot;
    const c = this.cursor;
    if (c.pos > 0) {
      const it = slot[c.pos - 1];
      if (it.kind === 'tpl') {
        const last = it.slots.length - 1;
        c.path.push({ item: c.pos - 1, slot: last });
        c.pos = it.slots[last].length;
      } else c.pos--;
      return true;
    }
    const parent = this.parent;
    if (!parent) {
      c.pos = slot.length;
      return false;
    }
    if (parent.step.slot > 0) {
      parent.step.slot--;
      c.pos = this.slot.length;
    } else {
      c.path.pop();
      c.pos = parent.step.item;
    }
    return true;
  }

  /** ▲/▼ zwischen Zähler und Nenner; false, wenn der Cursor in keinem Bruch steht. */
  moveVertical(dir: -1 | 1): boolean {
    const path = this.cursor.path;
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const step = path[depth];
      const tpl = this.slotAt(path.slice(0, depth))[step.item] as Template;
      const isFrac = tpl.type === 'frac' || tpl.type === 'mixed';
      if (!isFrac) continue;
      const num = tpl.type === 'frac' ? 0 : 1;
      const den = num + 1;
      const from = depth === path.length - 1 ? this.cursor.pos : tpl.slots[step.slot].length;
      if (dir > 0 && step.slot === num) {
        this.cursor = { path: [...path.slice(0, depth), { item: step.item, slot: den }], pos: Math.min(from, tpl.slots[den].length) };
        return true;
      }
      if (dir < 0 && step.slot === den) {
        this.cursor = { path: [...path.slice(0, depth), { item: step.item, slot: num }], pos: Math.min(from, tpl.slots[num].length) };
        return true;
      }
    }
    return false;
  }

  /** Setzt den Cursor auf eine Position (z. B. Fehlerstelle). */
  setCursor(c: Cursor): void {
    this.cursor = { path: c.path.map((p) => ({ ...p })), pos: c.pos };
  }
}
