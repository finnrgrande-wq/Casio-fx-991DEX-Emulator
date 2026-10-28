// Bildschirm je Anwendung. Noch fehlende Anwendungen zeigen einen Platzhalter.

import type { ModeId } from '../keys/keymap';
import { BaseNScreen } from './basen/baseNScreen';
import { CalcScreen } from './calc/calcScreen';
import { ComplexScreen } from './complex/complexScreen';
import { DistScreen } from './dist/distScreen';
import { EquationScreen } from './equation/equationScreen';
import { InequalityScreen } from './inequality/inequalityScreen';
import { RatioScreen } from './ratio/ratioScreen';
import { VerifyScreen } from './verify/verifyScreen';
import type { Host, Screen } from './screen';
import { SheetScreen } from './sheet/sheetScreen';
import { StatScreen } from './stat/statScreen';
import { TableScreen } from './table/tableScreen';
import { TensorScreen } from './tensor/tensorScreen';

export const SCREENS: Partial<Record<ModeId, (host: Host) => Screen>> = {
  calc: (host) => new CalcScreen(host),
  complex: (host) => new ComplexScreen(host),
  basen: (host) => new BaseNScreen(host),
  sheet: (host) => new SheetScreen(host),
  table: (host) => new TableScreen(host),
  equation: (host) => new EquationScreen(host),
  inequality: (host) => new InequalityScreen(host),
  verify: (host) => new VerifyScreen(host),
  ratio: (host) => new RatioScreen(host),
  dist: (host) => new DistScreen(host),
  stat: (host) => new StatScreen(host),
  matrix: (host) => new TensorScreen(host, 'mat'),
  vector: (host) => new TensorScreen(host, 'vec'),
};
