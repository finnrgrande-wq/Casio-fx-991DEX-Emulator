// Platzhalter für Anwendungen, die in späteren Meilensteinen umgesetzt werden.

import type { ModeId } from '../keys/keymap';
import type { Scene } from '../display/scene';
import { modeInfo } from './registry';
import type { Screen } from './screen';

const MILESTONE: Record<ModeId, number> = {
  calc: 2, complex: 8, basen: 8, matrix: 7, vector: 7, stat: 6, dist: 6,
  sheet: 8, table: 5, equation: 5, inequality: 8, verify: 8, ratio: 8,
};

export class PlaceholderScreen implements Screen {
  constructor(private readonly mode: ModeId) {}

  handle(): boolean {
    return false;
  }

  render(): Scene {
    if (this.mode === 'calc') {
      // Leere Eingabezeile mit Cursor, wie nach dem Einschalten
      return { ops: [], cursor: { x: 0, y: 1, h: 14 } };
    }
    return {
      ops: [
        { kind: 'text', x: 0, y: 0, text: modeInfo(this.mode).title, font: 'L' },
        { kind: 'text', x: 0, y: 24, text: `Folgt in Meilenstein ${MILESTONE[this.mode]}.`, font: 'S' },
        { kind: 'text', x: 0, y: 36, text: 'MENU: andere Anwendung', font: 'S' },
      ],
    };
  }
}
