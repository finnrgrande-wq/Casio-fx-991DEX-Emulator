// Anwendung B „Ungleichungen“: Polynomungleichungen Grad 2–4 mit Koeffizienten-Editor
// und Lösungsmenge (a<x<b; c<x …).

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { joinLaid, layoutResult, translate, type Laid } from '../../display/mathLayout';
import { formToText, type ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import { evalContext } from '../../calculator/context';
import type { KeyId } from '../../keys/keymap';
import { ListMenu, closeMenus } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';
import { solveInequality, type IneqSolution, type Rel } from './model';

type Phase = 'count' | 'type' | 'editor' | 'solution' | 'error';

interface Stored {
  n: number;
  rel: Rel;
  coeffs: V.SerializedValue[];
}

const DIGITS: KeyId[] = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
const RELS: Rel[] = ['>', '<', '≥', '≤'];
const HEADER = ['', '', 'a𝑥²+b𝑥+c', 'a𝑥³+b𝑥²+c𝑥+d', 'a𝑥⁴+b𝑥³+c𝑥²+d𝑥+e'];
const POWERS = ['', '𝑥', '𝑥²', '𝑥³', '𝑥⁴'];
const LETTERS = 'abcdefgh';
const CELL_W = 62;
const VISIBLE = 3;

/** Bestandteil der Lösungszeile: Nullstelle (Index in roots) oder fester Text. */
type Seg = { root: number } | { text: string };

export class InequalityScreen implements Screen {
  private phase: Phase = 'count';
  private n = 2;
  private rel: Rel = '>';
  private coeffs: Value[] = [];
  private col = 0;
  private readonly input = new ValueInput();
  private sol: IneqSolution | undefined;
  private scroll = 0;
  private showExact = true;
  private error: CalcError | undefined;

  constructor(private readonly host: Host) {
    const stored = host.state.modeData.inequality as Stored | undefined;
    if (stored) {
      this.n = stored.n;
      this.rel = stored.rel;
      this.coeffs = stored.coeffs.map((c) => V.deserialize(c));
      this.phase = 'editor';
    }
  }

  private save(): void {
    const data: Stored = { n: this.n, rel: this.rel, coeffs: this.coeffs.map(V.serialize) };
    this.host.state.modeData.inequality = data;
    this.host.persist();
  }

  private get linear(): boolean {
    return this.host.state.settings.io !== 'mathMath';
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (a === 'sys:optn' && this.phase !== 'count' && this.phase !== 'type') {
      host.push(new ListMenu([{ label: 'Polyn.-Ungleich', run: (h) => (closeMenus(h), (this.phase = 'count')) }]));
      return true;
    }
    switch (this.phase) {
      case 'count': {
        const d = DIGITS.indexOf(ev.key);
        if (d >= 2 && d <= 4) {
          this.n = d;
          this.phase = 'type';
        } else if (a === 'sys:ac' && this.coeffs.length > 0) this.phase = 'editor';
        return true;
      }
      case 'type': {
        const i = ['D1', 'D2', 'D3', 'D4'].indexOf(ev.key);
        if (i >= 0) {
          this.rel = RELS[i];
          this.coeffs = Array.from({ length: this.n + 1 }, () => V.ZERO);
          this.col = 0;
          this.phase = 'editor';
          this.save();
        }
        return true;
      }
      case 'editor':
        return this.handleEditor(a);
      case 'solution':
        return this.handleSolution(a);
      case 'error':
        if (a === 'sys:ac' || a === 'cmd:exe') this.phase = 'editor';
        return true;
    }
  }

  private handleEditor(a: string | undefined): boolean {
    if (!a) return true;
    switch (a) {
      case 'sys:ac':
        if (this.input.editing) this.input.cancel();
        else {
          this.coeffs = this.coeffs.map(() => V.ZERO);
          this.save();
        }
        return true;
      case 'cmd:exe':
        if (this.input.editing) {
          if (this.commit() && this.col < this.n) this.col++;
        } else this.solve();
        return true;
      case 'nav:up':
      case 'nav:down':
      case 'nav:left':
      case 'nav:right':
        if (this.input.editing && (a === 'nav:left' || a === 'nav:right')) return this.input.handle(a);
        if (!this.commit()) return true;
        if (a === 'nav:right' || a === 'nav:down') this.col = Math.min(this.n, this.col + 1);
        else this.col = Math.max(0, this.col - 1);
        return true;
    }
    this.input.handle(a);
    return true;
  }

  private commit(): boolean {
    try {
      const v = this.input.commit(evalContext(this.host.state));
      if (v) {
        this.coeffs[this.col] = v;
        this.save();
      }
      return true;
    } catch (e) {
      return this.fail(e);
    }
  }

  private fail(e: unknown): false {
    if (!(e instanceof CalcError)) throw e;
    this.error = e;
    this.phase = 'error';
    return false;
  }

  private handleSolution(a: string | undefined): boolean {
    switch (a) {
      case 'sys:ac':
      case 'cmd:exe':
        this.phase = 'editor';
        return true;
      case 'nav:right':
        this.scroll += 1;
        return true;
      case 'nav:left':
        this.scroll = Math.max(0, this.scroll - 1);
        return true;
      case 'nav:down':
        this.scroll += 1;
        return true;
      case 'nav:up':
        this.scroll = Math.max(0, this.scroll - 1);
        return true;
      case 'cmd:sd':
        this.showExact = !this.showExact;
        return true;
    }
    return true;
  }

  private solve(): void {
    try {
      this.sol = solveInequality(this.coeffs, this.rel);
      this.scroll = 0;
      this.showExact = true;
      this.phase = 'solution';
    } catch (e) {
      this.fail(e);
    }
  }

  // --- Lösungsdarstellung ---

  /** Lösungszeile als Folge von Bestandteilen, getrennt durch „;“. */
  private segments(): Seg[] {
    const sol = this.sol!;
    const out: Seg[] = [];
    sol.pieces.forEach((p, k) => {
      if (k > 0) out.push({ text: ';' });
      if (p.lo !== undefined && p.lo === p.hi) out.push({ text: '𝑥=' }, { root: p.lo });
      else {
        if (p.lo !== undefined) out.push({ root: p.lo }, { text: p.loClosed ? '≤' : '<' });
        out.push({ text: '𝑥' });
        if (p.hi !== undefined) out.push({ text: p.hiClosed ? '≤' : '<' }, { root: p.hi });
      }
    });
    return out;
  }

  private rootForm(v: Value): ResultForm {
    const s = this.host.state.settings;
    return (this.showExact && exactForm(v, s)) || decimalForm(v, s);
  }

  /** Einzeilige Textfassung (Tests). */
  private text(): string {
    const sol = this.sol!;
    if (sol.kind === 'all') return 'Alle reell Zahlen';
    if (sol.kind === 'none') return 'Keine Lösung';
    return this.segments()
      .map((s) => ('text' in s ? s.text : formToText(this.rootForm(sol.roots[s.root]))))
      .join('');
  }

  // --- Anzeige ---

  render(): Scene {
    switch (this.phase) {
      case 'count':
        return lines(['Polyn.-Ungleich', 'Grad?', '', '2~4 wählen']);
      case 'type':
        return {
          ops: RELS.map((r, i) => ({ kind: 'text', x: 0, y: i * 16, text: `${i + 1}:${HEADER[this.n]}${r}0`, font: this.n === 2 ? 'L' : 'S' }) as DrawOp),
        };
      case 'error':
        return errorScene(this.error!.message);
      case 'editor':
        return this.renderEditor();
      case 'solution':
        return this.renderSolution();
    }
  }

  private renderEditor(): Scene {
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: `${HEADER[this.n]}${this.rel}0`, font: 'S' }];
    const first = Math.min(Math.max(0, this.col - 1), Math.max(0, this.n + 1 - VISIBLE));
    for (let i = first; i < Math.min(this.n + 1, first + VISIBLE); i++) {
      const x = 2 + (i - first) * CELL_W;
      const y = 16;
      const active = i === this.col;
      const label = i < this.n ? `${POWERS[this.n - i]}+` : `${this.rel}0`;
      if (active) ops.push({ kind: 'rect', x: x - 1, y: y - 1, w: 38, h: 10, fill: true });
      ops.push({ kind: 'text', x: x + 36, y, text: shortValue(this.coeffs[i]).slice(0, 6), font: 'S', align: 'right', invert: active });
      ops.push({ kind: 'text', x: x + 40, y, text: label, font: 'S' });
    }
    let cursor: Scene['cursor'] = null;
    if (this.input.editing) {
      const lay = this.input.laid();
      ops.push({ kind: 'rect', x: 0, y: 48, w: LCD_WIDTH, h: 16, fill: true, erase: true });
      ops.push(...translate(lay, 0, 48));
      if (lay.cursor) cursor = { x: lay.cursor.x, y: lay.cursor.y + 48, h: lay.cursor.h };
    } else {
      ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: 48, text: shortValue(this.coeffs[this.col]), font: 'L', align: 'right' });
    }
    return { ops, cursor };
  }

  private renderSolution(): Scene {
    const sol = this.sol!;
    if (sol.kind !== 'set') return lines([sol.kind === 'all' ? 'Alle reell Zahlen' : 'Keine Lösung']);
    const segs = this.segments();
    if (this.linear) {
      // Muster a<x<b;c<x und darunter die Werte a=, b=, …
      let k = 0;
      const values: { name: string; v: Value }[] = [];
      const pattern = segs
        .map((s) => {
          if ('text' in s) return s.text;
          const name = LETTERS[k++];
          values.push({ name, v: sol.roots[s.root] });
          return name;
        })
        .join('');
      const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: pattern, font: 'L' }];
      const start = Math.min(this.scroll, Math.max(0, values.length - 3));
      values.slice(start, start + 3).forEach((e, i) => {
        const y = 16 * (i + 1);
        ops.push({ kind: 'text', x: 0, y, text: `${e.name}=`, font: 'L' });
        const f = decimalForm(e.v, this.host.state.settings);
        ops.push({ kind: 'text', x: LCD_WIDTH - 1, y, text: formToText(f).replace('E', '×10^'), font: 'L', align: 'right' });
      });
      return { ops, status: { up: start > 0, down: start + 3 < values.length } };
    }
    const parts: Laid[] = segs.map((s) =>
      layoutResult('text' in s ? { kind: 'text', text: s.text } : this.rootForm(sol.roots[s.root]), 'math'),
    );
    const lay = joinLaid(parts);
    const maxScroll = Math.max(0, lay.w - LCD_WIDTH);
    const dx = -Math.min(this.scroll * 24, maxScroll);
    return { ops: translate(lay, dx, Math.floor((LCD_HEIGHT - lay.h) / 2)), status: { up: false, down: false } };
  }

  /** Für Tests. */
  get state(): { phase: Phase; text?: string; n: number; rel: Rel } {
    return { phase: this.phase, text: this.phase === 'solution' ? this.text() : undefined, n: this.n, rel: this.rel };
  }
}

function lines(texts: string[]): Scene {
  return { ops: texts.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
}
