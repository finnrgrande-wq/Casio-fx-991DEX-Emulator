import { describe, expect, it } from 'vitest';
import { MENU_ICONS, MENU_ICON_H, MENU_ICON_W } from '../../src/display/icons/menuIcons';

const IDS = [
  'calc', 'complex', 'basen', 'matrix', 'vector', 'stat', 'dist',
  'sheet', 'table', 'equation', 'inequality', 'verify', 'ratio',
] as const;

describe('MENU_ICONS', () => {
  it('has exactly the 13 mode ids', () => {
    expect(Object.keys(MENU_ICONS).sort()).toEqual([...IDS].sort());
  });

  it('uses 32x16 dimensions', () => {
    expect(MENU_ICON_W).toBe(32);
    expect(MENU_ICON_H).toBe(16);
  });

  for (const id of IDS) {
    describe(id, () => {
      const bmp = MENU_ICONS[id];
      it('has 16 rows', () => expect(bmp).toHaveLength(MENU_ICON_H));
      it('has 32 columns in every row', () => {
        for (const row of bmp) expect(row).toHaveLength(MENU_ICON_W);
      });
      it("contains only '#' and '.'", () => {
        for (const row of bmp) expect(row).toMatch(/^[#.]+$/);
      });
      it('is not empty', () => {
        expect(bmp.join('').includes('#')).toBe(true);
      });
    });
  }

  it('all icons are distinct', () => {
    const set = new Set(IDS.map((id) => MENU_ICONS[id].join('|')));
    expect(set.size).toBe(IDS.length);
  });
});
