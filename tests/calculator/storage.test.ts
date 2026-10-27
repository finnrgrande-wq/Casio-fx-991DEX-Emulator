import { describe, expect, it } from 'vitest';
import { loadState, saveState, STORAGE_KEY } from '../../src/calculator/storage';
import { defaultState } from '../../src/calculator/state';
import { memStore } from '../helpers';

describe('Speicherung', () => {
  it('Roundtrip von Einstellungen und Variablen', () => {
    const store = memStore();
    const s = defaultState();
    s.settings.angle = 'R';
    s.vars.A = { k: 'f', x: 3.5 };
    expect(saveState(s, store)).toBe(true);
    const back = loadState(store);
    expect(back.settings.angle).toBe('R');
    expect(back.vars.A).toEqual({ k: 'f', x: 3.5 });
  });

  it('ignoriert kaputte Daten und fremde Versionen', () => {
    expect(loadState(memStore({ [STORAGE_KEY]: '{kaputt' })).mode).toBe('calc');
    expect(loadState(memStore({ [STORAGE_KEY]: '{"version":99,"mode":"stat"}' })).mode).toBe('calc');
  });

  it('übersteht einen Speicher, der Ausnahmen wirft', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
      setItem: (): void => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadState(broken).settings.io).toBe('mathMath');
    expect(saveState(defaultState(), broken)).toBe(false);
  });

  it('füllt fehlende Felder älterer Stände auf', () => {
    const store = memStore({ [STORAGE_KEY]: JSON.stringify({ version: 1, mode: 'stat', settings: { angle: 'G' } }) });
    const s = loadState(store);
    expect(s.mode).toBe('stat');
    expect(s.settings.angle).toBe('G');
    expect(s.settings.format).toEqual({ kind: 'norm', n: 1 });
    expect(s.vars.M).toEqual({ k: 's', t: [] });
  });
});
