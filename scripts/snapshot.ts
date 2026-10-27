// Entwicklerhilfe: rendert das LCD nach einer Tastenfolge als PNG.
// Aufruf: npx vite-node scripts/snapshot.ts -- <ausgabe.png> <Taste> <Taste> …
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import { Calculator } from '../src/calculator/calculator';
import { Framebuffer } from '../src/display/framebuffer';
import { renderStatus, STATUS_HEIGHT } from '../src/display/statusbar';
import type { KeyId } from '../src/keys/keymap';
import { LCD_HEIGHT, LCD_WIDTH } from '../src/display/types';

const [out, ...keys] = process.argv.slice(2).filter((a) => a !== '--');
const mem: Record<string, string> = {};
const calc = new Calculator({ store: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v) } });
for (const k of keys) calc.press(k as KeyId);
const frame = calc.render();
const status = new Framebuffer(LCD_WIDTH, STATUS_HEIGHT);
renderStatus(status, frame.status);
const fb = new Framebuffer();
fb.render(frame.scene);
const c = frame.scene.cursor;
if (c) fb.fillRect(c.x, c.y, 2, c.h);

const S = 5;
const H = STATUS_HEIGHT + 2 + LCD_HEIGHT;
const canvas = createCanvas((LCD_WIDTH + 4) * S, (H + 4) * S);
const g = canvas.getContext('2d');
g.fillStyle = '#c7d3c0';
g.fillRect(0, 0, canvas.width, canvas.height);
const plot = (buf: Framebuffer, oy: number) => {
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      g.fillStyle = buf.get(x, y) ? '#18241e' : 'rgba(40,60,40,0.06)';
      g.fillRect((x + 2) * S, (y + oy + 2) * S, S - 1, S - 1);
    }
};
plot(status, 0);
plot(fb, STATUS_HEIGHT + 2);
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('geschrieben:', out);
