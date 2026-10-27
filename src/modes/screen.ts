// Schnittstelle zwischen Controller und den Bildschirmen der Anwendungen.

import type { Action, KeyId, ModeId, Modifier } from '../keys/keymap';
import type { Scene } from '../display/scene';
import type { PersistedState } from '../calculator/state';

export interface KeyEvent {
  key: KeyId;
  mod: Modifier;
  /** Aufgelöste Aktion (kann fehlen, z. B. SHIFT + Ziffer ohne Zweitbelegung). */
  action: Action | undefined;
}

/** Was ein Bildschirm vom Rechner sehen und anstoßen darf. */
export interface Host {
  readonly state: PersistedState;
  readonly mode: ModeId;
  /** Oberster Bildschirm des Stapels. */
  readonly top: Screen;
  push(screen: Screen): void;
  pop(): void;
  replace(screen: Screen): void;
  /** Wechselt die Anwendung; löscht Ablaufspeicher und Bildschirmstapel. */
  enterMode(mode: ModeId): void;
  /** Baut den Anwendungsbildschirm neu auf (Ablaufspeicher leer), Menüs darüber bleiben. */
  resetMode(): void;
  /** Löscht Speicher der Anwendungen (Matrizen, Vektoren, Listen …). */
  clearMemory(): void;
  /** Meldet geänderten dauerhaften Zustand (wird gespeichert). */
  persist(): void;
}

export interface Screen {
  /** Liefert true, wenn die Taste verarbeitet wurde. */
  handle(ev: KeyEvent, host: Host): boolean;
  render(host: Host): Scene;
}
