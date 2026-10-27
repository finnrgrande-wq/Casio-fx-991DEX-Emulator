import { describe, expect, it } from 'vitest';
import { KEYS, KEY_BY_ID, KEY_ROWS, resolveAction, type KeyId } from '../../src/keys/keymap';

describe('Keymap', () => {
  it('enthält alle 50 Tasten des Originals genau einmal', () => {
    const ids = KEYS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(50);
  });

  it('ordnet die Tastenreihen wie am Gerät an (3 × 6 dunkel, 4 × 5 hell)', () => {
    expect(KEY_ROWS.map((r) => r.length)).toEqual([6, 6, 6, 5, 5, 5, 5]);
    for (const id of KEY_ROWS.flat()) expect(KEY_BY_ID[id]).toBeDefined();
  });

  it.each<[KeyId, 'none' | 'shift' | 'alpha', string]>([
    ['CALC', 'shift', 'cmd:solve'],
    ['CALC', 'alpha', 'in:eq'],
    ['INTEGRAL', 'shift', 'tpl:derivative'],
    ['X', 'shift', 'tpl:sum'],
    ['X', 'alpha', 'tpl:product'],
    ['LOGAB', 'none', 'tpl:logab'],
    ['NEG', 'shift', 'fn:log'],
    ['NEG', 'alpha', 'in:var:A'],
    ['STO', 'shift', 'cmd:recall'],
    ['RPAREN', 'shift', 'in:semicolon'],
    ['INV', 'shift', 'in:factorial'],
    ['MUL', 'shift', 'in:npr'],
    ['DIV', 'shift', 'in:ncr'],
    ['COMMA', 'shift', 'in:ran'],
    ['COMMA', 'alpha', 'fn:ranint'],
    ['EQ', 'shift', 'cmd:approx'],
    ['D7', 'shift', 'sys:const'],
    ['D8', 'shift', 'sys:conv'],
    ['D9', 'shift', 'sys:reset'],
    ['MENU', 'shift', 'sys:setup'],
    ['OPTN', 'shift', 'sys:qr'],
    ['DEL', 'alpha', 'edit:undo'],
  ])('%s mit %s → %s', (key, mod, action) => {
    expect(resolveAction(key, mod, 'calc')).toBe(action);
  });

  it('liefert ohne Zweitbelegung keine Aktion', () => {
    expect(resolveAction('D4', 'shift', 'calc')).toBeUndefined();
    expect(resolveAction('D4', 'alpha', 'calc')).toBeUndefined();
  });

  it('nutzt im Basis-N-Modus die blauen Belegungen und A–F direkt', () => {
    expect(resolveAction('SQUARE', 'none', 'basen')).toBe('base:dec');
    expect(resolveAction('LN', 'none', 'basen')).toBe('base:oct');
    expect(resolveAction('NEG', 'none', 'basen')).toBe('in:hex:A');
    expect(resolveAction('TAN', 'none', 'basen')).toBe('in:hex:F');
    expect(resolveAction('SQUARE', 'none', 'calc')).toBe('in:square');
  });

  it('liefert ∠ auf SHIFT ENG nur im Modus Komplexe Zahlen', () => {
    expect(resolveAction('ENG', 'shift', 'complex')).toBe('in:angle');
    expect(resolveAction('ENG', 'shift', 'calc')).toBe('cmd:engLeft');
  });
});
