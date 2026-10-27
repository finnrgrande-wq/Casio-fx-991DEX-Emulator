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

export interface ListMenuOptions {
  /** Untermenüs kehren mit ◀ ins übergeordnete Menü zurück. */
  submenu?: boolean;
  /** Fester Titel in der ersten Zeile (z. B. „Zurücksetzen?“). */
  title?: string;
  /** Seitenweise nummeriert (SETUP): Ziffern 1–4 wählen auf der aktuellen Seite. */
  paged?: boolean;
}

const LINES = 4;
const DIGIT_KEYS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

export class ListMenu implements Screen {
  private page = 0;
  private cursor = 0;

  constructor(
    readonly items: MenuItem[],
    private readonly opts: ListMenuOptions = {},
  ) {}

  private get perPage(): number {
    return this.opts.title ? LINES - 1 : LINES;
  }

  private get pages(): number {
    return Math.max(1, Math.ceil(this.items.length / this.perPage));
  }

  /** Lange Listen (mehr als 9 Einträge, nicht seitenweise) werden mit Auswahlbalken bedient. */
  private get scrolling(): boolean {
    return !this.opts.paged && this.items.length > DIGIT_KEYS.length;
  }

  handle(ev: KeyEvent, host: Host): boolean {
    const digit = ev.mod === 'none' ? DIGIT_KEYS.indexOf(ev.key) : -1;
    if (digit >= 0) {
      const i = this.opts.paged ? this.page * this.perPage + digit : digit;
      const onPage = !this.opts.paged || digit < this.perPage;
      if (onPage && i < this.items.length) this.select(this.items[i], host);
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
        if (this.opts.submenu) host.pop();
        return true;
      case 'sys:ac':
        closeMenus(host);
        return true;
    }
    return true; // andere Tasten sind im Menü wirkungslos
  }

  private select(item: MenuItem, host: Host): void {
    if (item.sub) host.push(new ListMenu(item.sub, { submenu: true }));
    else item.run?.(host);
  }

  render(): Scene {
    const ops: DrawOp[] = [];
    let y = 0;
    if (this.opts.title) {
      ops.push({ kind: 'text', x: 0, y, text: this.opts.title, font: 'L' });
      y += 16;
    }
    const start = this.page * this.perPage;
    this.items.slice(start, start + this.perPage).forEach((item, k) => {
      const selected = this.scrolling && start + k === this.cursor;
      const n = this.opts.paged ? k + 1 : start + k + 1;
      ops.push({ kind: 'text', x: 0, y: y + k * 16, text: `${n}:${item.label}`, font: 'L', invert: selected });
    });
    if (this.pages > 1) {
      // Bildlaufleiste am rechten Rand
      const h = Math.max(6, Math.floor(64 / this.pages));
      ops.push({ kind: 'rect', x: 189, y: this.page * h, w: 3, h, fill: true });
    }
    return { ops };
  }
}

/** Bildschirme, die wie Menüs mit AC geschlossen werden (Dialoge). */
export interface Dialog extends Screen {
  readonly isDialog: true;
}

/** Schließt alle offenen Menüs und Dialoge über dem Anwendungsbildschirm. */
export function closeMenus(host: Host): void {
  while (host.top instanceof ListMenu || (host.top as Partial<Dialog>).isDialog) host.pop();
}
