// Die 13 Anwendungen des Hauptmenüs in Originalreihenfolge.

import type { KeyId, ModeId } from '../keys/keymap';

export interface ModeInfo {
  id: ModeId;
  /** Zeichen auf der Menü-Plakette: 1–9, A–D. */
  badge: string;
  /** Text in der unteren Menüzeile ohne Präfix. */
  title: string;
  /** Taste, die den Modus im Hauptmenü direkt wählt. */
  key: KeyId;
}

export const MODES: readonly ModeInfo[] = [
  { id: 'calc', badge: '1', title: 'Berechnungen', key: 'D1' },
  { id: 'complex', badge: '2', title: 'Komplexe Zahlen', key: 'D2' },
  { id: 'basen', badge: '3', title: 'Basis-N', key: 'D3' },
  { id: 'matrix', badge: '4', title: 'Matrizen', key: 'D4' },
  { id: 'vector', badge: '5', title: 'Vektorrechnung', key: 'D5' },
  { id: 'stat', badge: '6', title: 'Statistik', key: 'D6' },
  { id: 'dist', badge: '7', title: 'Verteilungsfkt.', key: 'D7' },
  { id: 'sheet', badge: '8', title: 'Tabellenkalk.', key: 'D8' },
  { id: 'table', badge: '9', title: 'Tabellen', key: 'D9' },
  { id: 'equation', badge: 'A', title: 'Gleichung/Funkt', key: 'NEG' },
  { id: 'inequality', badge: 'B', title: 'Ungleichungen', key: 'DMS' },
  { id: 'verify', badge: 'C', title: 'Berechn. prüfen', key: 'INV' },
  { id: 'ratio', badge: 'D', title: 'Verhältnisse', key: 'SIN' },
];

export const modeInfo = (id: ModeId): ModeInfo => MODES.find((m) => m.id === id)!;
