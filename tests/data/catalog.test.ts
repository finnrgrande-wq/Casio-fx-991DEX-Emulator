import { describe, expect, it } from 'vitest';
import { CONST_CATEGORIES } from '../../src/data/constants';
import { CONV_CATEGORIES } from '../../src/data/conversions';

const allConsts = CONST_CATEGORIES.flatMap((c) => c.items);
const find = (symbol: string) => allConsts.find((c) => c.symbol === symbol)!;
const conv = (label: string) => {
  for (const cat of CONV_CATEGORIES) {
    const hit = cat.items.find((i) => i.label === label);
    if (hit) return hit;
  }
  throw new Error(`Umwandlung fehlt: ${label}`);
};

describe('Konstanten', () => {
  it('Kategorien wie im Gerätemenü', () => {
    expect(CONST_CATEGORIES.map((c) => c.title)).toEqual([
      'Univers. Konst.', 'E-magn. Konst.', 'Atom./Nuk.Konst',
      'Phys/Chem.Konst', 'Übernomm. Werte', 'Andere',
    ]);
    expect(CONST_CATEGORIES.map((c) => c.items.length)).toEqual([9, 7, 17, 9, 4, 1]);
  });
  it('47 Konstanten', () => {
    expect(allConsts).toHaveLength(47);
  });
  it('Symbole sind je Kategorie (und global) eindeutig', () => {
    for (const cat of CONST_CATEGORIES) {
      const syms = cat.items.map((i) => i.symbol);
      expect(new Set(syms).size).toBe(syms.length);
    }
    expect(new Set(allConsts.map((c) => c.symbol)).size).toBe(47);
  });
  it('Werte endlich und ungleich null, Texte gefüllt', () => {
    for (const c of allConsts) {
      expect(Number.isFinite(c.value)).toBe(true);
      expect(c.value).not.toBe(0);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });
  it('Stichproben (CODATA 2010)', () => {
    expect(find('c0').value).toBe(299792458);
    expect(find('NA').value).toBe(6.02214129e23);
    expect(find('h').value).toBe(6.62606957e-34);
    expect(find('e').value).toBe(1.602176565e-19);
    expect(find('k').value).toBe(1.3806488e-23);
    expect(find('me').value).toBe(9.10938291e-31);
    expect(find('g').value).toBe(9.80665);
    expect(find('atm').value).toBe(101325);
    expect(find('t').value).toBe(273.15);
  });
  it('Konsistenz: ħ = h/2π, Z0 = μ0·c0, μ0·ε0·c0² = 1', () => {
    expect(find('ħ').value).toBeCloseTo(find('h').value / (2 * Math.PI), 42);
    expect(find('Z0').value / (find('μ0').value * find('c0').value)).toBeCloseTo(1, 8);
    expect(find('μ0').value * find('ε0').value * find('c0').value ** 2).toBeCloseTo(1, 8);
  });
});

describe('Umwandlungen', () => {
  it('Kategorien in Gerätereihenfolge', () => {
    expect(CONV_CATEGORIES.map((c) => c.title)).toEqual([
      'Länge', 'Fläche', 'Volumen', 'Winkel', 'Masse', 'Zeit', 'Geschwindigkeit',
      'Beschleunigung', 'Drehmoment', 'Kraft', 'Druck', 'Energie', 'Leistung',
      'Wärmedurchfluss', 'Temperatur', 'Spezif. Wärme', 'Viskosität',
      'Kinem. Viskosit', 'Magnetismus', 'Lichtstärke', 'Radioaktivität',
    ]);
  });
  it('Anzahl je Kategorie wie im Referenzblatt', () => {
    expect(CONV_CATEGORIES.map((c) => c.items.length)).toEqual(
      [26, 14, 20, 2, 12, 8, 6, 2, 2, 6, 18, 16, 2, 2, 2, 2, 2, 2, 8, 4, 8],
    );
  });
  it('Labels pro Kategorie eindeutig', () => {
    for (const cat of CONV_CATEGORIES) {
      const labels = cat.items.map((i) => i.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it('jedes Paar ist zueinander invers', () => {
    for (const cat of CONV_CATEGORIES) {
      expect(cat.items.length % 2).toBe(0);
      for (let i = 0; i < cat.items.length; i += 2) {
        const a = cat.items[i]!;
        const b = cat.items[i + 1]!;
        expect(a.from).toBe(b.to);
        expect(a.to).toBe(b.from);
        expect(a.label).toBe(`${a.from}▸${a.to}`);
        for (const x of [0.5, 1, 12.5, 100, -40, 1234.5678]) {
          const y = a.convert(x);
          expect(Number.isFinite(y)).toBe(true);
          expect(b.convert(y)).toBeCloseTo(x, 8 - Math.max(0, Math.floor(Math.log10(Math.abs(x) + 1))));
          expect(a.convert(b.convert(x))).toBeCloseTo(x, 8 - Math.max(0, Math.floor(Math.log10(Math.abs(x) + 1))));
        }
      }
    }
  });
  it('Abnahme-Beispiele', () => {
    expect(conv('ft▸m').convert(12.5)).toBe(3.81);
    expect(conv('cm▸in').convert(5)).toBeCloseTo(1.968503937, 9);
    expect(conv('°C▸°F').convert(100)).toBe(212);
    expect(conv('°F▸°C').convert(212)).toBe(100);
    expect(conv('°F▸°C').convert(-40)).toBe(-40);
  });
  it('weitere Stichproben', () => {
    expect(conv('lb▸kg').convert(1)).toBe(0.45359237);
    expect(conv('atm▸Pa').convert(1)).toBe(101325);
    expect(conv('km/h▸m/s').convert(36)).toBe(10);
    expect(conv('kW·h▸J').convert(1)).toBe(3.6e6);
    expect(conv('hp▸kW').convert(1)).toBeCloseTo(0.745699872, 9);
    expect(conv('J▸cal').convert(4.1855)).toBeCloseTo(1, 12);
    expect(conv('r▸rad').convert(1)).toBeCloseTo(2 * Math.PI, 12);
  });
});
