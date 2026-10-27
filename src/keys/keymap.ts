// Tastenbelegung als Datentabelle (Referenz: Titelbild der Kurzanleitung und Komplettanleitung).
// Jede Taste hat eine Normal-, SHIFT- und ALPHA-Belegung sowie optionale Überschreibungen je Modus.
// Aktionen sind Kommando-IDs, die der aktive Bildschirm interpretiert.

export type KeyId =
  | 'SHIFT' | 'ALPHA' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'MENU' | 'ON'
  | 'OPTN' | 'CALC' | 'INTEGRAL' | 'X'
  | 'FRAC' | 'SQRT' | 'SQUARE' | 'POWER' | 'LOGAB' | 'LN'
  | 'NEG' | 'DMS' | 'INV' | 'SIN' | 'COS' | 'TAN'
  | 'STO' | 'ENG' | 'LPAREN' | 'RPAREN' | 'SD' | 'MPLUS'
  | 'D7' | 'D8' | 'D9' | 'DEL' | 'AC'
  | 'D4' | 'D5' | 'D6' | 'MUL' | 'DIV'
  | 'D1' | 'D2' | 'D3' | 'ADD' | 'SUB'
  | 'D0' | 'COMMA' | 'EXP' | 'ANS' | 'EQ';

export type Modifier = 'none' | 'shift' | 'alpha';

/** Kommando-ID, z. B. 'in:digit:7', 'tpl:frac', 'fn:sin', 'cmd:solve', 'sys:menu'. */
export type Action = string;

export type ModeId =
  | 'calc' | 'complex' | 'basen' | 'matrix' | 'vector' | 'stat' | 'dist'
  | 'sheet' | 'table' | 'equation' | 'inequality' | 'verify' | 'ratio';

export interface Binding {
  action: Action;
  /** Beschriftung über bzw. auf der Taste (einfaches HTML erlaubt). */
  label: string;
}

export type KeyStyle = 'round' | 'dpad' | 'dark' | 'light' | 'blue';

export interface KeyDef {
  id: KeyId;
  style: KeyStyle;
  normal: Binding;
  shift?: Binding;
  alpha?: Binding;
  /** Blaue Beschriftung (Basis-N-Modus). */
  base?: Binding;
  /** Abweichende Belegungen in einzelnen Modi. */
  modes?: Partial<Record<ModeId, Partial<Record<Modifier, Action>>>>;
}

const b = (action: Action, label: string): Binding => ({ action, label });

// Beschriftungen für Schablonentasten
const BOX = '<i class="bx"></i>';
const BOX_S = '<i class="bx s"></i>';
const FRAC = `<span class="fr">${BOX}${BOX}</span>`;

const HEX = (d: string) => ({ basen: { none: `in:hex:${d}` } });

export const KEYS: readonly KeyDef[] = [
  // Kopfzeile
  { id: 'SHIFT', style: 'round', normal: b('mod:shift', 'SHIFT') },
  { id: 'ALPHA', style: 'round', normal: b('mod:alpha', 'ALPHA') },
  { id: 'UP', style: 'dpad', normal: b('nav:up', '▲') },
  { id: 'DOWN', style: 'dpad', normal: b('nav:down', '▼') },
  { id: 'LEFT', style: 'dpad', normal: b('nav:left', '◀') },
  { id: 'RIGHT', style: 'dpad', normal: b('nav:right', '▶') },
  { id: 'MENU', style: 'round', normal: b('sys:menu', 'MENU'), shift: b('sys:setup', 'SETUP') },
  { id: 'ON', style: 'round', normal: b('sys:on', 'ON') },

  // Reihe 1
  { id: 'OPTN', style: 'dark', normal: b('sys:optn', 'OPTN'), shift: b('sys:qr', 'QR') },
  { id: 'CALC', style: 'dark', normal: b('cmd:calc', 'CALC'), shift: b('cmd:solve', 'SOLVE'), alpha: b('in:eq', '=') },
  {
    id: 'INTEGRAL', style: 'dark',
    normal: b('tpl:integral', `∫<sub>${BOX_S}</sub><sup>${BOX_S}</sup>${BOX}`),
    shift: b('tpl:derivative', `<span class="fr"><i>d</i><i>dx</i></span>${BOX_S}`),
    alpha: b('in:colon', ':'),
  },
  {
    id: 'X', style: 'dark', normal: b('in:var:x', '<i class="it">x</i>'),
    shift: b('tpl:sum', `Σ${BOX_S}`), alpha: b('tpl:product', `Π${BOX_S}`),
  },

  // Reihe 2
  { id: 'FRAC', style: 'dark', normal: b('tpl:frac', FRAC), shift: b('tpl:mixed', `${BOX_S}${FRAC}`), alpha: b('in:divrem', '÷R') },
  {
    id: 'SQRT', style: 'dark', normal: b('tpl:sqrt', `√${BOX}`), shift: b('tpl:cbrt', `<sup>3</sup>√${BOX_S}`),
    alpha: b('tpl:recurring', `<span class="ov">${BOX_S}</span>`),
  },
  {
    id: 'SQUARE', style: 'dark', normal: b('in:square', '<i class="it">x</i><sup>2</sup>'),
    shift: b('in:cube', '<i class="it">x</i><sup>3</sup>'), base: b('base:dec', 'DEC'),
  },
  {
    id: 'POWER', style: 'dark', normal: b('tpl:power', `<i class="it">x</i><sup>${BOX_S}</sup>`),
    shift: b('tpl:root', `<sup>${BOX_S}</sup>√${BOX_S}`), base: b('base:hex', 'HEX'),
  },
  {
    id: 'LOGAB', style: 'dark', normal: b('tpl:logab', `log<sub>${BOX_S}</sub>${BOX}`),
    shift: b('tpl:pow10', `10<sup>${BOX_S}</sup>`), base: b('base:bin', 'BIN'),
  },
  { id: 'LN', style: 'dark', normal: b('fn:ln', 'ln'), shift: b('tpl:exp', `<i class="it">e</i><sup>${BOX_S}</sup>`), base: b('base:oct', 'OCT') },

  // Reihe 3
  { id: 'NEG', style: 'dark', normal: b('in:neg', '(−)'), shift: b('fn:log', 'log'), alpha: b('in:var:A', 'A'), modes: HEX('A') },
  { id: 'DMS', style: 'dark', normal: b('in:dms', '°′″'), shift: b('cmd:fact', 'FACT'), alpha: b('in:var:B', 'B'), modes: HEX('B') },
  {
    id: 'INV', style: 'dark', normal: b('in:inverse', '<i class="it">x</i><sup>−1</sup>'),
    shift: b('in:factorial', '<i class="it">x</i>!'), alpha: b('in:var:C', 'C'), modes: HEX('C'),
  },
  { id: 'SIN', style: 'dark', normal: b('fn:sin', 'sin'), shift: b('fn:asin', 'sin<sup>−1</sup>'), alpha: b('in:var:D', 'D'), modes: HEX('D') },
  { id: 'COS', style: 'dark', normal: b('fn:cos', 'cos'), shift: b('fn:acos', 'cos<sup>−1</sup>'), alpha: b('in:var:E', 'E'), modes: HEX('E') },
  { id: 'TAN', style: 'dark', normal: b('fn:tan', 'tan'), shift: b('fn:atan', 'tan<sup>−1</sup>'), alpha: b('in:var:F', 'F'), modes: HEX('F') },

  // Reihe 4
  { id: 'STO', style: 'dark', normal: b('cmd:sto', 'STO'), shift: b('cmd:recall', 'RECALL') },
  {
    id: 'ENG', style: 'dark', normal: b('cmd:eng', 'ENG'), shift: b('cmd:engLeft', '∠ ←'), alpha: b('in:i', '<i class="it">i</i>'),
    modes: { complex: { shift: 'in:angle' } },
  },
  { id: 'LPAREN', style: 'dark', normal: b('in:lparen', '('), shift: b('fn:abs', 'Abs') },
  { id: 'RPAREN', style: 'dark', normal: b('in:rparen', ')'), shift: b('in:semicolon', ';'), alpha: b('in:var:x', '<i class="it">x</i>') },
  {
    id: 'SD', style: 'dark', normal: b('cmd:sd', 'S⇔D'),
    shift: b('cmd:mixedToggle', `a<span class="fr"><i>b</i><i>c</i></span>⇔<span class="fr"><i>d</i><i>c</i></span>`),
    alpha: b('in:var:y', '<i class="it">y</i>'),
  },
  { id: 'MPLUS', style: 'dark', normal: b('cmd:mplus', 'M+'), shift: b('cmd:mminus', 'M−'), alpha: b('in:var:M', 'M') },

  // Reihe 5
  { id: 'D7', style: 'light', normal: b('in:digit:7', '7'), shift: b('sys:const', 'CONST') },
  { id: 'D8', style: 'light', normal: b('in:digit:8', '8'), shift: b('sys:conv', 'CONV') },
  { id: 'D9', style: 'light', normal: b('in:digit:9', '9'), shift: b('sys:reset', 'RESET') },
  { id: 'DEL', style: 'blue', normal: b('edit:del', 'DEL'), shift: b('edit:ins', 'INS'), alpha: b('edit:undo', 'UNDO') },
  { id: 'AC', style: 'blue', normal: b('sys:ac', 'AC'), shift: b('sys:off', 'OFF') },

  // Reihe 6
  { id: 'D4', style: 'light', normal: b('in:digit:4', '4') },
  { id: 'D5', style: 'light', normal: b('in:digit:5', '5') },
  { id: 'D6', style: 'light', normal: b('in:digit:6', '6') },
  { id: 'MUL', style: 'light', normal: b('in:mul', '×'), shift: b('in:npr', '<i>n</i>P<i>r</i>'), alpha: b('fn:gcd', 'GCD') },
  { id: 'DIV', style: 'light', normal: b('in:div', '÷'), shift: b('in:ncr', '<i>n</i>C<i>r</i>'), alpha: b('fn:lcm', 'LCM') },

  // Reihe 7
  { id: 'D1', style: 'light', normal: b('in:digit:1', '1') },
  { id: 'D2', style: 'light', normal: b('in:digit:2', '2') },
  { id: 'D3', style: 'light', normal: b('in:digit:3', '3') },
  { id: 'ADD', style: 'light', normal: b('in:add', '+'), shift: b('fn:pol', 'Pol'), alpha: b('fn:int', 'Int') },
  { id: 'SUB', style: 'light', normal: b('in:sub', '−'), shift: b('fn:rec', 'Rec'), alpha: b('fn:intg', 'Intg') },

  // Reihe 8
  { id: 'D0', style: 'light', normal: b('in:digit:0', '0'), shift: b('fn:rnd', 'Rnd'), alpha: b('fn:rndfix', 'RndFix') },
  { id: 'COMMA', style: 'light', normal: b('in:comma', ','), shift: b('in:ran', 'Ran#'), alpha: b('fn:ranint', 'RanInt') },
  { id: 'EXP', style: 'light', normal: b('in:exp10', '×10<sup><i class="it">x</i></sup>'), shift: b('in:pi', '<i class="it">π</i>'), alpha: b('in:e', '<i class="it">e</i>') },
  { id: 'ANS', style: 'light', normal: b('in:ans', 'Ans'), shift: b('in:percent', '%') },
  { id: 'EQ', style: 'light', normal: b('cmd:exe', '='), shift: b('cmd:approx', '≈') },
];

export const KEY_BY_ID: Readonly<Record<KeyId, KeyDef>> = Object.fromEntries(
  KEYS.map((k) => [k.id, k]),
) as Record<KeyId, KeyDef>;

/** Tastenreihen unterhalb des Steuerkreuzes in Originalanordnung. */
export const KEY_ROWS: readonly (readonly KeyId[])[] = [
  ['FRAC', 'SQRT', 'SQUARE', 'POWER', 'LOGAB', 'LN'],
  ['NEG', 'DMS', 'INV', 'SIN', 'COS', 'TAN'],
  ['STO', 'ENG', 'LPAREN', 'RPAREN', 'SD', 'MPLUS'],
  ['D7', 'D8', 'D9', 'DEL', 'AC'],
  ['D4', 'D5', 'D6', 'MUL', 'DIV'],
  ['D1', 'D2', 'D3', 'ADD', 'SUB'],
  ['D0', 'COMMA', 'EXP', 'ANS', 'EQ'],
];

/**
 * Ermittelt die Aktion einer Taste für den aktuellen Modifier und Modus.
 * Ohne eigene SHIFT/ALPHA-Belegung liefert die Taste keine Aktion (wie am Gerät).
 */
export function resolveAction(key: KeyId, mod: Modifier, mode: ModeId): Action | undefined {
  const def = KEY_BY_ID[key];
  const override = def.modes?.[mode]?.[mod];
  if (override) return override;
  if (mode === 'basen' && mod === 'none' && def.base) return def.base.action;
  if (mod === 'shift') return def.shift?.action;
  if (mod === 'alpha') return def.alpha?.action;
  return def.normal.action;
}
