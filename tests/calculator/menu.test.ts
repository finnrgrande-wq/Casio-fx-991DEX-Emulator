import { describe, expect, it } from 'vitest';
import { MainMenu } from '../../src/modes/mainMenu';
import { memStore, newCalc, press, screen } from '../helpers';

describe('Hauptmenü per Tastenfolge', () => {
  it('MENU zeigt das Menü mit der aktuellen Anwendung', () => {
    const calc = press(newCalc(), 'MENU');
    expect(calc.top).toBeInstanceOf(MainMenu);
    expect(screen(calc)).toContain('1:Berechnungen');
  });

  it('Cursortasten wählen, = öffnet die Anwendung', () => {
    const calc = press(newCalc(), 'MENU', 'RIGHT', 'RIGHT', 'RIGHT');
    expect(screen(calc)).toContain('4:Matrizen');
    press(calc, 'DOWN');
    expect(screen(calc)).toContain('8:Tabellenkalk.');
    press(calc, 'DOWN');
    expect(screen(calc)).toContain('C:Berechn. prüfen');
    expect(calc.render().status.up).toBe(true);
    press(calc, 'EQ');
    expect(calc.mode).toBe('verify');
  });

  it('Ziffern und A–D wählen direkt', () => {
    const calc = press(newCalc(), 'MENU', 'D7');
    expect(calc.mode).toBe('dist');
    press(calc, 'MENU', 'NEG');
    expect(calc.mode).toBe('equation');
    press(calc, 'MENU', 'SIN');
    expect(calc.mode).toBe('ratio');
  });

  it('▲ in der ersten Reihe springt ans Ende, ▶ am Ende wieder auf 1', () => {
    const calc = press(newCalc(), 'MENU', 'UP');
    expect(screen(calc)).toContain('D:Verhältnisse');
    press(calc, 'RIGHT');
    expect(screen(calc)).toContain('1:Berechnungen');
  });

  it('AC schließt das Menü ohne Moduswechsel', () => {
    const calc = press(newCalc(), 'MENU', 'RIGHT', 'AC');
    expect(calc.top).not.toBeInstanceOf(MainMenu);
    expect(calc.mode).toBe('calc');
  });

  it('der gewählte Modus übersteht einen Neustart', () => {
    const store = memStore();
    press(newCalc(store), 'MENU', 'D9');
    expect(newCalc(store).mode).toBe('table');
  });
});

describe('SHIFT und ALPHA', () => {
  it('sind Einmal-Modifier mit Anzeige S/A', () => {
    const calc = press(newCalc(), 'SHIFT');
    expect(calc.render().status.shift).toBe(true);
    press(calc, 'D4');
    expect(calc.render().status.shift).toBe(false);
    press(calc, 'ALPHA');
    expect(calc.render().status.alpha).toBe(true);
    press(calc, 'ALPHA');
    expect(calc.render().status.alpha).toBe(false);
  });

  it('SHIFT MENU löst SETUP aus, nicht das Menü', () => {
    const calc = press(newCalc(), 'SHIFT', 'MENU');
    expect(calc.top).not.toBeInstanceOf(MainMenu);
  });

  it('Doppeltipp-Sperre nur, wenn in den App-Einstellungen aktiviert', () => {
    let t = 0;
    const calc = newCalc(memStore(), () => t);
    press(calc, 'SHIFT');
    t = 100;
    press(calc, 'SHIFT');
    expect(calc.render().status.shift).toBe(false);

    calc.state.prefs.shiftLock = true;
    t = 1000;
    press(calc, 'SHIFT');
    t = 1100;
    press(calc, 'SHIFT', 'D4', 'D5');
    expect(calc.render().status.shift).toBe(true);
    press(calc, 'SHIFT');
    expect(calc.render().status.shift).toBe(false);
  });

  it('OFF schaltet aus, nur ON schaltet wieder ein', () => {
    const calc = press(newCalc(), 'SHIFT', 'AC');
    expect(calc.isOn).toBe(false);
    press(calc, 'D1', 'MENU');
    expect(calc.isOn).toBe(false);
    press(calc, 'ON');
    expect(calc.isOn).toBe(true);
  });
});
