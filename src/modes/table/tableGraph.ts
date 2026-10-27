// Grafik zur Wertetabelle (SHIFT OPTN): f durchgezogen, g gepunktet, mit Achsen über dem x-Bereich der Tabelle.

import type { DrawOp, Scene } from '../../display/scene';
import { LCD_HEIGHT, LCD_WIDTH } from '../../display/types';
import type { Host, KeyEvent, Screen } from '../screen';
import { cellText } from './format';

export interface Curve {
  fn: (x: number) => number;
  /** Tabellenwerte (für die Skalierung der y-Achse). */
  ys: number[];
  dotted: boolean;
}

export interface GraphSpec {
  xs: number[];
  curves: Curve[];
}

const LEFT = 2;
const RIGHT = LCD_WIDTH - 3;
const TOP = 2;
const BOTTOM = LCD_HEIGHT - 3;
/** Sprünge größer als dies (in Punkten) werden nicht verbunden (Polstellen). */
const MAX_JUMP = 128;

export class GraphScreen implements Screen {
  private readonly ops: DrawOp[] = [];

  constructor(spec: GraphSpec) {
    let xmin = Math.min(...spec.xs);
    let xmax = Math.max(...spec.xs);
    if (xmin === xmax) {
      xmin -= 1;
      xmax += 1;
    }
    const ys = spec.curves.flatMap((c) => c.ys).filter(Number.isFinite);
    let ymin = ys.length > 0 ? Math.min(...ys) : -1;
    let ymax = ys.length > 0 ? Math.max(...ys) : 1;
    if (ymin === ymax) {
      ymin -= 1;
      ymax += 1;
    }
    const pad = (ymax - ymin) * 0.1;
    ymin -= pad;
    ymax += pad;

    const px = (x: number) => LEFT + ((x - xmin) / (xmax - xmin)) * (RIGHT - LEFT);
    const py = (y: number) => BOTTOM - ((y - ymin) / (ymax - ymin)) * (BOTTOM - TOP);
    const ops = this.ops;

    // Achsen (am Rand, wenn 0 außerhalb des Bereichs liegt)
    const axisY = ymin <= 0 && ymax >= 0 ? Math.round(py(0)) : ymin > 0 ? BOTTOM : TOP;
    const axisX = xmin <= 0 && xmax >= 0 ? Math.round(px(0)) : xmin > 0 ? LEFT : RIGHT;
    ops.push({ kind: 'line', x1: LEFT, y1: axisY, x2: RIGHT, y2: axisY });
    ops.push({ kind: 'line', x1: axisX, y1: TOP, x2: axisX, y2: BOTTOM });
    if (spec.xs.length <= 45) {
      for (const x of spec.xs) {
        const t = Math.round(px(x));
        ops.push({ kind: 'line', x1: t, y1: axisY - 1, x2: t, y2: axisY + 1 });
      }
    }

    for (const c of spec.curves) {
      let prev: { x: number; y: number } | undefined;
      for (let i = LEFT; i <= RIGHT; i++) {
        const y = c.fn(xmin + ((i - LEFT) / (RIGHT - LEFT)) * (xmax - xmin));
        if (!Number.isFinite(y)) {
          prev = undefined;
          continue;
        }
        const p = { x: i, y: Math.max(-1000, Math.min(1000, Math.round(py(y)))) };
        if (c.dotted) {
          if (i % 2 === 0 && p.y >= 0 && p.y < LCD_HEIGHT) ops.push({ kind: 'rect', x: p.x, y: p.y, w: 1, h: 1, fill: true });
        } else if (prev && Math.abs(p.y - prev.y) <= MAX_JUMP) {
          ops.push({ kind: 'line', x1: prev.x, y1: prev.y, x2: p.x, y2: p.y });
        }
        prev = p;
      }
    }

    // Bereichsangaben in den Ecken
    const label = (t: string, x: number, y: number, right = false) => {
      const w = t.length * 6;
      ops.push({ kind: 'rect', x: right ? x - w : x, y, w, h: 8, fill: false, erase: true });
      ops.push({ kind: 'text', x, y, text: t, font: 'S', align: right ? 'right' : 'left' });
    };
    label(cellText(xmin), 0, LCD_HEIGHT - 8);
    label(cellText(xmax), LCD_WIDTH, LCD_HEIGHT - 8, true);
    label(cellText(ymax - pad), 0, 0);
    label(cellText(ymin + pad), 0, LCD_HEIGHT - 16);
  }

  handle(ev: KeyEvent, host: Host): boolean {
    if (ev.action === 'sys:ac' || ev.action === 'sys:qr') host.pop();
    return true;
  }

  render(): Scene {
    return { ops: this.ops };
  }
}
