// Ersatz für den QR-Code (SHIFT OPTN) in der Statistik: Streudiagramm samt Regressionskurve
// bzw. Balkendiagramm der Häufigkeiten bei einer Variablen.

import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { Host, KeyEvent, Screen } from '../screen';
import type { StatCalc, StatSet } from './data';

// Zeichenfläche (Platz links für die y-Beschriftung, unten für die x-Beschriftung)
export const PLOT_LEFT = 32;
export const PLOT_RIGHT = LCD_WIDTH - 4;
export const PLOT_TOP = 3;
export const PLOT_BOTTOM = LCD_HEIGHT - 11;

/** Kurzer Zahlentext für die Bereichsangaben (höchstens 5 Zeichen). */
export function axisText(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  let t = a >= 1e5 || a < 1e-3 ? v.toExponential(0).replace('e+', 'E') : String(Number(v.toPrecision(3)));
  if (t.length > 5) t = String(Number(v.toPrecision(2)));
  return t.replace('.', ',');
}

export class StatPlot implements Screen {
  private readonly ops: DrawOp[] = [];
  /** Pixelmittelpunkte der Datenpunkte (für Tests). */
  readonly points: { x: number; y: number }[] = [];

  constructor(set: StatSet, calc: StatCalc) {
    if (calc.paired) this.scatter(set, calc);
    else this.bars(set);
  }

  private label(t: string, x: number, y: number, right = false): void {
    const w = t.length * 6;
    this.ops.push({ kind: 'rect', x: right ? x - w : x, y, w, h: 8, fill: false, erase: true });
    this.ops.push({ kind: 'text', x, y, text: t, font: 'S', align: right ? 'right' : 'left' });
  }

  private axes(xmin: number, xmax: number, ymin: number, ymax: number, px: (x: number) => number, py: (y: number) => number): void {
    const ay = ymin <= 0 && ymax >= 0 ? Math.round(py(0)) : ymin > 0 ? PLOT_BOTTOM : PLOT_TOP;
    const ax = xmin <= 0 && xmax >= 0 ? Math.round(px(0)) : xmin > 0 ? PLOT_LEFT : PLOT_RIGHT;
    this.ops.push({ kind: 'line', x1: PLOT_LEFT, y1: ay, x2: PLOT_RIGHT, y2: ay });
    this.ops.push({ kind: 'line', x1: ax, y1: PLOT_TOP, x2: ax, y2: PLOT_BOTTOM });
  }

  private scatter(set: StatSet, calc: StatCalc): void {
    let xmin = Math.min(...set.x);
    let xmax = Math.max(...set.x);
    let ymin = Math.min(...set.y);
    let ymax = Math.max(...set.y);
    if (xmin === xmax) (xmin -= 1), (xmax += 1);
    if (ymin === ymax) (ymin -= 1), (ymax += 1);
    const dx = (xmax - xmin) * 0.05;
    const dy = (ymax - ymin) * 0.1;
    const x0 = xmin;
    const y0 = ymin;
    xmin -= dx;
    xmax += dx;
    ymin -= dy;
    ymax += dy;
    const px = (x: number) => PLOT_LEFT + ((x - xmin) / (xmax - xmin)) * (PLOT_RIGHT - PLOT_LEFT);
    const py = (y: number) => PLOT_BOTTOM - ((y - ymin) / (ymax - ymin)) * (PLOT_BOTTOM - PLOT_TOP);
    this.axes(xmin, xmax, ymin, ymax, px, py);

    // Regressionskurve (ohne Punkte außerhalb der Fläche)
    let prev: { x: number; y: number } | undefined;
    for (let i = PLOT_LEFT; i <= PLOT_RIGHT; i++) {
      let y: number;
      try {
        y = calc.estimateY(xmin + ((i - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * (xmax - xmin));
      } catch {
        prev = undefined;
        continue;
      }
      const p = { x: i, y: Math.round(py(y)) };
      if (!Number.isFinite(y) || p.y < PLOT_TOP || p.y > PLOT_BOTTOM) {
        prev = undefined;
        continue;
      }
      if (prev) this.ops.push({ kind: 'line', x1: prev.x, y1: prev.y, x2: p.x, y2: p.y });
      prev = p;
    }

    // Datenpunkte als 2×2-Quadrate
    set.x.forEach((x, i) => {
      const p = { x: Math.round(px(x)), y: Math.round(py(set.y[i])) };
      this.points.push(p);
      this.ops.push({ kind: 'rect', x: p.x - 1, y: p.y - 1, w: 2, h: 2, fill: true });
    });

    this.label(axisText(ymax - dy), 0, 0);
    this.label(axisText(y0), 0, PLOT_BOTTOM - 7);
    this.label(axisText(x0), PLOT_LEFT, LCD_HEIGHT - 8);
    this.label(axisText(xmax - dx), LCD_WIDTH, LCD_HEIGHT - 8, true);
  }

  /** Balken je verschiedenem Wert, Höhe = Häufigkeit. */
  private bars(set: StatSet): void {
    const freq = new Map<number, number>();
    set.x.forEach((x, i) => freq.set(x, (freq.get(x) ?? 0) + set.f[i]));
    const xs = [...freq.keys()].sort((a, b) => a - b);
    let xmin = xs[0];
    let xmax = xs[xs.length - 1];
    if (xmin === xmax) (xmin -= 1), (xmax += 1);
    const fmax = Math.max(...freq.values());
    const dx = (xmax - xmin) * 0.05;
    const px = (x: number) => PLOT_LEFT + ((x - (xmin - dx)) / (xmax - xmin + 2 * dx)) * (PLOT_RIGHT - PLOT_LEFT);
    const h = (f: number) => Math.max(1, Math.round((f / fmax) * (PLOT_BOTTOM - PLOT_TOP - 2)));
    this.ops.push({ kind: 'line', x1: PLOT_LEFT, y1: PLOT_BOTTOM, x2: PLOT_RIGHT, y2: PLOT_BOTTOM });
    this.ops.push({ kind: 'line', x1: PLOT_LEFT, y1: PLOT_TOP, x2: PLOT_LEFT, y2: PLOT_BOTTOM });
    for (const x of xs) {
      const bh = h(freq.get(x)!);
      const bx = Math.round(px(x));
      this.points.push({ x: bx, y: PLOT_BOTTOM - bh });
      this.ops.push({ kind: 'rect', x: bx - 1, y: PLOT_BOTTOM - bh, w: 3, h: bh, fill: true });
    }
    this.label(axisText(fmax), 0, 0);
    this.label('0', 0, PLOT_BOTTOM - 7);
    this.label(axisText(xs[0]), PLOT_LEFT, LCD_HEIGHT - 8);
    this.label(axisText(xs[xs.length - 1]), LCD_WIDTH, LCD_HEIGHT - 8, true);
  }

  handle(ev: KeyEvent, host: Host): boolean {
    if (ev.action === 'sys:ac' || ev.action === 'sys:qr') host.pop();
    return true;
  }

  render(): Scene {
    return { ops: this.ops };
  }
}
