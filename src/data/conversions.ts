// Metrische Umwandlung (SHIFT 8 CONV) – Faktoren nach NIST SP 811 (2008)
// Reihenfolge und Kategorien wie im Menü des fx-991DE X (Referenzblatt).
// Einträge stehen paarweise: a▸b gefolgt von b▸a.

export interface Conversion { label: string; from: string; to: string; convert: (x: number) => number }
export interface ConvCategory { title: string; items: Conversion[] }

const conv = (from: string, to: string, convert: (x: number) => number): Conversion =>
  ({ label: `${from}▸${to}`, from, to, convert });

/** Paar a▸b (x·k) und b▸a (x/k). */
const pair = (a: string, b: string, k: number): Conversion[] => [
  conv(a, b, (x) => x * k),
  conv(b, a, (x) => x / k),
];

/** Paar a▸b (x/d) und b▸a (x·d) – für Faktoren wie km/h = 3,6 · m/s. */
const pairInv = (a: string, b: string, d: number): Conversion[] => [
  conv(a, b, (x) => x / d),
  conv(b, a, (x) => x * d),
];

const cat = (title: string, ...pairs: Conversion[][]): ConvCategory =>
  ({ title, items: pairs.flat() });

// US-Survey-Foot (NIST): 1 ft = 1200/3937 m
const FT_SURVEY = 1200 / 3937;
const FT = 0.3048;
const BTU_IT = 1055.05585262;
const PSI = 6894.757293168;

export const CONV_CATEGORIES: ConvCategory[] = [
  cat('Länge',
    pair('in', 'cm', 2.54),
    pair('ft', 'm', FT),
    pair('yd', 'm', 0.9144),
    pair('mile', 'km', 1.609344),
    pair('n mile', 'm', 1852),
    pair('pc', 'km', 3.085677581e13),
    pair('Å', 'm', 1e-10),
    pair('fm', 'm', 1e-15),
    pair('ch', 'm', 66 * FT_SURVEY),
    pair('ua', 'm', 149597870700),
    pair('l.y.', 'm', 9.4607304725808e15),
    pair('mil', 'm', 2.54e-5),
    pair('fath', 'm', 6 * FT_SURVEY),
  ),
  cat('Fläche',
    pair('acre', 'm²', 43560 * FT_SURVEY * FT_SURVEY),
    pair('b', 'm²', 1e-28),
    pair('a', 'm²', 100),
    pair('ha', 'm²', 1e4),
    pair('ft²', 'm²', 0.09290304),
    pair('in²', 'cm²', 6.4516),
    pair('mile²', 'km²', 2.589988110336),
  ),
  cat('Volumen',
    pair('gal(US)', 'L', 3.785411784),
    pair('gal(UK)', 'L', 4.54609),
    pair('L', 'm³', 1e-3),
    pair('bu', 'L', 35.23907016688),
    pair('bbl', 'L', 158.987294928),
    pair('ton', 'm³', 2.8316846592), // Registertonne = 100 ft³
    pair('fl oz(US)', 'mL', 29.5735295625),
    pair('fl oz(UK)', 'mL', 28.4130625),
    pair('ft³', 'm³', 0.028316846592),
    pair('in³', 'm³', 1.6387064e-5),
  ),
  // „r“ = Umdrehung (ISO-Symbol r), 1 r = 2π rad (nicht eindeutig lesbar im Handbuch)
  cat('Winkel', pair('r', 'rad', 2 * Math.PI)),
  cat('Masse',
    pair('oz', 'g', 28.349523125),
    pair('lb', 'kg', 0.45359237),
    pair('mton', 'kg', 1000),
    pair('ton(long)', 'kg', 1016.0469088),
    pair('ton(short)', 'kg', 907.18474),
    pair('mcarat', 'g', 0.2),
  ),
  cat('Zeit',
    pair('t-yr', 's', 31556925.9747), // tropisches Jahr
    pair('min', 's', 60),
    pair('h', 's', 3600),
    pair('day', 's', 86400),
  ),
  cat('Geschwindigkeit',
    pairInv('km/h', 'm/s', 3.6),
    pair('mile/h', 'm/s', 0.44704),
    pair('knot', 'm/s', 1852 / 3600),
  ),
  cat('Beschleunigung', pair('Gal', 'm/s²', 0.01)),
  cat('Drehmoment', pair('N·m', 'dyn·cm', 1e7)),
  cat('Kraft',
    pair('dyn', 'N', 1e-5),
    pair('lbf', 'N', 4.4482216152605),
    pair('kgf', 'N', 9.80665),
  ),
  cat('Druck',
    pair('atm', 'Pa', 101325),
    pair('mmHg', 'Pa', 133.3224),
    pair('kgf/cm²', 'Pa', 98066.5),
    pair('lbf/in²', 'kPa', PSI / 1000),
    pair('bar', 'Pa', 1e5),
    pair('dyn/cm²', 'Pa', 0.1),
    pair('lbf/in²', 'Pa', PSI),
    pair('mmH2O', 'Pa', 9.80665),
    pair('inHg', 'Pa', 3386.389),
  ),
  cat('Energie',
    pair('kgf·m', 'J', 9.80665),
    pairInv('J', 'cal', 4.1855), // cal bei 15 °C
    pair('erg', 'J', 1e-7),
    pair('eV', 'J', 1.602176565e-19),
    pair('Btu', 'J', BTU_IT),
    pair('calIT', 'J', 4.1868),
    pair('calth', 'J', 4.184),
    pair('kW·h', 'J', 3.6e6),
  ),
  cat('Leistung', pair('hp', 'kW', 0.74569987158227)),
  cat('Wärmedurchfluss', pair('Btu/min', 'W', BTU_IT / 60)),
  cat('Temperatur', [
    conv('°F', '°C', (x) => ((x - 32) * 5) / 9),
    conv('°C', '°F', (x) => (x * 9) / 5 + 32),
  ]),
  cat('Spezif. Wärme', pair('calth/(g·K)', 'J/(kg·K)', 4184)),
  cat('Viskosität', pair('P', 'Pa·s', 0.1)),
  cat('Kinem. Viskosit', pair('St', 'm²/s', 1e-4)),
  cat('Magnetismus',
    pair('G', 'T', 1e-4),
    pair('Oe', 'A/m', 1000 / (4 * Math.PI)),
    pair('Mx', 'Wb', 1e-8),
    pair('γ', 'T', 1e-9),
  ),
  cat('Lichtstärke',
    pair('sb', 'cd/m²', 1e4),
    pair('ph', 'lx', 1e4),
  ),
  cat('Radioaktivität',
    pair('Ci', 'Bq', 3.7e10),
    pair('rad', 'Gy', 0.01),
    pair('rem', 'Sv', 0.01),
    pair('R', 'C/kg', 2.58e-4),
  ),
];
