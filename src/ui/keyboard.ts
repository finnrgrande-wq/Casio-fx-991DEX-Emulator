// Baut Gehäuse und Tastatur aus der Keymap-Tabelle auf und meldet Tastendrücke.

import { KEY_BY_ID, KEY_ROWS, type KeyDef, type KeyId } from '../keys/keymap';

export type PressHandler = (key: KeyId) => void;

function labelRow(def: KeyDef): HTMLElement {
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  if (def.style === 'round') {
    // Runde Tasten: eigene Beschriftung steht über der Taste
    const main = document.createElement('span');
    main.innerHTML = def.normal.label;
    lbl.append(main);
    if (def.shift) {
      const sh = document.createElement('span');
      sh.className = 'sh';
      sh.innerHTML = '&nbsp;' + def.shift.label;
      lbl.append(sh);
    }
    return lbl;
  }
  for (const [cls, binding] of [['sh', def.shift], ['al', def.alpha], ['bs', def.base]] as const) {
    if (!binding) continue;
    const span = document.createElement('span');
    span.className = cls;
    span.innerHTML = binding.label;
    lbl.append(span);
  }
  return lbl;
}

function keyElement(def: KeyDef, onPress: PressHandler): HTMLElement {
  const el = document.createElement('div');
  el.className = `key k-${def.style}`;
  el.dataset.key = def.id;
  el.append(labelRow(def));
  const cap = document.createElement('button');
  cap.className = 'cap';
  cap.type = 'button';
  cap.setAttribute('aria-label', def.id);
  if (def.style !== 'round') {
    const span = document.createElement('span');
    span.innerHTML = def.normal.label;
    cap.append(span);
  }
  el.append(cap);
  bindPress(cap, el, def.id, onPress);
  return el;
}

function bindPress(target: HTMLElement, pressedEl: HTMLElement, id: KeyId, onPress: PressHandler): void {
  const release = () => pressedEl.classList.remove('pressed');
  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressedEl.classList.add('pressed');
    onPress(id);
  });
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerleave', release);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}

function dpad(onPress: PressHandler): HTMLElement {
  const pad = document.createElement('div');
  pad.className = 'dpad';
  for (const [id, cls] of [['UP', 'up'], ['DOWN', 'down'], ['LEFT', 'left'], ['RIGHT', 'right']] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dir ${cls}`;
    btn.setAttribute('aria-label', id);
    btn.textContent = KEY_BY_ID[id].normal.label;
    bindPress(btn, btn, id, onPress);
    pad.append(btn);
  }
  const cell = document.createElement('div');
  cell.className = 'dpad-cell';
  cell.append(pad);
  return cell;
}

/** Erzeugt das komplette Gehäuse. Das Display-Element wird von außen eingesetzt. */
export function buildCalculator(display: HTMLElement, onPress: PressHandler): HTMLElement {
  const calc = document.createElement('div');
  calc.className = 'calc';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = 'ClassCalc';

  const top = document.createElement('div');
  top.className = 'top-panel';
  const place = (id: KeyId, col: number, row: number) => {
    const el = keyElement(KEY_BY_ID[id], onPress);
    el.style.gridColumn = String(col);
    el.style.gridRow = String(row);
    top.append(el);
  };
  place('SHIFT', 1, 1);
  place('ALPHA', 2, 1);
  place('MENU', 4, 1);
  place('ON', 5, 1);
  place('OPTN', 1, 2);
  place('CALC', 2, 2);
  place('INTEGRAL', 4, 2);
  place('X', 5, 2);
  top.append(dpad(onPress));

  const dark = document.createElement('div');
  dark.className = 'rows';
  const light = document.createElement('div');
  light.className = 'rows';
  for (const ids of KEY_ROWS) {
    const row = document.createElement('div');
    row.className = `row ${ids.length === 6 ? 'six' : 'five'}`;
    for (const id of ids) row.append(keyElement(KEY_BY_ID[id], onPress));
    (ids.length === 6 ? dark : light).append(row);
  }

  calc.append(brand, display, top, dark, light);
  return calc;
}

/** Markiert eine Taste kurz als gedrückt (für Eingaben über die Computertastatur). */
export function flashKey(root: HTMLElement, id: KeyId): void {
  const el = root.querySelector<HTMLElement>(`[data-key="${id}"]`) ??
    root.querySelector<HTMLElement>(`.dir[aria-label="${id}"]`);
  if (!el) return;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 90);
}
