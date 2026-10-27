// Rechenkontext (Winkeleinheit, Variablen, Ans …) aus dem gespeicherten Zustand.

import type { EvalContext } from '../core/eval/evaluate';
import { deserialize } from '../core/value';
import type { PersistedState, VarName } from './state';

export function evalContext(st: PersistedState): EvalContext {
  return {
    angle: st.settings.angle,
    format: st.settings.format,
    getVar: (name) => deserialize(st.vars[name as VarName]),
    ans: deserialize(st.ans),
    random: Math.random,
  };
}
