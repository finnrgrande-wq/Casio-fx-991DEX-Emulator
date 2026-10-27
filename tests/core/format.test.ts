import { describe, expect, it } from 'vitest';
import { displayToString, formatEng, formatNumber, OverflowError, round15 } from '../../src/core/format/number';
import type { NumberFormat } from '../../src/calculator/state';

const norm1: NumberFormat = { kind: 'norm', n: 1 };
const norm2: NumberFormat = { kind: 'norm', n: 2 };
const fix = (n: number): NumberFormat => ({ kind: 'fix', n });
const sci = (n: number): NumberFormat => ({ kind: 'sci', n });
const f = (x: number, fmt: NumberFormat = norm1, thousands = false) =>
  displayToString(formatNumber(x, fmt, { thousands }));
const eng = (x: number, shift = 0) => displayToString(formatEng(x, shift));

describe('round15', () => {
  it('entfernt Gleitkomma-Artefakte', () => {
    expect(round15(0.1 + 0.2)).toBe(0.3);
    expect(round15((1 / 3) * 3)).toBe(1);
    expect(round15(1 - 0.9)).toBe(0.1);
  });
  it('rundet auf 15 signifikante Stellen', () => {
    expect(round15(123456789012345.6)).toBe(123456789012346);
    expect(round15(-123456789012345.6)).toBe(-123456789012346);
    expect(round15(Math.PI)).toBe(3.14159265358979);
  });
  it('halb weg von Null', () => {
    expect(round15(1234567890123455)).toBe(1234567890123460);
    expect(round15(-1234567890123455)).toBe(-1234567890123460);
  });
  it('Null, -0 und Nicht-Endliches', () => {
    expect(Object.is(round15(0), 0)).toBe(true);
    expect(Object.is(round15(-0), 0)).toBe(true);
    expect(round15(Infinity)).toBe(Infinity);
    expect(round15(NaN)).toBeNaN();
  });
  it('lässt kurze Zahlen unverändert', () => {
    expect(round15(1.5)).toBe(1.5);
    expect(round15(-2e-50)).toBe(-2e-50);
  });
});

describe('Norm 1', () => {
  it('Null und ganze Zahlen', () => {
    expect(f(0)).toBe('0');
    expect(f(-0)).toBe('0');
    expect(f(5)).toBe('5');
    expect(f(-42)).toBe('-42');
    expect(f(9999999999)).toBe('9999999999');
  });
  it('Artefakte verschwinden', () => {
    expect(f(0.1 + 0.2)).toBe('0,3');
    expect(f((1 / 3) * 3)).toBe('1');
  });
  it('10 signifikante Stellen', () => {
    expect(f(1 / 7)).toBe('0,1428571429');
    expect(f(2 * Math.PI)).toBe('6,283185307');
    expect(f(-1 / 7)).toBe('-0,1428571429');
    expect(f(1.5)).toBe('1,5');
  });
  it('Exponentform bei kleinen Zahlen', () => {
    expect(f(1 / 200)).toBe('5×10^-3');
    expect(formatNumber(1 / 200, norm1)).toEqual({ mantissa: '5', exponent: -3 });
    expect(f(-1 / 200)).toBe('-5×10^-3');
    expect(f(0.00123456)).toBe('1,23456×10^-3');
  });
  it('Exponentform bei großen Zahlen', () => {
    expect(formatNumber(123456789012, norm1)).toEqual({ mantissa: '1,23456789', exponent: 11 });
    expect(f(-123456789012)).toBe('-1,23456789×10^11');
  });
  it('Grenzwerte', () => {
    expect(f(0.01)).toBe('0,01');
    expect(f(0.0099)).toBe('9,9×10^-3');
    expect(f(1e10)).toBe('1×10^10');
    expect(f(1e-99)).toBe('1×10^-99');
    expect(f(9.99e99)).toBe('9,99×10^99');
  });
  it('Übertrag beim Runden', () => {
    expect(formatNumber(9999999999.6, norm1)).toEqual({ mantissa: '1', exponent: 10 });
    expect(f(9.9999999995)).toBe('10');
    expect(f(9.9999999994)).toBe('9,999999999');
    expect(f(-9.9999999995)).toBe('-10');
  });
  it('Form wird nach dem Runden neu bestimmt', () => {
    expect(f(0.0099999999996)).toBe('0,01');
    expect(f(0.0099999999996, norm2)).toBe('0,01');
  });
  it('Rundung halb weg von Null auf der 10. Stelle', () => {
    expect(f(1.0000000005)).toBe('1,000000001');
    expect(f(-1.0000000005)).toBe('-1,000000001');
  });
});

describe('Norm 2', () => {
  it('kleine Zahlen bleiben länger dezimal', () => {
    expect(f(1 / 200, norm2)).toBe('0,005');
    expect(f(1e-9, norm2)).toBe('0,000000001');
    expect(f(-0.005, norm2)).toBe('-0,005');
  });
  it('Exponentform unter 1e-9 und ab 1e10', () => {
    expect(f(9.99e-10, norm2)).toBe('9,99×10^-10');
    expect(f(1e10, norm2)).toBe('1×10^10');
    expect(f(9999999999, norm2)).toBe('9999999999');
  });
  it('Null', () => {
    expect(f(0, norm2)).toBe('0');
  });
});

describe('Fix', () => {
  it('feste Nachkommastellen', () => {
    expect(f(100 / 7, fix(3))).toBe('14,286');
    expect(f(1.5, fix(3))).toBe('1,500');
    expect(f(5, fix(2))).toBe('5,00');
    expect(f(-100 / 7, fix(3))).toBe('-14,286');
  });
  it('Fix 0 ohne Komma, halb weg von Null', () => {
    expect(f(100 / 7, fix(0))).toBe('14');
    expect(f(0.5, fix(0))).toBe('1');
    expect(f(2.5, fix(0))).toBe('3');
    expect(f(-0.5, fix(0))).toBe('-1');
    expect(f(0, fix(0))).toBe('0');
  });
  it('Null', () => {
    expect(f(0, fix(3))).toBe('0,000');
    expect(f(1e-100, fix(3))).toBe('0,000');
  });
  it('rundet auf Null ohne Minuszeichen', () => {
    expect(f(-0.0004, fix(3))).toBe('0,000');
    expect(f(0.0004, fix(3))).toBe('0,000');
    expect(f(0.0005, fix(3))).toBe('0,001');
    expect(f(-0.0005, fix(3))).toBe('-0,001');
    expect(f(0.4, fix(0))).toBe('0');
  });
  it('Übertrag', () => {
    expect(f(0.0996, fix(3))).toBe('0,100');
    expect(f(9.9996, fix(3))).toBe('10,000');
    expect(f(99.5, fix(0))).toBe('100');
  });
  it('mehr als 10 signifikante Stellen werden nicht abgeschnitten', () => {
    expect(f(123456789.123456, fix(5))).toBe('123456789,12346');
    expect(f(1e9, fix(9))).toBe('1000000000,000000000');
  });
  it('Exponentform ab 1e10', () => {
    expect(formatNumber(1.5e12, fix(3))).toEqual({ mantissa: '1,500', exponent: 12 });
    expect(f(1.5e12, fix(0))).toBe('2×10^12');
    expect(f(-1.5e12, fix(2))).toBe('-1,50×10^12');
    expect(f(9999999999.9996, fix(3))).toBe('1,000×10^10');
  });
  it('kleine Zahlen bleiben dezimal', () => {
    expect(f(1e-50, fix(2))).toBe('0,00');
    expect(f(0.001234, fix(5))).toBe('0,00123');
  });
});

describe('Sci', () => {
  it('feste signifikante Stellen', () => {
    expect(formatNumber(1 / 7, sci(5))).toEqual({ mantissa: '1,4286', exponent: -1 });
    expect(f(12345, sci(2))).toBe('1,2×10^4');
    expect(f(-12345, sci(2))).toBe('-1,2×10^4');
  });
  it('Nullen bleiben stehen', () => {
    expect(f(1000, sci(3))).toBe('1,00×10^3');
    expect(f(5, sci(1))).toBe('5×10^0');
    expect(f(1 / 200, sci(1))).toBe('5×10^-3');
  });
  it('Sci 0 bedeutet 10 Stellen', () => {
    expect(f(1 / 7, sci(0))).toBe('1,428571429×10^-1');
    expect(f(1, sci(0))).toBe('1,000000000×10^0');
  });
  it('Übertrag', () => {
    expect(f(9.99, sci(2))).toBe('1,0×10^1');
    expect(f(99999, sci(3))).toBe('1,00×10^5');
  });
  it('Null', () => {
    expect(formatNumber(0, sci(3))).toEqual({ mantissa: '0,00', exponent: 0 });
    expect(f(0, sci(1))).toBe('0×10^0');
    expect(f(1e-100, sci(3))).toBe('0,00×10^0');
  });
});

describe('Tausendertrennung', () => {
  it('gruppiert den ganzzahligen Teil mit Apostroph', () => {
    expect(f(1234567.5, norm1, true)).toBe("1'234'567,5");
    expect(f(1000, norm1, true)).toBe("1'000");
    expect(f(999, norm1, true)).toBe('999');
    expect(f(-1234567, norm1, true)).toBe("-1'234'567");
    expect(f(123456, norm1, true)).toBe("123'456");
  });
  it('wirkt nur auf den Ganzzahlteil', () => {
    expect(f(0.1234567, norm1, true)).toBe('0,1234567');
  });
  it('auch in Fix', () => {
    expect(f(1234.5, fix(2), true)).toBe("1'234,50");
  });
  it('nicht in Exponentform', () => {
    expect(f(1.5e12, norm1, true)).toBe('1,5×10^12');
    expect(f(1.5e12, sci(3), true)).toBe('1,50×10^12');
    expect(f(1.5e12, fix(3), true)).toBe('1,500×10^12');
  });
  it('ist standardmäßig aus', () => {
    expect(f(1234567)).toBe('1234567');
  });
});

describe('Rechenbereich', () => {
  it('|x| ≥ 1e100 wirft OverflowError', () => {
    expect(() => formatNumber(1e100, norm1)).toThrow(OverflowError);
    expect(() => formatNumber(-1e100, fix(2))).toThrow(OverflowError);
    expect(() => formatNumber(1e200, sci(3))).toThrow(OverflowError);
    expect(() => formatNumber(Infinity, norm1)).toThrow(OverflowError);
    expect(() => formatNumber(NaN, norm1)).toThrow(OverflowError);
    expect(() => formatEng(1e100, 0)).toThrow(OverflowError);
  });
  it('Fehlermeldung', () => {
    expect(() => formatNumber(1e100, norm1)).toThrow('Mathem. Fehler');
  });
  it('Rundung auf 1e100 zählt als Überlauf', () => {
    expect(() => formatNumber(9.9999999999999999e99, norm1)).toThrow(OverflowError);
    expect(() => formatNumber(9.999999999999996e99, norm1)).toThrow(OverflowError);
  });
  it('|x| < 1e-99 wird zu 0', () => {
    expect(f(1e-100)).toBe('0');
    expect(f(-1e-100)).toBe('0');
    expect(f(5e-324)).toBe('0');
    expect(formatNumber(1e-100, norm1)).toEqual({ mantissa: '0' });
  });
});

describe('ENG', () => {
  it('Standard: Exponent Vielfaches von 3, 1 ≤ |m| < 1000', () => {
    expect(eng(1234)).toBe('1,234×10^3');
    expect(eng(12)).toBe('12×10^0');
    expect(eng(999)).toBe('999×10^0');
    expect(eng(0.00123)).toBe('1,23×10^-3');
    expect(eng(0.0000123)).toBe('12,3×10^-6');
    expect(eng(1.5e12)).toBe('1,5×10^12');
    expect(eng(123456)).toBe('123,456×10^3');
  });
  it('Handbuchfolge: ENG, ENG, ENG←, ENG←', () => {
    expect(eng(1234, 0)).toBe('1,234×10^3');
    expect(eng(1234, 1)).toBe('1234×10^0');
    expect(eng(1234, 0)).toBe('1,234×10^3');
    expect(eng(1234, -1)).toBe('0,001234×10^6');
    expect(eng(1234, 2)).toBe('1234000×10^-3');
  });
  it('negative Zahlen', () => {
    expect(eng(-1234)).toBe('-1,234×10^3');
    expect(eng(-1234, -1)).toBe('-0,001234×10^6');
    expect(eng(-0.00123)).toBe('-1,23×10^-3');
  });
  it('10 signifikante Stellen, Nullen am Ende entfallen', () => {
    expect(eng(1 / 7)).toBe('142,8571429×10^-3');
    expect(eng(1000)).toBe('1×10^3');
    expect(formatEng(1 / 7, 0, 4)).toEqual({ mantissa: '142,9', exponent: -3 });
  });
  it('Übertrag beim Runden', () => {
    expect(eng(999.99999999996)).toBe('1×10^3');
    expect(eng(999999999.96)).toBe('1×10^9');
  });
  it('Artefakte verschwinden', () => {
    expect(eng(0.1 + 0.2)).toBe('300×10^-3');
  });
  it('Null', () => {
    expect(eng(0)).toBe('0');
    expect(eng(0, 2)).toBe('0');
    expect(eng(1e-100)).toBe('0');
  });
});

describe('displayToString', () => {
  it('mit und ohne Exponent', () => {
    expect(displayToString({ mantissa: '1,234', exponent: 12 })).toBe('1,234×10^12');
    expect(displayToString({ mantissa: '-0,005' })).toBe('-0,005');
    expect(displayToString({ mantissa: '5', exponent: 0 })).toBe('5×10^0');
  });
});
