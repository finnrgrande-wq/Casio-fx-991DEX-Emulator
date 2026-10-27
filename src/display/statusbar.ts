// Statusleiste: Segment-Indikatoren über der Punktmatrix (S, A, M, STO, √▫, D/R/G, FIX, SCI, E, i/∠, Zwischenergebnis, ▲▼).

import type { Framebuffer } from './framebuffer';
import type { StatusFlags } from './scene';

export const STATUS_HEIGHT = 8;

/** Indikator für ein Zwischenergebnis bei Mehrfachanweisungen (gefülltes Kästchen mit „II“). */
const DISP_ICON = [
  '#######',
  '##.#.##',
  '##.#.##',
  '##.#.##',
  '##.#.##',
  '##.#.##',
  '#######',
];

/** Zeichnet alle aktiven Indikatoren an festen Positionen wie die Segmente des Originals. */
export function renderStatus(fb: Framebuffer, s: StatusFlags): void {
  const boxed = (x: number, ch: string) => {
    fb.fillRect(x - 1, 0, 7, STATUS_HEIGHT);
    fb.text(x, 0, ch, 'S', true);
  };
  if (s.shift) boxed(0, 'S');
  if (s.alpha) boxed(8, 'A');
  if (s.m) fb.text(17, 0, 'M', 'S');
  if (s.sto) fb.text(25, 0, '→𝑥', 'S');
  if (s.math) fb.text(40, 0, '√□', 'S');
  boxed(54, s.angle);
  if (s.fix) fb.text(64, 0, 'FIX', 'S');
  if (s.sci) fb.text(64, 0, 'SCI', 'S');
  if (s.prefix) boxed(82, 'E');
  if (s.complex) fb.text(92, 0, s.complex === 'i' ? 'i' : '∠', 'S');
  if (s.disp) fb.bitmap(102, 0, DISP_ICON);
  if (s.down) fb.text(140, 0, '▼', 'S');
  if (s.up) fb.text(147, 0, '▲', 'S');
}
