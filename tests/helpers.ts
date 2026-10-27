import { Calculator } from '../src/calculator/calculator';
import type { KeyValueStore } from '../src/calculator/storage';
import { sceneText } from '../src/display/scene';
import type { KeyId } from '../src/keys/keymap';

export function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

export function newCalc(store = memStore(), now = () => 0): Calculator {
  return new Calculator({ store, now });
}

export function press(calc: Calculator, ...keys: KeyId[]): Calculator {
  for (const k of keys) calc.press(k);
  return calc;
}

/** Textabbild des aktuellen Displays. */
export function screen(calc: Calculator): string[] {
  return sceneText(calc.render().scene);
}
