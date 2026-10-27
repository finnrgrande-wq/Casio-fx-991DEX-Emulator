// localStorage-Zugriff mit try/catch: privater Modus, volle Quote oder gesperrter Speicher dürfen die App nicht stoppen.

import { defaultState, type PersistedState } from './state';

export const STORAGE_KEY = 'classcalc:v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function loadState(store: KeyValueStore | undefined = browserStore()): PersistedState {
  const fallback = defaultState();
  if (!store) return fallback;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== 1) return fallback;
    // Fehlende Felder (ältere Stände) mit Standardwerten auffüllen.
    return {
      ...fallback,
      ...parsed,
      settings: { ...fallback.settings, ...parsed.settings },
      vars: { ...fallback.vars, ...parsed.vars },
      prefs: { ...fallback.prefs, ...parsed.prefs },
      modeData: { ...fallback.modeData, ...parsed.modeData },
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: PersistedState, store: KeyValueStore | undefined = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
