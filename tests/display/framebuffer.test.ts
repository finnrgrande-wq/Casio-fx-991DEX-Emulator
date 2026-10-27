import { describe, expect, it } from 'vitest';
import { Framebuffer, splitGlyphs, textWidth } from '../../src/display/framebuffer';
import { sceneText } from '../../src/display/scene';
import { renderStatus, STATUS_HEIGHT } from '../../src/display/statusbar';
import { LARGE_FONT } from '../../src/display/fonts/large';
import { LCD_WIDTH } from '../../src/display/types';
import { newCalc, press } from '../helpers';

describe('Framebuffer', () => {
  it('hält kombinierende Zeichen am Basiszeichen', () => {
    expect(splitGlyphs('x̄+1')).toEqual(['x̄', '+', '1']);
  });

  it('17 Zeichen der großen Schrift passen in eine Zeile', () => {
    expect(textWidth('1:Eingabe/Ausgabe', 'L')).toBeLessThanOrEqual(LCD_WIDTH);
    expect(LARGE_FONT.advance).toBe(11);
  });

  it('zeichnet Text, Rechtecke und Inversion', () => {
    const fb = new Framebuffer();
    fb.render({ ops: [{ kind: 'text', x: 0, y: 0, text: 'H', font: 'L' }] });
    expect(fb.pixels.some((p) => p === 1)).toBe(true);
    fb.render({ ops: [{ kind: 'rect', x: 2, y: 2, w: 3, h: 3, fill: true }] });
    expect(fb.get(3, 3)).toBe(true);
    fb.invertRect(2, 2, 1, 1);
    expect(fb.get(2, 2)).toBe(false);
  });

  it('rechtsbündiger Text endet am Anker', () => {
    const fb = new Framebuffer();
    fb.render({ ops: [{ kind: 'text', x: 191, y: 40, text: '9', font: 'L', align: 'right' }] });
    let maxX = -1;
    for (let y = 40; y < 56; y++) for (let x = 0; x < 192; x++) if (fb.get(x, y)) maxX = Math.max(maxX, x);
    expect(maxX).toBeLessThanOrEqual(191);
    expect(maxX).toBeGreaterThan(175);
  });

  it('Textabbild sortiert nach Zeilen und markiert Inversion', () => {
    expect(
      sceneText({
        ops: [
          { kind: 'text', x: 0, y: 16, text: 'b', font: 'L' },
          { kind: 'text', x: 0, y: 0, text: 'a', font: 'L', invert: true },
        ],
      }),
    ).toEqual(['[a]', 'b']);
  });

  it('Hauptmenü und Statusleiste lassen sich rastern', () => {
    const calc = press(newCalc(), 'SHIFT', 'MENU');
    const frame = calc.render();
    const status = new Framebuffer(LCD_WIDTH, STATUS_HEIGHT);
    renderStatus(status, frame.status);
    expect(status.pixels.some((p) => p === 1)).toBe(true);
    press(calc, 'AC', 'MENU');
    const fb = new Framebuffer();
    fb.render(calc.render().scene);
    expect(fb.pixels.filter((p) => p === 1).length).toBeGreaterThan(300);
  });
});
