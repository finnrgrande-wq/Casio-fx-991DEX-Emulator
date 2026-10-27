// SETUP (SHIFT MENU) mit den vier Seiten des Originals und RESET (SHIFT 9).

import type { DrawOp, Scene } from '../display/scene';
import { DEFAULT_SETTINGS, defaultState, type Settings } from '../calculator/state';
import { ListMenu, closeMenus, type Dialog, type MenuItem } from './listMenu';
import type { Host, KeyEvent } from './screen';

const DIGITS = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

/** Setzt eine Einstellung, schließt das SETUP und meldet die Änderung. */
function apply(host: Host, change: (s: Settings) => void): void {
  const before = host.state.settings.io;
  change(host.state.settings);
  closeMenus(host);
  // Eine Änderung von Eingabe/Ausgabe löscht den Ablaufspeicher (wie am Original)
  if (host.state.settings.io !== before) host.resetMode();
  host.persist();
}

const choice = (label: string, change: (s: Settings) => void): MenuItem => ({ label, run: (h) => apply(h, change) });
const onOff = (set: (s: Settings, on: boolean) => void): MenuItem[] => [
  choice('Ein', (s) => set(s, true)),
  choice('Aus', (s) => set(s, false)),
];

export function setupMenu(): ListMenu {
  const items: MenuItem[] = [
    {
      label: 'Eingabe/Ausgabe',
      sub: [
        choice('Math --> Math', (s) => (s.io = 'mathMath')),
        choice('Math --> Dezim.', (s) => (s.io = 'mathDec')),
        choice('Lin. --> Linear', (s) => (s.io = 'linLin')),
        choice('Lin. --> Dezim.', (s) => (s.io = 'linDec')),
      ],
    },
    {
      label: 'Winkeleinheit',
      sub: [
        choice('Gradmaß (D)', (s) => (s.angle = 'D')),
        choice('Bogenmaß (R)', (s) => (s.angle = 'R')),
        choice('Gon (G)', (s) => (s.angle = 'G')),
      ],
    },
    {
      label: 'Zahlenformat',
      sub: [
        { label: 'Fix', run: (h) => h.push(new DigitPrompt('Fix 0~9?', 0, 9, (n) => apply(h, (s) => (s.format = { kind: 'fix', n })))) },
        { label: 'Sci', run: (h) => h.push(new DigitPrompt('Sci 0~9?', 0, 9, (n) => apply(h, (s) => (s.format = { kind: 'sci', n })))) },
        {
          label: 'Norm',
          run: (h) => h.push(new DigitPrompt('Norm 1~2?', 1, 2, (n) => apply(h, (s) => (s.format = { kind: 'norm', n: n as 1 | 2 })))),
        },
      ],
    },
    { label: 'Dezimalpräfixe', sub: onOff((s, on) => (s.prefixes = on)) },
    {
      label: 'Bruchergebnis',
      sub: [
        choice('ab/c', (s) => (s.fraction = 'mixed')),
        choice('d/c', (s) => (s.fraction = 'improper')),
      ],
    },
    {
      label: 'Komplexe Zahlen',
      sub: [
        choice('a+bi', (s) => (s.complex = 'rect')),
        choice('r∠θ', (s) => (s.complex = 'polar')),
      ],
    },
    { label: 'Statistik', sub: onOff((s, on) => (s.statFreq = on)) },
    {
      label: 'Tabellenkalk.',
      sub: [
        { label: 'Autom. Berechn.', sub: onOff((s, on) => (s.sheetAutoCalc = on)) },
        {
          label: 'Zelle anzeigen',
          sub: [
            choice('Formel', (s) => (s.sheetShowFormula = true)),
            choice('Wert', (s) => (s.sheetShowFormula = false)),
          ],
        },
      ],
    },
    { label: 'Gleichung/Funkt', sub: onOff((s, on) => (s.eqComplexRoots = on)) },
    {
      label: 'Tabellen',
      sub: [
        choice('f(𝑥)', (s) => (s.tableFunctions = 'f')),
        choice('f(𝑥),g(𝑥)', (s) => (s.tableFunctions = 'fg')),
      ],
    },
    { label: 'Period. Darst.', sub: onOff((s, on) => (s.recurring = on)) },
    { label: '1000er-Trennung', sub: onOff((s, on) => (s.thousands = on)) },
    {
      label: 'Mehrzeilengröße',
      sub: [
        choice('Normale Schrift', (s) => (s.smallFont = false)),
        choice('Kleine Schrift', (s) => (s.smallFont = true)),
      ],
    },
    {
      label: 'QR-Code',
      sub: [
        choice('Version 3', (s) => (s.qrVersion = 3)),
        choice('Version 11', (s) => (s.qrVersion = 11)),
      ],
    },
    {
      label: 'Automat Aus',
      sub: [
        choice('10 Min', (s) => (s.autoOff = 10)),
        choice('60 Min', (s) => (s.autoOff = 60)),
      ],
    },
    { label: 'Kontrast', run: (h) => h.push(new ContrastDialog()) },
  ];
  return new ListMenu(items, { paged: true });
}

/** Abfrage einer Ziffer (Fix 0~9?, Sci 0~9?, Norm 1~2?). */
export class DigitPrompt implements Dialog {
  readonly isDialog = true;

  constructor(
    private readonly question: string,
    private readonly min: number,
    private readonly max: number,
    private readonly onPick: (n: number) => void,
  ) {}

  handle(ev: KeyEvent, host: Host): boolean {
    const d = ev.mod === 'none' ? DIGITS.indexOf(ev.key) : -1;
    if (d >= this.min && d <= this.max) this.onPick(d);
    else if (ev.action === 'sys:ac') closeMenus(host);
    else if (ev.action === 'nav:left') host.pop();
    return true;
  }

  render(): Scene {
    return { ops: [{ kind: 'text', x: 0, y: 0, text: this.question, font: 'L' }] };
  }
}

/** Kontrast (1–9): ◀ heller, ▶ dunkler; AC oder = schließt. */
export class ContrastDialog implements Dialog {
  readonly isDialog = true;

  handle(ev: KeyEvent, host: Host): boolean {
    const s = host.state.settings;
    if (ev.action === 'nav:left') s.contrast = Math.max(1, s.contrast - 1);
    else if (ev.action === 'nav:right') s.contrast = Math.min(9, s.contrast + 1);
    else if (ev.action === 'sys:ac' || ev.action === 'cmd:exe') closeMenus(host);
    host.persist();
    return true;
  }

  render(host: Host): Scene {
    const level = host.state.settings.contrast;
    const ops: DrawOp[] = [
      { kind: 'text', x: 0, y: 0, text: 'Kontrast', font: 'L' },
      { kind: 'text', x: 0, y: 24, text: 'HELL', font: 'S' },
      { kind: 'text', x: 191, y: 24, text: 'DUNKEL', font: 'S', align: 'right' },
      { kind: 'rect', x: 40, y: 22, w: 112, h: 11, fill: false },
      { kind: 'rect', x: 42, y: 24, w: Math.round((108 * level) / 9), h: 7, fill: true },
      { kind: 'text', x: 0, y: 48, text: '[◀]  [▶]', font: 'L' },
    ];
    return { ops };
  }
}

/** Bestätigung mit [=]: Ja / [AC]: Abbrechen. */
export class ConfirmDialog implements Dialog {
  readonly isDialog = true;
  private done = false;

  constructor(
    private readonly lines: string[],
    private readonly onYes: (host: Host) => void,
  ) {}

  handle(ev: KeyEvent, host: Host): boolean {
    if (this.done) {
      if (ev.action === 'sys:ac') closeMenus(host);
      return true;
    }
    if (ev.action === 'cmd:exe') {
      this.onYes(host);
      this.done = true;
    } else if (ev.action === 'sys:ac') closeMenus(host);
    return true;
  }

  render(): Scene {
    const lines = this.done ? ['Fertig!', 'Drücken Sie [AC]'] : [...this.lines, '[=] :Ja', '[AC]:Abbrechen'];
    return { ops: lines.map((text, i) => ({ kind: 'text', x: 0, y: i * 16, text, font: 'L' }) as DrawOp) };
  }

  /** Für Tests. */
  get finished(): boolean {
    return this.done;
  }
}

/** RESET-Menü: Setupdaten, Speicher oder alles initialisieren. */
export function resetMenu(): ListMenu {
  const resetSettings = (h: Host) => {
    const contrast = h.state.settings.contrast;
    h.state.settings = { ...structuredClone(DEFAULT_SETTINGS), contrast } as Settings;
  };
  const resetMemory = (h: Host) => {
    const fresh = defaultState();
    h.state.vars = fresh.vars;
    h.state.ans = fresh.ans;
    h.clearMemory();
  };
  const confirm = (lines: string[], action: (h: Host) => void): MenuItem => ({
    label: '',
    run: (h) =>
      h.push(
        new ConfirmDialog(lines, (host) => {
          action(host);
          host.resetMode();
          host.persist();
        }),
      ),
  });
  const items: MenuItem[] = [
    { ...confirm(['Setupdaten', 'zurücksetzen?'], resetSettings), label: 'Setupdaten' },
    { ...confirm(['Speicher', 'löschen?'], resetMemory), label: 'Speicher' },
    {
      ...confirm(['Alle', 'initialisieren?'], (h) => {
        resetSettings(h);
        resetMemory(h);
        h.state.mode = 'calc';
      }),
      label: 'Alle initialis.',
    },
  ];
  return new ListMenu(items, { title: 'Zurücksetzen?' });
}
