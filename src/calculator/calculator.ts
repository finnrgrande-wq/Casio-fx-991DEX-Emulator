// Controller: Modifier-Zustand (SHIFT/ALPHA), Bildschirmstapel, Statusleiste, Persistenz.
// Kennt kein DOM – die UI ruft press() auf und zeichnet render().

import { resolveAction, type KeyId, type ModeId, type Modifier } from '../keys/keymap';
import { emptyScene, type Scene, type StatusFlags } from '../display/scene';
import { MainMenu } from '../modes/mainMenu';
import { PlaceholderScreen } from '../modes/placeholder';
import type { Host, KeyEvent, Screen } from '../modes/screen';
import { loadState, saveState, type KeyValueStore } from './storage';
import type { PersistedState } from './state';

/** Zeitfenster für SHIFT-Doppeltipp (Sperre), falls in den App-Einstellungen aktiviert. */
const LOCK_WINDOW_MS = 350;

export type ScreenFactory = (mode: ModeId, host: Host) => Screen;

const defaultFactory: ScreenFactory = (mode) => new PlaceholderScreen(mode);

export interface CalculatorOptions {
  store?: KeyValueStore;
  factory?: ScreenFactory;
  now?: () => number;
}

export interface Frame {
  scene: Scene;
  status: StatusFlags;
  on: boolean;
}

export class Calculator implements Host {
  readonly state: PersistedState;
  private stack: Screen[] = [];
  private modifier: Modifier = 'none';
  private shiftLocked = false;
  private lastShiftAt = -Infinity;
  private powered = true;
  private listeners = new Set<() => void>();
  private readonly store: KeyValueStore | undefined;
  private readonly factory: ScreenFactory;
  private readonly now: () => number;

  constructor(opts: CalculatorOptions = {}) {
    this.store = opts.store;
    this.factory = opts.factory ?? defaultFactory;
    this.now = opts.now ?? (() => Date.now());
    this.state = loadState(this.store ?? undefined);
    this.stack = [this.factory(this.state.mode, this)];
  }

  // --- Host ---

  get mode(): ModeId {
    return this.state.mode;
  }

  push(screen: Screen): void {
    this.stack.push(screen);
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  replace(screen: Screen): void {
    this.stack[this.stack.length - 1] = screen;
  }

  enterMode(mode: ModeId): void {
    this.state.mode = mode;
    this.stack = [this.factory(mode, this)];
    this.persist();
  }

  persist(): void {
    saveState(this.state, this.store);
  }

  // --- Bedienung ---

  get modifierState(): Modifier {
    return this.modifier;
  }

  get isOn(): boolean {
    return this.powered;
  }

  get top(): Screen {
    return this.stack[this.stack.length - 1];
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  press(key: KeyId): void {
    this.handleKey(key);
    for (const fn of this.listeners) fn();
  }

  private handleKey(key: KeyId): void {
    if (!this.powered) {
      if (key === 'ON') this.powerOn();
      return;
    }
    if (key === 'SHIFT') return this.toggleShift();
    if (key === 'ALPHA') {
      this.shiftLocked = false;
      this.modifier = this.modifier === 'alpha' ? 'none' : 'alpha';
      return;
    }

    const mod = this.modifier;
    const action = resolveAction(key, mod, this.mode);
    if (!this.shiftLocked) this.modifier = 'none';
    const ev: KeyEvent = { key, mod, action };

    switch (action) {
      case 'sys:menu':
        if (!(this.top instanceof MainMenu)) this.push(new MainMenu(this));
        return;
      case 'sys:off':
        this.powered = false;
        this.shiftLocked = false;
        this.modifier = 'none';
        return;
      case 'sys:on':
        // ON schließt Menüs und wirkt in der Anwendung wie AC.
        this.stack = [this.stack[0]];
        this.top.handle({ ...ev, action: 'sys:ac' }, this);
        return;
    }
    this.top.handle(ev, this);
  }

  private toggleShift(): void {
    const t = this.now();
    if (this.state.prefs.shiftLock && this.modifier === 'shift' && t - this.lastShiftAt < LOCK_WINDOW_MS) {
      this.shiftLocked = true;
      this.lastShiftAt = -Infinity;
      return;
    }
    this.lastShiftAt = t;
    if (this.shiftLocked || this.modifier === 'shift') {
      this.shiftLocked = false;
      this.modifier = 'none';
    } else {
      this.modifier = 'shift';
    }
  }

  private powerOn(): void {
    this.powered = true;
    // Wie am Original: Einschalten verwirft den Ablaufspeicher der aktuellen Anwendung.
    this.stack = [this.factory(this.mode, this)];
  }

  // --- Anzeige ---

  render(): Frame {
    const scene = this.powered ? this.top.render(this) : emptyScene();
    const s = this.state.settings;
    const status: StatusFlags = {
      shift: this.modifier === 'shift',
      alpha: this.modifier === 'alpha',
      sto: scene.status?.sto ?? false,
      m: this.state.vars.M !== 0,
      math: s.io === 'mathMath' || s.io === 'mathDec',
      angle: s.angle,
      fix: s.format.kind === 'fix',
      sci: s.format.kind === 'sci',
      prefix: s.prefixes,
      complex: this.mode === 'complex' || this.mode === 'equation' ? (s.complex === 'rect' ? 'i' : '∠') : null,
      disp: scene.status?.disp ?? false,
      up: scene.status?.up ?? false,
      down: scene.status?.down ?? false,
    };
    return { scene, status, on: this.powered };
  }
}
