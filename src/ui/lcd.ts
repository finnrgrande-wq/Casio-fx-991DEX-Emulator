// Zeichnet Framebuffer und Statusleiste als Punktmatrix auf Canvas-Elemente.

import { Framebuffer } from '../display/framebuffer';
import { renderStatus, STATUS_HEIGHT } from '../display/statusbar';
import type { Frame } from '../calculator/calculator';
import { LCD_WIDTH } from '../display/types';

const DOT_ON = [24, 36, 30] as const;

export class LcdView {
  readonly element: HTMLElement;
  private readonly lcdCanvas = document.createElement('canvas');
  private readonly statusCanvas = document.createElement('canvas');
  private readonly fb = new Framebuffer();
  private readonly statusFb = new Framebuffer(LCD_WIDTH, STATUS_HEIGHT);
  private frame: Frame | undefined;
  private cursorVisible = true;
  private blinkTimer: ReturnType<typeof setInterval> | undefined;
  private contrast = 5;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bezel';
    const glass = document.createElement('div');
    glass.className = 'lcd';
    this.statusCanvas.className = 'status';
    this.statusCanvas.setAttribute('aria-hidden', 'true');
    this.lcdCanvas.setAttribute('role', 'img');
    glass.append(this.statusCanvas, this.lcdCanvas);
    this.element.append(glass);
    new ResizeObserver(() => this.draw()).observe(glass);
  }

  show(frame: Frame, contrast: number): void {
    this.frame = frame;
    this.contrast = contrast;
    // Nach jeder Eingabe ist der Cursor sofort sichtbar, dann blinkt er.
    this.cursorVisible = true;
    if (this.blinkTimer) clearInterval(this.blinkTimer);
    this.blinkTimer = frame.scene.cursor
      ? setInterval(() => {
          this.cursorVisible = !this.cursorVisible;
          this.draw();
        }, 500)
      : undefined;
    this.draw();
  }

  private draw(): void {
    const frame = this.frame;
    if (!frame) return;
    this.fb.clear();
    this.statusFb.clear();
    if (frame.on) {
      this.fb.render(frame.scene);
      const c = frame.scene.cursor;
      if (c && this.cursorVisible) this.fb.fillRect(c.x, c.y, 2, c.h);
      renderStatus(this.statusFb, frame.status);
    }
    this.lcdCanvas.setAttribute('aria-label', frame.on ? 'Display' : 'Display aus');
    paint(this.lcdCanvas, this.fb, this.contrast, true);
    paint(this.statusCanvas, this.statusFb, this.contrast, false);
  }
}

/** Malt einen Framebuffer als Punkte; showOff zeigt die ausgeschalteten Punkte leicht an. */
function paint(canvas: HTMLCanvasElement, fb: Framebuffer, contrast: number, showOff: boolean): void {
  const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || LCD_WIDTH * 2;
  const dpr = globalThis.devicePixelRatio || 1;
  const pitch = Math.max(1, (cssWidth * dpr) / fb.width);
  const w = Math.round(pitch * fb.width);
  const h = Math.round(pitch * fb.height);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.aspectRatio = `${fb.width} / ${fb.height}`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const dot = pitch * 0.86;
  // Kontrast 1–9 wie im SETUP; 5 ist Standard
  const alpha = Math.min(1, 0.55 + contrast * 0.07);
  const on = `rgba(${DOT_ON.join(',')},${alpha})`;
  const off = 'rgba(40,60,40,0.045)';
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const isOn = fb.pixels[y * fb.width + x] === 1;
      if (!isOn && !showOff) continue;
      ctx.fillStyle = isOn ? on : off;
      ctx.fillRect(x * pitch, y * pitch, dot, dot);
    }
  }
}

