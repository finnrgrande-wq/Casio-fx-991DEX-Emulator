// Anwendung 7 „Verteilungsfkt.“: Verteilungstypen, Parameter und dauerhafte Daten.

import {
  binomialCdf, binomialPdf, inverseNormal, normalCdf, normalPdf, poissonCdf, poissonPdf,
} from '../../core/dist/distributions';
import type { SerializedValue } from '../../core/value';

export type DistType = 'normPdf' | 'normCdf' | 'invNorm' | 'binPdf' | 'binCdf' | 'poiPdf' | 'poiCdf';
export type ParamKey = 'x' | 'k' | 'lower' | 'upper' | 'area' | 'sigma' | 'mu' | 'n' | 'p' | 'lambda';

export interface DistInfo {
  id: DistType;
  /** Name im Typmenü und als Titel der Bildschirme. */
  name: string;
  /** Abfragereihenfolge der Variablen. */
  params: readonly ParamKey[];
  /** Beschriftung des Einzelergebnisses. */
  label: string;
  /** Nur Binomial/Poisson erlauben k als Liste; Titel in zwei Zeilen neben der Liste. */
  list?: readonly [string, string];
}

export const DIST_TYPES: readonly DistInfo[] = [
  { id: 'normPdf', name: 'Normal-Dichte', params: ['x', 'sigma', 'mu'], label: 'f=' },
  { id: 'normCdf', name: 'Kumul. Normal-V', params: ['lower', 'upper', 'sigma', 'mu'], label: 'P=' },
  { id: 'invNorm', name: 'Inv. Normal-V.', params: ['area', 'sigma', 'mu'], label: 'xInv=' },
  { id: 'binPdf', name: 'Binomial-Dichte', params: ['k', 'n', 'p'], label: 'P=', list: ['Binomial', 'Dichte'] },
  { id: 'binCdf', name: 'Kumul. Binom.-V', params: ['k', 'n', 'p'], label: 'P=', list: ['Kumul.', 'Binom.-V'] },
  { id: 'poiPdf', name: 'Poisson-Dichte', params: ['k', 'lambda'], label: 'P=', list: ['Poisson', 'Dichte'] },
  { id: 'poiCdf', name: 'Kumul.Poisson-V', params: ['k', 'lambda'], label: 'P=', list: ['Kumul.', 'Poisson-V'] },
];

export const distInfo = (id: DistType): DistInfo => DIST_TYPES.find((t) => t.id === id)!;

/** Beschriftung in der Parameterzeile (kurze Symbole werden eingerückt). */
export const PARAM_LABEL: Readonly<Record<ParamKey, string>> = {
  x: '𝑥', k: 'k', lower: 'Untere', upper: 'Obere', area: 'Fläche', sigma: 'σ', mu: 'μ', n: 'n', p: 'p', lambda: 'μ',
};

const DEFAULTS: Readonly<Record<ParamKey, number>> = {
  x: 0, k: 0, lower: 0, upper: 0, area: 0, sigma: 1, mu: 0, n: 0, p: 0, lambda: 0,
};

/** Höchstzahl der k-Werte im Listenbildschirm. */
export const MAX_ROWS = 45;

export interface DistData {
  type: DistType;
  asList: boolean;
  params: Partial<Record<ParamKey, SerializedValue>>;
  /** k-Werte der Liste; leere Zellen sind null. */
  list: (SerializedValue | null)[];
}

export const defaultParam = (key: ParamKey): SerializedValue => ({ k: 'f', x: DEFAULTS[key] });

/** Liest die gespeicherten Daten (tolerant gegenüber fremdem JSON) und legt sie bei Bedarf an. */
export function loadData(modeData: Record<string, unknown>): DistData {
  const raw: Partial<DistData> = modeData.dist && typeof modeData.dist === 'object' ? modeData.dist : {};
  const data: DistData = {
    type: DIST_TYPES.find((t) => t.id === raw.type)?.id ?? 'normPdf',
    asList: raw.asList === true,
    params: raw.params && typeof raw.params === 'object' ? raw.params : {},
    list: Array.isArray(raw.list) ? raw.list.slice(0, MAX_ROWS) : [],
  };
  modeData.dist = data;
  return data;
}

/** Wahrscheinlichkeit bzw. Quantil; wirft DistError außerhalb des Definitionsbereichs. */
export function evaluate(type: DistType, get: (key: ParamKey) => number): number {
  switch (type) {
    case 'normPdf': return normalPdf(get('x'), get('sigma'), get('mu'));
    case 'normCdf': return normalCdf(get('lower'), get('upper'), get('sigma'), get('mu'));
    case 'invNorm': return inverseNormal(get('area'), get('sigma'), get('mu'));
    case 'binPdf': return binomialPdf(get('k'), get('n'), get('p'));
    case 'binCdf': return binomialCdf(get('k'), get('n'), get('p'));
    case 'poiPdf': return poissonPdf(get('k'), get('lambda'));
    case 'poiCdf': return poissonCdf(get('k'), get('lambda'));
  }
}
