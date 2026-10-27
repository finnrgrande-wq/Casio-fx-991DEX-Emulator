// Dauerhafter Zustand des Rechners: SETUP, Speicher, App-Einstellungen.

import type { ModeId } from '../keys/keymap';
import type { AngleUnit } from '../display/scene';

export type IoMode = 'mathMath' | 'mathDec' | 'linLin' | 'linDec';
export type NumberFormat = { kind: 'norm'; n: 1 | 2 } | { kind: 'fix'; n: number } | { kind: 'sci'; n: number };

/** SETUP-Einstellungen mit den Standardwerten der Bedienungsanleitung. */
export interface Settings {
  io: IoMode;
  angle: AngleUnit;
  format: NumberFormat;
  prefixes: boolean;
  fraction: 'mixed' | 'improper';
  complex: 'rect' | 'polar';
  statFreq: boolean;
  sheetAutoCalc: boolean;
  sheetShowFormula: boolean;
  eqComplexRoots: boolean;
  tableFunctions: 'f' | 'fg';
  recurring: boolean;
  thousands: boolean;
  smallFont: boolean;
  qrVersion: 3 | 11;
  autoOff: 10 | 60;
  contrast: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  io: 'mathMath',
  angle: 'D',
  format: { kind: 'norm', n: 1 },
  prefixes: false,
  fraction: 'improper',
  complex: 'rect',
  statFreq: false,
  sheetAutoCalc: true,
  sheetShowFormula: true,
  eqComplexRoots: true,
  tableFunctions: 'fg',
  recurring: true,
  thousands: false,
  smallFont: false,
  qrVersion: 11,
  autoOff: 10,
  contrast: 5,
};

export type VarName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'M' | 'x' | 'y';
export const VAR_NAMES: readonly VarName[] = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'];

/** Einstellungen der App selbst (nicht Teil des Originals). */
export interface AppPrefs {
  shiftLock: boolean;
  haptics: boolean;
}

export const DEFAULT_PREFS: Readonly<AppPrefs> = { shiftLock: false, haptics: true };

export interface PersistedState {
  version: 1;
  mode: ModeId;
  settings: Settings;
  /** Variablenwerte als Zahl; die exakte Darstellung folgt mit dem Rechenkern in M2. */
  vars: Record<VarName, number>;
  ans: number;
  prefs: AppPrefs;
}

export function defaultState(): PersistedState {
  return {
    version: 1,
    mode: 'calc',
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    vars: Object.fromEntries(VAR_NAMES.map((v) => [v, 0])) as Record<VarName, number>,
    ans: 0,
    prefs: { ...DEFAULT_PREFS },
  };
}
