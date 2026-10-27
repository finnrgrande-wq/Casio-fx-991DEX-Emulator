// Bildschirm je Anwendung. Noch fehlende Anwendungen zeigen einen Platzhalter.

import type { ModeId } from '../keys/keymap';
import { CalcScreen } from './calc/calcScreen';
import { DistScreen } from './dist/distScreen';
import { EquationScreen } from './equation/equationScreen';
import type { Host, Screen } from './screen';
import { TableScreen } from './table/tableScreen';
import { TensorScreen } from './tensor/tensorScreen';

export const SCREENS: Partial<Record<ModeId, (host: Host) => Screen>> = {
  calc: (host) => new CalcScreen(host),
  table: (host) => new TableScreen(host),
  equation: (host) => new EquationScreen(host),
  dist: (host) => new DistScreen(host),
  matrix: (host) => new TensorScreen(host, 'mat'),
  vector: (host) => new TensorScreen(host, 'vec'),
};
