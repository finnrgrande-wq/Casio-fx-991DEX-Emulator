// Nummeriertes Menü (OPTN, SETUP, CONST …): 4 Zeilen je Seite, Auswahl per Zifferntaste,
// ▲▼ blättern, ◀ zurück ins übergeordnete Menü, AC schließt.

import type { DrawOp, Scene } from '../display/scene';
import type { Host, KeyEvent, Screen } from './screen';

export interface MenuItem {
  label: string;
  /** Untermenü oder Aktion; die Aktion entscheidet selbst, ob das Menü geschlossen wird. */
  sub?: MenuItem[];
  run?: (host: Host) => void;
}

const LINES = 4;
const DIGIT_KEYS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

export class ListMenu implements Screen {
  private page = 0;

  constructor(
    readonly items: MenuItem[],
    /** Untermenüs zeigen links oben einen Pfeil und kehren mit ◀ zurück. */
    private readonly isSubmenu = false,
    /** Optionaler fester Titel in der ersten Zeile (z. B. „Zurücksetzen?“). */
    private readonly title?: string,
  ) {}

  private get perPage(): number {
    return this.title ? LINES - 1 : LINES;
  }

  /** Lange Listen (mehr als 9 Einträge) werden mit Auswahlbalken bedient. */
  private get scrolling(): boolean {
    return this.items.length > DIGIT_KEYS.length;
  }

  private cursor = 0;

  private get pages(): number {
    return Math.max(1, Math.ceil(this.items.length / this.perPage));
  }

  handle(ev: KeyEvent, host: Host): boolean {
    const digit = ev.mod === 'none' ? DIGIT_KEYS.indexOf(ev.key) : -1;
    if (digit >= 0 && digit < this.items.length) {
      this.select(this.items[digit], host);
      return true;
    }
    if (this.scrolling) {
      const n = this.items.length;
      if (ev.action === 'nav:down' || ev.action === 'nav:up') {
        this.cursor = (this.cursor + (ev.action === 'nav:down' ? 1 : n - 1)) % n;
        this.page = Math.floor(this.cursor / this.perPage);
        return true;
      }
      if (ev.action === 'cmd:exe') {
        this.select(this.items[this.cursor], host);
        return true;
      }
    }
    switch (ev.action) {
      case 'nav:down':
        this.page = (this.page + 1) % this.pages;
        return true;
      case 'nav:up':
        this.page = (this.page - 1 + this.pages) % this.pages;
        return true;
      case 'nav:left':
        if (this.isSubmenu) host.pop();
        return true;
      case 'sys:ac':
        host.pop();
        while (host.top instanceof ListMenu) host.pop();
        return true;
    }
    return true; // andere Tasten sind im Menü wirkungslos
  }

  private select(item: MenuItem, host: Host): void {
    if (item.sub) host.push(new ListMenu(item.sub, true));
    else item.run?.(host);
  }

  render(): Scene {
    const ops: DrawOp[] = [];
    let y = 0;
    if (this.title) {
      ops.push({ kind: 'text', x: 0, y, text: this.title, font: 'L' });
      y += 16;
    }
    const start = this.page * this.perPage;
    this.items.slice(start, start + this.perPage).forEach((item, k) => {
      const selected = this.scrolling && start + k === this.cursor;
      ops.push({ kind: 'text', x: 0, y: y + k * 16, text: `${start + k + 1}:${item.label}`, font: 'L', invert: selected });
    });
    if (this.pages > 1) {
      // Bildlaufleiste am rechten Rand
      const h = Math.max(6, Math.floor(64 / this.pages));
      ops.push({ kind: 'rect', x: 189, y: this.page * h, w: 3, h, fill: true });
    }
    return { ops };
  }
}
