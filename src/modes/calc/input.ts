// Gemeinsame Eingabelogik: Tastenaktion → Token oder Schablone im Editor.

import type { Editor, TemplateType } from '../../editor/model';
import { TOKENS } from '../../editor/tokens';

/** Aktion → einzufügendes Token. */
export const INSERT: Readonly<Record<string, string>> = {
  'in:comma': ',', 'in:add': '+', 'in:sub': '−', 'in:mul': '×', 'in:div': '÷', 'in:neg': 'neg',
  'in:lparen': '(', 'in:rparen': ')', 'in:semicolon': ';', 'in:colon': ':', 'in:eq': '=',
  'in:square': '²', 'in:cube': '³', 'in:inverse': '⁻¹', 'in:factorial': '!', 'in:percent': '%',
  'in:dms': 'dms', 'in:npr': 'nPr', 'in:ncr': 'nCr', 'in:divrem': '÷R', 'in:pi': 'π', 'in:e': 'e',
  'in:ans': 'Ans', 'in:ran': 'Ran#', 'in:i': 'i', 'in:angle': '∠',
  'in:hex:A': 'hex:A', 'in:hex:B': 'hex:B', 'in:hex:C': 'hex:C', 'in:hex:D': 'hex:D', 'in:hex:E': 'hex:E', 'in:hex:F': 'hex:F',
  'fn:sin': 'sin(', 'fn:cos': 'cos(', 'fn:tan': 'tan(', 'fn:asin': 'sin⁻¹(', 'fn:acos': 'cos⁻¹(', 'fn:atan': 'tan⁻¹(',
  'fn:log': 'log(', 'fn:ln': 'ln(', 'fn:pol': 'Pol(', 'fn:rec': 'Rec(', 'fn:gcd': 'GCD(', 'fn:lcm': 'LCM(',
  'fn:int': 'Int(', 'fn:intg': 'Intg(', 'fn:rnd': 'Rnd(', 'fn:rndfix': 'RndFix(', 'fn:ranint': 'RanInt#(',
};

/** Aktion → Schablone. */
export const TEMPLATES: Readonly<Record<string, TemplateType>> = {
  'tpl:frac': 'frac', 'tpl:mixed': 'mixed', 'tpl:sqrt': 'sqrt', 'tpl:cbrt': 'cbrt', 'tpl:root': 'root',
  'tpl:power': 'pow', 'tpl:pow10': 'pow10', 'tpl:exp': 'exp', 'tpl:logab': 'logab', 'tpl:integral': 'integral',
  'tpl:derivative': 'deriv', 'tpl:sum': 'sum', 'tpl:product': 'prod', 'tpl:recurring': 'recurring', 'in:exp10': 'e10',
};

export function isInsertAction(a: string): boolean {
  return a.startsWith('in:') || a.startsWith('fn:') || a in TEMPLATES || a in INSERT;
}

/** Operatoren nach einem Ergebnis setzen die Rechnung mit Ans fort. */
export function continuesWithAns(a: string): boolean {
  if (a === 'tpl:power') return true;
  const tok = INSERT[a];
  if (!tok) return false;
  const kind = TOKENS[tok]?.kind;
  return (kind === 'binop' && tok !== '∠') || (kind === 'postfix' && tok !== 'dms');
}

/** Führt eine Eingabeaktion im Editor aus; false, wenn die Aktion keine Eingabe ist. */
export function applyInsertAction(editor: Editor, a: string, linear: boolean): boolean {
  if (a.startsWith('in:digit:')) {
    editor.insertToken(a.slice('in:digit:'.length));
    return true;
  }
  if (a.startsWith('in:var:')) {
    editor.insertToken(a.slice('in:var:'.length));
    return true;
  }
  if (a === 'fn:abs') {
    if (linear) editor.insertToken('Abs(');
    else editor.insertTemplate('abs');
    return true;
  }
  const tpl = TEMPLATES[a];
  if (tpl) {
    editor.insertTemplate(tpl);
    return true;
  }
  const tok = INSERT[a];
  if (tok) {
    editor.insertToken(tok);
    return true;
  }
  return false;
}
