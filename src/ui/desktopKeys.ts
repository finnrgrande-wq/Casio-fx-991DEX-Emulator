// Optionale Bedienung über die Computertastatur (zum Testen am Desktop).

import type { KeyId } from '../keys/keymap';

const MAP: Record<string, KeyId> = {
  '0': 'D0', '1': 'D1', '2': 'D2', '3': 'D3', '4': 'D4',
  '5': 'D5', '6': 'D6', '7': 'D7', '8': 'D8', '9': 'D9',
  ',': 'COMMA', '.': 'COMMA',
  '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV',
  '(': 'LPAREN', ')': 'RPAREN', '^': 'POWER',
  Enter: 'EQ', '=': 'EQ',
  Backspace: 'DEL', Delete: 'DEL', Escape: 'AC',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  F1: 'SHIFT', F2: 'ALPHA', F3: 'MENU', F4: 'OPTN',
  x: 'X', s: 'SIN', c: 'COS', t: 'TAN', l: 'LN', r: 'SQRT',
};

/** Ruft onKey für jede zugeordnete Taste auf; liefert eine Abmeldefunktion. */
export function bindDesktopKeys(onKey: (key: KeyId) => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = MAP[e.key];
    if (!key) return;
    e.preventDefault();
    onKey(key);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
