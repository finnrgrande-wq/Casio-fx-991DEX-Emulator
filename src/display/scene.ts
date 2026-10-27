// Ein Bildschirm beschreibt seinen Inhalt als Liste von Zeichenoperationen (Scene).
// Daraus entstehen der Framebuffer für das LCD und ein Textabbild für Tests.

import type { Bitmap } from './types';

export type FontId = 'L' | 'S';

export type DrawOp =
  | { kind: 'text'; x: number; y: number; text: string; font: FontId; invert?: boolean; align?: 'left' | 'right' }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: boolean; invert?: boolean; erase?: boolean }
  | { kind: 'bitmap'; x: number; y: number; bitmap: Bitmap; invert?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

export type AngleUnit = 'D' | 'R' | 'G';

/** Segment-Indikatoren in der Statuszeile über der Punktmatrix. */
export interface StatusFlags {
  shift: boolean;
  alpha: boolean;
  sto: boolean;
  m: boolean;
  math: boolean;
  angle: AngleUnit;
  fix: boolean;
  sci: boolean;
  prefix: boolean;
  complex: 'i' | '∠' | null;
  disp: boolean;
  up: boolean;
  down: boolean;
}

export interface Scene {
  ops: DrawOp[];
  /** Status-Anteile, die der Bildschirm selbst bestimmt (Scrollpfeile, Zwischenergebnis). */
  status?: Partial<Pick<StatusFlags, 'up' | 'down' | 'disp' | 'sto'>>;
  /** Position des blinkenden Cursors (x, y, Höhe) – oder null. */
  cursor?: { x: number; y: number; h: number } | null;
}

export const emptyScene = (): Scene => ({ ops: [] });

/**
 * Textabbild einer Scene: alle Textoperationen nach Zeile (y) gruppiert, innerhalb der Zeile nach x sortiert.
 * Invertierter Text wird in [eckige Klammern] gesetzt.
 */
export function sceneText(scene: Scene): string[] {
  const texts = scene.ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text');
  const rows = new Map<number, typeof texts>();
  for (const t of texts) {
    const row = rows.get(t.y) ?? [];
    row.push(t);
    rows.set(t.y, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((t) => (t.invert ? `[${t.text}]` : t.text))
        .join(' '),
    );
}
