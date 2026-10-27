// Anwendung A „Gleichung/Funkt“: lineare Gleichungssysteme (2–4 Unbekannte) und
// Polynomgleichungen (Grad 2–4) mit Koeffizienten-Editor und Lösungsanzeige.

import { CalcError } from '../../core/errors';
import { decimalForm, exactForm } from '../../core/format/result';
import { solveLinear } from '../../core/linalg/linsolve';
import { polyRoots } from '../../core/numeric/poly';
import { Rational } from '../../core/exact/rational';
import * as V from '../../core/value';
import type { Value } from '../../core/value';
import { layoutResult, translate } from '../../display/mathLayout';
import type { ResultForm } from '../../display/resultForm';
import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { VarName } from '../../calculator/state';
import type { KeyId } from '../../keys/keymap';
import { ListMenu, closeMenus } from '../listMenu';
import type { Host, KeyEvent, Screen } from '../screen';
import { ValueInput, errorScene, shortValue } from '../calc/prompt';
import { evalContext } from '../../calculator/context';

type Kind = 'system' | 'poly';
type Phase = 'type' | 'count' | 'editor' | 'solution' | 'message' | 'error';

interface Solution {
  label: string;
  value?: Value;
  /** Komplexe Lösung: Imaginärteil (Realteil in value). */
  im?: Value;
}

interface Stored {
  kind: Kind;
  n: number;
  coeffs: V.SerializedValue[][];
}

const DIGITS: KeyId[] = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
const STO_KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};
const UNKNOWNS = ['𝑥', '𝑦', 'z', 't'];
const SUB = ['₁', '₂', '₃', '₄'];
const POLY_HEADER = ['', '', 'a𝑥²+b𝑥+c', 'a𝑥³+b𝑥²+c𝑥+d', 'a𝑥⁴+b𝑥³+c𝑥²+d𝑥+e'];

export class EquationScreen implements Screen {
  private phase: Phase;
  private kind: Kind = 'poly';
  private n = 2;
  private coeffs: Value[][] = [];
  private row = 0;
  private col = 0;
  private readonly input = new ValueInput();
  private solutions: Solution[] = [];
  private si = 0;
  private showExact = true;
  private message: string[] = [];
  private error: CalcError | undefined;
  private stoPending = false;

  constructor(private readonly host: Host) {
    const stored = host.state.modeData.equation as Stored | undefined;
    if (stored) {
      this.kind = stored.kind;
      this.n = stored.n;
      this.coeffs = stored.coeffs.map((r) => r.map((c) => V.deserialize(c)));
      this.phase = 'editor';
    } else this.phase = 'type';
  }

  private get rows(): number {
    return this.kind === 'system' ? this.n : 1;
  }

  private get cols(): number {
    return this.kind === 'system' ? this.n + 1 : this.n + 1;
  }

  private save(): void {
    const data: Stored = { kind: this.kind, n: this.n, coeffs: this.coeffs.map((r) => r.map(V.serialize)) };
    this.host.state.modeData.equation = data;
    this.host.persist();
  }

  private start(kind: Kind, n: number): void {
    this.kind = kind;
    this.n = n;
    this.coeffs = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => V.ZERO));
    this.row = 0;
    this.col = 0;
    this.phase = 'editor';
    this.save();
  }

  private context() {
    return evalContext(this.host.state);
  }

  // --- Tasten ---

  handle(ev: KeyEvent, host: Host): boolean {
    const a = ev.action;
    if (this.stoPending) {
      this.stoPending = false;
      const name = STO_KEYS[ev.key];
      const sol = this.solutions[this.si];
      if (name && sol?.value && !sol.im) {
        host.state.vars[name] = V.serialize(sol.value);
        host.persist();
      }
      return true;
    }
    if (a === 'sys:optn' && this.phase !== 'type' && this.phase !== 'count') {
      host.push(
        new ListMenu([
          { label: 'Gleichungssyst.', run: (h) => (closeMenus(h), (this.kind = 'system'), (this.phase = 'count')) },
          { label: 'Polynom-Gleich.', run: (h) => (closeMenus(h), (this.kind = 'poly'), (this.phase = 'count')) },
        ]),
      );
      return true;
    }
    switch (this.phase) {
      case 'type':
        if (ev.key === 'D1') (this.kind = 'system'), (this.phase = 'count');
        else if (ev.key === 'D2') (this.kind = 'poly'), (this.phase = 'count');
        return true;
      case 'count': {
        const d = DIGITS.indexOf(ev.key);
        if (d >= 2 && d <= 4) this.start(this.kind, d);
        else if (a === 'sys:ac' && this.coeffs.length > 0) this.phase = 'editor';
        return true;
      }
      case 'editor':
        return this.handleEditor(a);
      case 'solution':
        return this.handleSolution(a);
      case 'message':
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
          // AC setzt alle Koeffizienten auf 0
          this.coeffs = this.coeffs.map((r) => r.map(() => V.ZERO));
          this.save();
        }
        return true;
      case 'cmd:exe':
        if (this.input.editing) {
          if (this.commit()) this.advance();
        } else this.solve();
        return true;
      case 'nav:up':
      case 'nav:down':
      case 'nav:left':
      case 'nav:right':
        if (this.input.editing && (a === 'nav:left' || a === 'nav:right')) return this.input.handle(a);
        if (!this.commit()) return true;
        this.move(a);
        return true;
    }
    this.input.handle(a);
    return true;
  }

  private commit(): boolean {
    try {
      const v = this.input.commit(this.context());
      if (v) {
        this.coeffs[this.row][this.col] = v;
        this.save();
      }
      return true;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
      return false;
    }
  }

  private advance(): void {
    if (this.col < this.cols - 1) this.col++;
    else if (this.row < this.rows - 1) (this.row++, (this.col = 0));
  }

  private move(a: string): void {
    if (a === 'nav:right') this.advance();
    else if (a === 'nav:left') {
      if (this.col > 0) this.col--;
      else if (this.row > 0) (this.row--, (this.col = this.cols - 1));
    } else if (a === 'nav:down') this.row = Math.min(this.rows - 1, this.row + 1);
    else this.row = Math.max(0, this.row - 1);
  }

  private handleSolution(a: string | undefined): boolean {
    switch (a) {
      case 'nav:down':
        if (this.si < this.solutions.length - 1) this.show(this.si + 1);
        return true;
      case 'nav:up':
        if (this.si > 0) this.show(this.si - 1);
        return true;
      case 'cmd:exe':
        if (this.si < this.solutions.length - 1) this.show(this.si + 1);
        else this.phase = 'editor';
        return true;
      case 'sys:ac':
        this.phase = 'editor';
        return true;
      case 'cmd:sd':
        this.showExact = !this.showExact;
        return true;
      case 'cmd:sto':
        this.stoPending = true;
        return true;
    }
    return true;
  }

  private show(i: number): void {
    this.si = i;
    this.showExact = this.host.state.settings.io === 'mathMath';
  }

  // --- Lösen ---

  private solve(): void {
    try {
      this.solutions = this.kind === 'system' ? this.solveSystem() : this.solvePoly();
      if (this.solutions.length === 0) return;
      this.show(0);
      this.phase = 'solution';
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = e;
      this.phase = 'error';
    }
  }

  private solveSystem(): Solution[] {
    const res = solveLinear(this.coeffs);
    if (res.kind !== 'unique') {
      this.message = res.kind === 'infinite' ? ['Unendlich viele', 'Lösungen'] : ['Keine Lösung'];
      this.phase = 'message';
      return [];
    }
    return res.x.map((value, i) => ({ label: `${UNKNOWNS[i]}=`, value }));
  }

  private solvePoly(): Solution[] {
    const c = this.coeffs[0];
    if (V.isZero(c[0])) throw new CalcError('math');
    const roots = this.n === 2 ? quadraticRoots(c) : numericRoots(c);
    const complexAllowed = this.host.state.settings.eqComplexRoots;
    const shown = complexAllowed ? roots : roots.filter((r) => !r.im);
    if (shown.length === 0) {
      this.message = ['Keine reell. Lösg'];
      this.phase = 'message';
      return [];
    }
    const out: Solution[] = shown.map((r, i) => ({ label: shown.length === 1 ? '𝑥=' : `𝑥${SUB[i]}=`, value: r.re, im: r.im }));
    if (this.n === 2) {
      // Scheitelpunkt von y = ax² + bx + c
      const [a, b, cc] = c;
      const xv = V.div(V.neg(b), V.mul(V.int(2), a));
      const yv = V.sub(cc, V.div(V.mul(b, b), V.mul(V.int(4), a)));
      const kind = V.sign(a) > 0 ? 'Minimum' : 'Maximum';
      out.push({ label: `𝑥-Wert ${kind}=`, value: xv }, { label: `𝑦-Wert ${kind}=`, value: yv });
    }
    return out;
  }

  // --- Anzeige ---

  render(): Scene {
    switch (this.phase) {
      case 'type':
        return lines(['1:Gleichungssyst.', '2:Polynom-Gleich.']);
      case 'count':
        return this.kind === 'system' ? lines(['Gleichungssyst.', 'Unbekannte?', '', '2~4 wählen']) : lines(['Polynom-Gleich.', 'Grad?', '', '2~4 wählen']);
      case 'message':
        return lines(this.message);
      case 'error':
        return errorScene(this.error!.message);
      case 'solution':
        return this.renderSolution();
      case 'editor':
        return this.renderEditor();
    }
  }

  private renderEditor(): Scene {
    const ops: DrawOp[] = [];
    const cellW = Math.floor((LCD_WIDTH - 6) / this.cols);
    let y0 = 1;
    if (this.kind === 'poly') {
      ops.push({ kind: 'text', x: 0, y: 0, text: POLY_HEADER[this.n], font: 'S' });
      y0 = 14;
    } else {
      // Geschweifte Klammer links vor den Gleichungen
      ops.push({ kind: 'line', x1: 2, y1: 1, x2: 2, y2: this.rows * 10 });
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = 5 + c * cellW;
        const y = y0 + r * 10;
        const label = this.kind === 'system' ? (c < this.n ? UNKNOWNS[c] : '') : '';
        const text = clip(shortValue(this.coeffs[r][c]), cellW - 8);
        const active = r === this.row && c === this.col;
        if (active) ops.push({ kind: 'rect', x: x - 1, y: y - 1, w: cellW - 6, h: 9, fill: true });
        ops.push({ kind: 'text', x: x + cellW - 8, y, text, font: 'S', align: 'right', invert: active });
        if (label) ops.push({ kind: 'text', x: x + cellW - 6, y, text: label, font: 'S' });
      }
    }
    const value = this.coeffs[this.row]?.[this.col] ?? V.ZERO;
    let cursor: Scene['cursor'] = null;
    if (this.input.editing) {
      const lay = this.input.laid();
      ops.push({ kind: 'rect', x: 0, y: 48, w: LCD_WIDTH, h: 16, fill: true, erase: true });
      ops.push(...translate(lay, 0, 48));
      if (lay.cursor) cursor = { x: lay.cursor.x, y: lay.cursor.y + 48, h: lay.cursor.h };
    } else {
      ops.push({ kind: 'text', x: LCD_WIDTH - 1, y: 48, text: shortValue(value), font: 'L', align: 'right' });
    }
    return { ops, cursor };
  }

  private renderSolution(): Scene {
    const sol = this.solutions[this.si];
    const ops: DrawOp[] = [{ kind: 'text', x: 0, y: 0, text: sol.label, font: 'L' }];
    const form = this.formOf(sol);
    const lay = layoutResult(form, 'math');
    ops.push(...translate(lay, Math.max(0, LCD_WIDTH - lay.w), LCD_HEIGHT - lay.h));
    return { ops, status: { up: this.si > 0, down: this.si < this.solutions.length - 1 } };
  }

  private formOf(sol: Solution): ResultForm {
    const s = this.host.state.settings;
    const part = (v: Value): ResultForm => (this.showExact && exactForm(v, s)) || decimalForm(v, s);
    if (!sol.im) return part(sol.value ?? V.ZERO);
    const re = sol.value && !V.isZero(sol.value) ? part(sol.value) : undefined;
    if (s.complex === 'polar') {
      const x = V.toNumber(sol.value ?? V.ZERO);
      const y = V.toNumber(sol.im);
      const unit = s.angle === 'D' ? 180 / Math.PI : s.angle === 'G' ? 200 / Math.PI : 1;
      return { kind: 'polar', r: decimalForm(V.fl(Math.hypot(x, y)), s), theta: decimalForm(V.fl(Math.atan2(y, x) * unit), s) };
    }
    return { kind: 'complex', re, im: part(V.abs(sol.im)), imNegative: V.sign(sol.im) < 0 };
  }

  /** Für Tests. */
  get state(): { phase: Phase; label?: string; result?: ResultForm; message?: string[] } {
    const sol = this.solutions[this.si];
    return {
      phase: this.phase,
      label: this.phase === 'solution' ? sol.label : undefined,
      result: this.phase === 'solution' ? this.formOf(sol) : undefined,
      message: this.phase === 'message' ? this.message : undefined,
    };
  }
}

function lines(texts: string[]): Scene {
  return { ops: texts.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
}

function clip(text: string, maxPx: number): string {
  // kleine Schrift ≈ 6 px je Zeichen
  const max = Math.max(1, Math.floor(maxPx / 6));
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/** Quadratische Gleichung exakt über die Diskriminante (x₁ mit +√D wie am Original). */
function quadraticRoots([a, b, c]: Value[]): { re: Value; im?: Value }[] {
  const d = V.sub(V.mul(b, b), V.mul(V.int(4), V.mul(a, c)));
  const twoA = V.mul(V.int(2), a);
  const mid = V.div(V.neg(b), twoA);
  if (V.isZero(d)) return [{ re: mid }];
  if (V.sign(d) > 0) {
    const w = V.div(V.sqrt(d), twoA);
    return [{ re: V.add(mid, w) }, { re: V.sub(mid, w) }];
  }
  const w = V.abs(V.div(V.sqrt(V.neg(d)), twoA));
  return [{ re: mid, im: w }, { re: mid, im: V.neg(w) }];
}

/** Grad 3/4 numerisch; einfache Brüche werden in der Anzeige erkannt. Reelle Lösungen absteigend. */
function numericRoots(coeffs: Value[]): { re: Value; im?: Value }[] {
  const roots = polyRoots(coeffs.map(V.toNumber));
  const num = (x: number): Value => {
    const q = Number.isInteger(x) ? Rational.of(BigInt(x)) : undefined;
    return q ? V.rat(q) : ({ ...V.fl(x), numeric: true } as Value);
  };
  const real = roots.filter((r) => r.im === 0).sort((p, q) => q.re - p.re);
  const complex = roots.filter((r) => r.im !== 0);
  return [...real.map((r) => ({ re: num(r.re) })), ...complex.map((r) => ({ re: num(r.re), im: num(r.im) }))];
}
