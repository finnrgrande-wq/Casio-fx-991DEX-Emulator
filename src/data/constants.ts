// Wissenschaftliche Konstanten (SHIFT 7 CONST) – 47 Werte, CODATA 2010
// Reihenfolge und Kategorien wie im Menü des fx-991DE X (Referenzblatt).

export interface PhysConst { symbol: string; name: string; value: number; unit: string }
export interface ConstCategory { title: string; items: PhysConst[] }

const c = (symbol: string, name: string, value: number, unit: string): PhysConst =>
  ({ symbol, name, value, unit });

export const CONST_CATEGORIES: ConstCategory[] = [
  {
    title: 'Univers. Konst.',
    items: [
      c('h', 'Planck-Konstante', 6.62606957e-34, 'J s'),
      c('ħ', 'Reduzierte Planck-Konstante (Dirac)', 1.054571726e-34, 'J s'),
      c('c0', 'Lichtgeschwindigkeit im Vakuum', 299792458, 'm/s'),
      c('ε0', 'Elektrische Feldkonstante', 8.854187817e-12, 'F/m'),
      c('μ0', 'Magnetische Feldkonstante', 1.25663706143592e-6, 'N/A²'),
      c('Z0', 'Wellenwiderstand des Vakuums', 376.730313461, 'Ω'),
      c('G', 'Gravitationskonstante', 6.67384e-11, 'm³/(kg s²)'),
      c('lP', 'Planck-Länge', 1.616199e-35, 'm'),
      c('tP', 'Planck-Zeit', 5.39106e-44, 's'),
    ],
  },
  {
    title: 'E-magn. Konst.',
    items: [
      c('μN', 'Kernmagneton', 5.05078353e-27, 'J/T'),
      c('μB', 'Bohrsches Magneton', 9.27400968e-24, 'J/T'),
      c('e', 'Elementarladung', 1.602176565e-19, 'C'),
      c('Φ0', 'Magnetisches Flussquantum', 2.067833758e-15, 'Wb'),
      c('G0', 'Leitwertquantum', 7.7480917346e-5, 'S'),
      c('KJ', 'Josephson-Konstante', 4.83597870e14, 'Hz/V'),
      c('RK', 'Von-Klitzing-Konstante', 25812.8074434, 'Ω'),
    ],
  },
  {
    title: 'Atom./Nuk.Konst',
    items: [
      c('mp', 'Protonenmasse', 1.672621777e-27, 'kg'),
      c('mn', 'Neutronenmasse', 1.674927351e-27, 'kg'),
      c('me', 'Elektronenmasse', 9.10938291e-31, 'kg'),
      c('mμ', 'Myonenmasse', 1.883531475e-28, 'kg'),
      c('a0', 'Bohrscher Radius', 5.2917721092e-11, 'm'),
      c('α', 'Feinstrukturkonstante', 7.2973525698e-3, ''),
      c('re', 'Klassischer Elektronenradius', 2.8179403267e-15, 'm'),
      c('λC', 'Compton-Wellenlänge (Elektron)', 2.4263102389e-12, 'm'),
      c('γp', 'Gyromagnetisches Verhältnis (Proton)', 2.675222005e8, 'rad/(s T)'),
      c('λCp', 'Compton-Wellenlänge (Proton)', 1.32140985623e-15, 'm'),
      c('λCn', 'Compton-Wellenlänge (Neutron)', 1.31959090608e-15, 'm'),
      c('R∞', 'Rydberg-Konstante', 10973731.568539, '1/m'),
      c('μp', 'Magnetisches Moment des Protons', 1.410606743e-26, 'J/T'),
      c('μe', 'Magnetisches Moment des Elektrons', -9.28476430e-24, 'J/T'),
      c('μn', 'Magnetisches Moment des Neutrons', -9.6623647e-27, 'J/T'),
      c('μμ', 'Magnetisches Moment des Myons', -4.49044807e-26, 'J/T'),
      c('mτ', 'Tau-Masse', 3.16747e-27, 'kg'),
    ],
  },
  {
    title: 'Phys/Chem.Konst',
    items: [
      c('u', 'Atomare Masseneinheit', 1.660538921e-27, 'kg'),
      c('F', 'Faraday-Konstante', 96485.3365, 'C/mol'),
      c('NA', 'Avogadro-Konstante', 6.02214129e23, '1/mol'),
      c('k', 'Boltzmann-Konstante', 1.3806488e-23, 'J/K'),
      c('Vm', 'Molares Volumen idealer Gase (273,15 K; 101,325 kPa)', 22.413968e-3, 'm³/mol'),
      c('R', 'Universelle Gaskonstante', 8.3144621, 'J/(mol K)'),
      c('c1', 'Erste Strahlungskonstante', 3.74177153e-16, 'W m²'),
      c('c2', 'Zweite Strahlungskonstante', 1.4387770e-2, 'm K'),
      c('σ', 'Stefan-Boltzmann-Konstante', 5.670373e-8, 'W/(m² K⁴)'),
    ],
  },
  {
    title: 'Übernomm. Werte',
    items: [
      c('g', 'Normfallbeschleunigung', 9.80665, 'm/s²'),
      c('atm', 'Normatmosphäre', 101325, 'Pa'),
      c('RK-90', 'Von-Klitzing-Konstante (konv. Wert 1990)', 25812.807, 'Ω'),
      c('KJ-90', 'Josephson-Konstante (konv. Wert 1990)', 4.835979e14, 'Hz/V'),
    ],
  },
  {
    title: 'Andere',
    items: [
      c('t', 'Celsius-Temperatur des Nullpunkts (0 °C in K)', 273.15, 'K'),
    ],
  },
];
