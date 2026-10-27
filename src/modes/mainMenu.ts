// Hauptmenü (MENU): 13 Anwendungen als Icons, 4 pro Reihe, 2 Reihen sichtbar.

import { MENU_ICONS, MENU_ICON_H, MENU_ICON_W } from '../display/icons/menuIcons';
import type { DrawOp, Scene } from '../display/scene';
import { MODES } from './registry';
import type { Host, KeyEvent, Screen } from './screen';

const COLS = 4;
const ROWS = Math.ceil(MODES.length / COLS);
const CELL_W = 48;
const ROW_H = 23;
const VISIBLE_ROWS = 2;

export class MainMenu implements Screen {
  private index: number;
  private top = 0;

  constructor(host: Host) {
    this.index = Math.max(0, MODES.findIndex((m) => m.id === host.mode));
    this.scrollIntoView();
  }

  get selected(): number {
    return this.index;
  }

  handle(ev: KeyEvent, host: Host): boolean {
    if (ev.mod === 'none') {
      const direct = MODES.findIndex((m) => m.key === ev.key);
      if (direct >= 0) {
        host.enterMode(MODES[direct].id);
        return true;
      }
    }
    switch (ev.action) {
      case 'nav:right': this.move((this.index + 1) % MODES.length); return true;
      case 'nav:left': this.move((this.index - 1 + MODES.length) % MODES.length); return true;
      case 'nav:down': this.move(this.vertical(+1)); return true;
      case 'nav:up': this.move(this.vertical(-1)); return true;
      case 'cmd:exe': host.enterMode(MODES[this.index].id); return true;
      case 'sys:ac': host.pop(); return true;
    }
    return false;
  }

  private vertical(dir: 1 | -1): number {
    const col = this.index % COLS;
    let row = Math.floor(this.index / COLS) + dir;
    if (row < 0) row = ROWS - 1;
    if (row >= ROWS) row = 0;
    let i = row * COLS + col;
    // Letzte Reihe ist kürzer: auf die vorletzte Reihe ausweichen.
    if (i >= MODES.length) i = dir > 0 ? col : (row - 1) * COLS + col;
    return i;
  }

  private move(i: number): void {
    this.index = i;
    this.scrollIntoView();
  }

  private scrollIntoView(): void {
    const row = Math.floor(this.index / COLS);
    if (row < this.top) this.top = row;
    if (row >= this.top + VISIBLE_ROWS) this.top = row - VISIBLE_ROWS + 1;
  }

  render(): Scene {
    const ops: DrawOp[] = [];
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      const row = this.top + r;
      for (let c = 0; c < COLS; c++) {
        const i = row * COLS + c;
        if (i >= MODES.length) continue;
        const x = c * CELL_W;
        const y = r * ROW_H;
        const mode = MODES[i];
        const selected = i === this.index;
        if (selected) ops.push({ kind: 'rect', x, y, w: MENU_ICON_W + 2, h: MENU_ICON_H + 3, fill: true });
        ops.push({ kind: 'bitmap', x: x + 1, y: y + 1, bitmap: MENU_ICONS[mode.id], invert: selected });
        // Plakette mit Nummer/Buchstabe; beim gewählten Eintrag ohne Kasten
        if (!selected) ops.push({ kind: 'rect', x: x + MENU_ICON_W + 3, y: y + 11, w: 7, h: 9, fill: true });
        ops.push({ kind: 'text', x: x + MENU_ICON_W + 4, y: y + 12, text: mode.badge, font: 'S', invert: !selected });
        if (!selected) {
          ops.push({ kind: 'line', x1: x, y1: y + 20, x2: x + CELL_W - 5, y2: y + 20 });
          ops.push({ kind: 'line', x1: x + CELL_W - 5, y1: y + 9, x2: x + CELL_W - 5, y2: y + 20 });
        }
      }
    }
    const mode = MODES[this.index];
    ops.push({ kind: 'text', x: 0, y: 48, text: `${mode.badge}:${mode.title}`, font: 'L' });
    return {
      ops,
      status: { up: this.top > 0, down: this.top + VISIBLE_ROWS < ROWS },
    };
  }
}
