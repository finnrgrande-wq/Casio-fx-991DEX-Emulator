// RECALL (SHIFT STO): zeigt alle Variablen (immer im Format Norm 1); eine Variablentaste fügt sie ein.

import { decimalForm } from '../../core/format/result';
import { deserialize } from '../../core/value';
import type { DrawOp, Scene } from '../../display/scene';
import { DEFAULT_SETTINGS, VAR_NAMES, type VarName } from '../../calculator/state';
import type { KeyId } from '../../keys/keymap';
import type { Host, KeyEvent, Screen } from '../screen';

/** Variablentasten ohne ALPHA. */
const KEYS: Partial<Record<KeyId, VarName>> = {
  NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RPAREN: 'x', X: 'x', SD: 'y',
};

const LABEL: Record<VarName, string> = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', M: 'M', x: '𝑥', y: '𝑦' };

export class RecallScreen implements Screen {
  constructor(private readonly onPick: (name: VarName) => void) {}

  handle(ev: KeyEvent, host: Host): boolean {
    const name = KEYS[ev.key];
    if (name && ev.mod !== 'shift') {
      host.pop();
      this.onPick(name);
      return true;
    }
    if (ev.action === 'sys:ac') host.pop();
    return true;
  }

  render(host: Host): Scene {
    const norm1 = { ...DEFAULT_SETTINGS, format: { kind: 'norm', n: 1 } as const };
    const ops: DrawOp[] = VAR_NAMES.map((name, i) => {
      const f = decimalForm(deserialize(host.state.vars[name]), norm1);
      const value = f.kind === 'decimal' ? f.mantissa + (f.exponent !== undefined ? `E${f.exponent}` : '') : '';
      // Zwei Spalten mit je fünf Zeilen
      return { kind: 'text', x: i < 5 ? 0 : 97, y: (i % 5) * 12 + 2, text: `${LABEL[name]}=${value}`, font: 'S' };
    });
    return { ops };
  }
}
