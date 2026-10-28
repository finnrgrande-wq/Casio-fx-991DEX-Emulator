# ClassCalc – Phase 1: Funktionsübersicht, Umsetzungsplan, offene Fragen

Arbeitstitel: **ClassCalc** – Web-Emulator mit dem Bedienkonzept eines ClassWiz-Schulrechners
(Referenz: fx-991DE X, Kurzanleitung im Projektordner). Kein Herstellername, kein Logo.

Legende: **[P]** = Abi-Pflicht · **[N]** = Abi-nützlich · **[O]** = Optional
(Einstufung für das Abitur in Schleswig-Holstein mit WTR ohne CAS. Bitte korrigieren, falls deine Schule das anders handhabt.)

---

## 0. Was die Kurzanleitung festlegt (und was nicht)

**Belegt durch das PDF** (Text + Screenshots + Titelbild der Tastatur):

- Menü 1–9, A–D mit Icons und Namen (S. 2), Statuszeile mit √‾-Symbol, ▲▼-Pfeilen und „D“
- Komplette Tastenbeschriftung inkl. SHIFT-Belegung (gold) und ALPHA-Belegung (rot) (Titelbild, siehe 1.1)
- SETUP mit 4 Seiten und genauen Menütexten, Reset-Menü (S. 5)
- Beispiele mit Sollwerten: √7/3+√8/4, 2π→S⇔D, 12,5 ft▸m, SOLVE (3 Fälle), CALC, ∫, d/dx, 5!, 10C4,
  RanInt#(1;6), Polynom, LGS, Regression, Binomial, Matrix/Det, Vektoren, Tabellenkalkulation, Tabellen

**Nicht im PDF** (rekonstruiere ich aus dem bekannten ClassWiz-Verhalten, Abweichungen möglich):
vollständige OPTN-Listen je Modus, CONST-/CONV-Kataloge, genaue Grenzen der exakten Ausgabe,
Wortlaut aller Fehlermeldungen, Untermenüs von Statistik/Verteilungen ab Seite 2. → siehe Offene Fragen.

### Testwerte, die ich aus den Screenshots abgelesen habe

| Thema | Wert aus dem PDF |
|---|---|
| Matrix (S. 12) | MatA = [[2, 1, −1], [5, 3, 0], [4, −2, **5**]] → **Det = 27** (nachgerechnet ✓) |
| Quadr. Regression (S. 10) | x: −4, −1, 2, 3 · y: 3, 1, 2, 5 → **a = 0,8181818182 · b = 0,4575757576 · c = 0,2575757576** |
| SOLVE mit d/dx (S. 7) | Gerät zeigt **x = 1,333333341**, L−R = 0 (numerisches Rauschen des Originals) |
| Tabellen (S. 15) | f(x)=2x²−3x, g(x)=2x−1, Start −5: f = 65; 44; 27; 14 · g = −11; −9; −7; −5 |
| CALC/Σ (S. 8) | Σ_{x=1}^{A} (A C x · 0,25^x · 0,75^(A−x)), A = 17 · Ax²+Bx+C mit B = −2 |
| Binomial-Liste (S. 11) | n = 20, p = 0,4: P(9) = 0,159738478 → STO A → A = 0,159738478 |
| Vektoren (S. 13) | VctA = (3; −2; 1), VctA·VctB = −3 (VctB im PDF nicht sichtbar) |
| Tabellenkalk. (S. 14) | A1 = 1, Formel füllen „=A1+1“, Zellen A2:A20 → 1, 2, 3, 4 … |
| LGS (S. 6) | 2x+4y−3z / 3x+2y+z / x−y+3z, Lösung x = 2/3 (rechte Seiten nur teilweise lesbar) |

---

## 1. Funktionsübersicht

### 1.1 Tastatur (aus dem Titelbild des PDF, wird 1:1 als Datentabelle umgesetzt)

| Taste | normal | SHIFT (gold) | ALPHA (rot) | Base-N (blau) |
|---|---|---|---|---|
| Kopfzeile | SHIFT · ALPHA · Steuerkreuz · MENU · ON | MENU → SETUP | | |
| R1 | OPTN | QR | | |
| | CALC | SOLVE | = | |
| | ∫▫▫ | d/dx▫ | : (Mehrfachanweisung) | |
| | x | Σ▫ | Π▫ | |
| R2 | ▫/▫ (Bruch) | ▫▫/▫ (gemischter Bruch) | ÷R (Division mit Rest) | |
| | √▫ | ³√▫ | ▫‾ (Periode) | |
| | x² | x³ | | DEC |
| | x^▫ | ▫√▫ | | HEX |
| | log▫▫ (logₐb) | 10^▫ | | BIN |
| | ln | e^▫ | | OCT |
| R3 | (−) | log | A | A |
| | °′″ | FACT (Primfaktoren) | B | B |
| | x⁻¹ | x! | C | C |
| | sin / cos / tan | sin⁻¹ / cos⁻¹ / tan⁻¹ | D / E / F | D / E / F |
| R4 | STO | RECALL | | |
| | ENG | ← (ENG rückwärts) / ∠ im Modus Komplex | i | |
| | ( | Abs | | |
| | ) | ; (Argumenttrenner) | x | |
| | S⇔D | a b/c ⇔ d/c | y | |
| | M+ | M− | M | |
| R5 | 7 / 8 / 9 | CONST / CONV / RESET | | |
| | DEL | INS | UNDO | |
| | AC | OFF | | |
| R6 | 4 5 6 | | | |
| | × | nPr | GCD | |
| | ÷ | nCr | LCM | |
| R7 | 1 2 3 | | | |
| | + | Pol | Int | |
| | − | Rec | Intg | |
| R8 | 0 | Rnd | RndFix | |
| | , (Dezimalkomma) | Ran# | RanInt# | |
| | ×10^x | π | e | |
| | Ans | % | | |
| | = | ≈ (Dezimalausgabe) | | |

Abweichungen gegenüber dem Auftrag, die sich aus dem Original ergeben:
- **log▫▫ ist die Haupttaste**, das einfache `log` liegt auf **SHIFT (−)**.
- **STO ist eine eigene Taste**, SHIFT STO = RECALL (Übersicht aller Variablen).
- **Σ auf SHIFT x, Π auf ALPHA x**. Das Π-Produkt gibt es beim DE X also tatsächlich.
- Zusätzlich vorhanden: **÷R**, **Periode ▫‾**, **FACT**, **RndFix**, **Int/Intg**, **Pol/Rec**. Die nehme ich mit auf.

### 1.2 Bedienung & Display (alle Modi)

| Funktion | Stufe |
|---|---|
| Hochformat-Gehäuse, Tastenlayout wie oben, SHIFT gold / ALPHA rot über den Tasten | [P] |
| LCD als Punktmatrix (192 × 63 Punkte wie das Original), Statusleiste: S, A, M, STO, RCL, D/R/G, FIX/SCI, √‾ (Math), ▲▼◀▶, „D“-Indikator | [P] |
| SHIFT/ALPHA als Einmal-Modifier, Anzeige S/A; SHIFT-Doppeltipp-Sperre als Option (Standard aus) | [P] |
| Hauptmenü (MENU): 2 × 4 Icons je Seite, ▲▼◀▶-Navigation, Direktwahl 1–9 und A–D ohne ALPHA über die Tasten (−)=A, °′″=B, x⁻¹=C, sin=D wie am Gerät, = zur Auswahl | [P] |
| Eigene Pixel-Icons für alle 13 Anwendungen | [P] |
| Natürliche Eingabe: Schablonen mit Cursorfeldern, ◀▶ springt zwischen Feldern, ▲▼ bei Brüchen | [P] |
| DEL (links vom Cursor), INS (Überschreiben im Line-Modus / Einfügen einer Schablone um Markierung), UNDO, AC | [P] |
| Ablaufspeicher: ▲▼ blättern, bearbeiten, neu rechnen; wird bei Moduswechsel und OFF gelöscht | [P] |
| Fehlerbildschirme mit den deutschen Texten des DE X (siehe Abschnitt 4): Mathem. Fehler, Stapelfehler, Syntaxfehler, Argumentfehler, Dimensionsfehler, Variablenfehler, Keine Lösung gef, Bereichsfehler, Zeitüberschreit, Zirkelbezug, Speicherfehler; ◀/▶ springt zur Fehlerstelle, AC verlässt und löscht | [P] |
| Zahlenformat deutsch: Dezimalkomma, `;` als Trenner, 10-stellige Mantisse, Exponent ×10^ | [P] |
| Kurze Tastenanimation; iOS-Haptik als „best effort“ (siehe Technik) | [N] |
| Desktop-Tastatureingabe (Ziffern, Operatoren, Enter, Backspace, Pfeile, Shift-/Alt-Kürzel) | [O] |

### 1.3 Modus 1 – Berechnungen

| Funktion | Stufe |
|---|---|
| + − × ÷, Klammern, implizite Multiplikation (2π, 3sin(x)), Vorrangregeln wie Original | [P] |
| x², x³, x^▫, x⁻¹, √, ³√, ▫√▫, Bruch, gemischter Bruch | [P] |
| log, logₐb, ln, 10^▫, e^▫ | [P] |
| sin/cos/tan + Umkehrfunktionen, exakte Werte bei Standardwinkeln (sin 60° = √3/2) | [P] |
| π, e, Ans, (−) | [P] |
| **Exakte Ausgabe**: gekürzte Brüche, Wurzelterme bis zu zwei Summanden über gemeinsamem Nenner ((2√7+3√2)/6), Vielfache von π | [P] |
| S⇔D, SHIFT = (≈) für direkte Dezimalausgabe, a b/c ⇔ d/c | [P] |
| Variablen A–F, x, y mit STO, RECALL-Übersicht, M+ / M− / M, Ans | [P] |
| **CALC**: Term/Gleichung mit Variablen, Abfrage nacheinander, ▲▼ zwischen Abfragen, erneutes CALC | [P] |
| **SOLVE**: Newton mit Startwert, Fallback Sekante/Bisektion, Anzeige x= und L−R=, „=“ über ALPHA CALC, Term ohne „=“ gilt als „=0“, Abfrage weiterer Variablen, funktioniert mit d/dx und ∫ im Term | [P] |
| **d/dx** an einer Stelle, **∫** bestimmt | [P] |
| x!, nPr, nCr | [P] |
| Ran#, RanInt#(a;b) | [N] |
| Abs | [N] |
| %, °′″ (Eingabe + Umrechnung), ENG / ENG← | [N] |
| Σ-Summe, Π-Produkt | [N] |
| GCD, LCM, Int, Intg, Rnd, RndFix, ÷R, FACT | [O] |
| Pol/Rec (Polar ↔ kartesisch) | [O] |
| Periodische Dezimalzahlen (Eingabe ▫‾ + Ausgabe, wenn SETUP „Period. Darst.“ an) | [O] |
| OPTN: 1 Hyperbolische Fkt. (sinh … artanh) · 2 Winkeleinheit (°, r, g als Eingabesymbole) · 3 Dezimalpräfixe (k, M, m, µ …) | [O] / [N] / [O] |
| CONST (SHIFT 7) nach Kategorien (Univers., E-magn., Atom/Nuk., Phys/Chem., …) | [O] |
| CONV (SHIFT 8) Einheitenumrechnung nach Kategorien (Länge, Fläche, Volumen, Masse, Geschwindigkeit, Druck, Energie, Leistung, Temperatur) | [O] |
| Mehrfachanweisungen mit „:“ | [O] |

### 1.4 Modus 2 – Komplexe Zahlen [O]
Rechnen mit i, Ausgabe a+bi oder r∠θ (SETUP), OPTN: arg, Betrag (Abs), Konjugiert, Re, Im, ▸r∠θ, ▸a+bi.
x², x⁻¹, √ usw. mit komplexen Argumenten, soweit am Original erlaubt.

### 1.5 Modus 3 – Basis-N [O]
DEC/HEX/BIN/OCT umschalten (x², x^▫, log▫▫, ln im Base-N-Modus), Ziffern A–F, 32-Bit-Zweierkomplement,
OPTN: Präfixe d/h/b/o, Logik and, or, xor, xnor, Not, Neg.

### 1.6 Modus 4 – Matrizen [N]
MatA–MatD bis 4 × 4, Editor mit Zellcursor, MatAns, +, −, ×, Skalar × Matrix, x⁻¹, x², x³ (höhere Potenzen
durch Wiederholen wie im PDF), Det, Trn, Ref, Rref, Identität. OPTN Seite 1: Matrix definieren / bearbeiten,
MatA…MatD, MatAns; Seite 2: Det, Trn, Identität, Ref, Rref. Fehler: Dimension ERROR, Math ERROR (singulär).

### 1.7 Modus 5 – Vektoren [P]
VctA–VctD (2D/3D), Editor, VctAns, +, −, Skalar × Vektor, Skalarprodukt (OPTN „Skalarprodukt“ → `·`),
Kreuzprodukt (×), Winkel, Einheitsvektor, Betrag (Abs).

### 1.8 Modus 6 – Statistik
| Funktion | Stufe |
|---|---|
| Typauswahl: 1 Variable · y=a+bx · y=a+bx+cx² · y=a+b·ln(x) · y=a·e^(bx) · y=a·b^x · y=a·x^b · y=a+b/x | [N] |
| Dateneditor (x / x,y), Häufigkeitsspalte per SETUP, Zeilen einfügen/löschen, max. Zeilenzahl wie Original | [N] |
| OPTN: Typ auswählen · 1-/2-Variab-Berech (Ergebnisliste) · Regression (a, b, c, r) · Daten | [N] |
| Kennwerte: x̄, Σx, Σx², σ²x, σx, s²x, sx, n, min/max, Med, Q1, Q3 (bei 2 Var. auch ȳ, Σy, Σxy …) | [N] |
| Schätzwerte x̂ / ŷ (bei quadratisch x̂₁, x̂₂) in Modus-6-Rechnungen | [N] |

### 1.9 Modus 7 – Verteilungsfunktionen [P]
1 Normal-Dichte · 2 Kumul. Normal-V · 3 Inv. Normal-V · 4 Binomial-Dichte · 5 Kumul. Binomial-V ·
6 Poisson-Dichte · 7 Kumul. Poisson-V. Jeweils Einzelwert oder Liste (Listeneditor bis 45 Werte),
Parameterabfrage wie im PDF (x/Liste, n, p bzw. μ, σ, Untere/Obere), Ergebnis mit STO in Variable,
aus der Liste per Cursor auf den p-Wert + STO.

### 1.10 Modus 8 – Tabellenkalkulation [N]
Zellraster A–E × 45 Zeilen (Annahme, siehe Fragen), Eingabe von Werten und Formeln, relative und $-absolute
Bezüge, OPTN: Formel füllen, Wert füllen, Zelle bearbeiten, Freier Speicher, Kopieren & Einfügen, Ausschneiden
& Einfügen, Alle löschen, $, :, Min, Max, Mittelwert, Summe. Automatische / manuelle Neuberechnung (SETUP).

### 1.11 Modus 9 – Tabellen [P]
f(x) und g(x) (oder nur f, SETUP), Start / Ende / Schrittweite, Tabelle mit ▲▼◀▶, x-Zelle überschreibbar,
Zeilen mit + / − erweitern, Zellwert unten groß, max. Zeilenzahl wie Original (45 bei f+g, 30 je nach Setup).

### 1.12 Modus A – Gleichung/Funktion [P]
- LGS mit 2–4 Unbekannten, Koeffizienteneditor, exakte Ausgabe, „Unendlich viele Lösungen“ / „Keine Lösung“
- Polynomgleichungen Grad 2–4, reelle und komplexe Lösungen (SETUP „Komplexe Wurzel“ an/aus),
  doppelte Lösungen nur einmal, bei Grad 2 zusätzlich Scheitelpunkt (x-Wert Min/Max, y-Wert Min/Max)
- ▲▼ blättert durch die Lösungen, = beginnt neue Eingabe

### 1.13 Modus B – Ungleichungen [N]
Polynom Grad 2–4, Wahl des Ungleichungstyps (>0, <0, ≥0, ≤0), Ausgabe der Lösungsintervalle wie Original
(„Alle reellen Zahlen“, „Keine Lösung“, Einzelwert).

### 1.14 Modus C – Berechnungen prüfen [O]
Gleichung / Ungleichung eingeben, Ausgabe „Wahr“ / „Falsch“, Relationszeichen über OPTN (=, ≠, >, <, ≥, ≤).

### 1.15 Modus D – Verhältnisse [O]
A:B = X:D und A:B = C:X, Lösung für X.

### 1.16 SETUP (SHIFT MENU), 4 Seiten wie im PDF
| Seite | Einträge | Stufe |
|---|---|---|
| 1 | 1 Eingabe/Ausgabe (MathI/MathO · MathI/DecimalO · LineI/LineO · LineI/DecimalO) · 2 Winkeleinheit (Deg/Rad/Gra) · 3 Zahlenformat (Fix 0–9 · Sci 0–9 · Norm 1/2) · 4 Dezimalpräfixe | [P] |
| 2 | 1 Bruchergebnis (ab/c / d/c) · 2 Komplexe Zahlen (a+bi / r∠θ) · 3 Statistik (Häufigkeit an/aus) · 4 Tabellenkalk. (Auto/Manuell, Ansicht) | [N] |
| 3 | 1 Gleichung/Funkt (Komplexe Wurzel an/aus) · 2 Tabellen (f(x) / f(x),g(x)) · 3 Period. Darst. · 4 1000er-Trennung | [N] |
| 4 | 1 Mehrzeilengröße (normal/klein) · 2 QR-Code (ohne Funktion bzw. Overlay) · 3 Automat Aus (ohne Wirkung) · 4 Kontrast | [O] |

**Reset (SHIFT 9):** „Zurücksetzen?“ 1 Setupdaten · 2 Speicher · 3 Alle initialis., jeweils mit Bestätigung. [P]

### 1.17 QR-Ersatz (SHIFT OPTN) [O]
Statt QR-Code ein Overlay mit Graph (Tabellen-Modus: f und g über dem Tabellenbereich) bzw. großer Tabellenansicht
(Tabellenkalkulation, Statistik, Verteilungen). Schließen mit AC/OPTN.

---

## 2. Umsetzungsplan

### 2.1 Tech-Stack
- **TypeScript (strict) + Vite**, kein UI-Framework. Das UI besteht aus einer festen Tastatur und einem Canvas.
  Ein Framework würde nur Bundle und Komplexität hinzufügen. Die eigentliche Logik ist ein Zustandsautomat.
- **Vitest** für Rechenkern, Editor, Modus-Logik und Tastenfolgen (headless, ohne DOM).
- **vite-plugin-pwa** (Workbox, `generateSW`) für Service Worker + Manifest, Precache aller Assets.
  Die Alternative wäre ein handgeschriebener SW. Das Plugin erspart Cache-Versionierungsfehler.
- **Keine Mathe-Bibliothek.** Eigener Rechenkern: BigInt-Rationalzahlen für die exakte Schicht, float64 für die
  Numerik. float64 hat ≈ 15,9 signifikante Stellen. Ich runde intern auf 15 Stellen, bevor das Ergebnis
  auf die 10-stellige Mantisse geht. Das kommt dem BCD-Verhalten des Originals nahe (1÷3×3 = 1, 0,1+0,2 = 0,3).
- Optional M9: **Playwright mit WebKit** als Smoke-Test (Safari-Engine), Offline-Test.

### 2.2 Architektur (strikte Schichten, nur Pfeile nach unten)

```
UI (DOM-Tasten, Canvas, Haptik, Desktop-Tastatur)
   │  KeyEvent { key: 'CALC', mod: 'shift' }
   ▼
Calculator (Controller): Modifier-Zustand, Screen-Stack, Persistenz-Hooks
   │
   ├── Modes/Screens (Zustandsautomaten je Anwendung, Menüs als Daten)
   │      └── nutzt Editor + Core
   ├── Editor (Eingabemodell: Slot-Baum, Cursor, Schablonen, Undo)
   ├── Core (Parser → AST → Auswertung exakt/numerisch, Formatter)
   └── Display (Layout-Engine → 192×63-Framebuffer → Canvas)
```

- **Core**
  - `parser`: Token-Strom aus dem Editor (keine Zeichenketten, also keine Komma/Semikolon-Mehrdeutigkeit) →
    AST mit Quellpositionen (für den Fehlercursor). Vorrangregeln des Originals inkl. impliziter
    Multiplikation und Vorzeichen-Bindung (−2² = −4).
  - `exact`: Werttypen `Rational` (BigInt), `Surd` (Σ qᵢ·√nᵢ, nᵢ quadratfrei, max. 2 Terme),
    `PiMultiple` (q·π). Jede Operation versucht exakt zu bleiben, sonst Fallback auf `Float`.
  - `numeric`: adaptives Gauß-Kronrod G7/K15 (∫), zentraler Differenzenquotient mit Richardson-Extrapolation
    (d/dx), Newton → Sekante → Bisektion mit Bracketing (SOLVE), Durand-Kerner bzw. Companion-Matrix +
    Newton-Politur (Polynome Grad 3/4, Grad 2 exakt über Diskriminante), Gauß-Elimination mit exakten Brüchen
    (LGS, Det, Rref), Regressionen (Normalgleichungen), Verteilungen (Binomial über log-Gamma, Normal-CDF
    über erfc mit hoher Genauigkeit, inverse Normal über Acklam + Newton).
  - `format`: Zahl → Displaydarstellung (Norm 1/2, Fix, Sci, ENG, 10-stellige Mantisse, Dezimalkomma,
    1000er-Trennung, exakte Formen mit Größengrenzen wie am Original, Periode).
- **Editor**: Ausdrucksbaum aus *Slots* (Liste von Knoten). Knoten = Zeichen/Token oder Schablone mit
  Kind-Slots (Bruch, gem. Bruch, √, ³√, ▫√▫, Potenz, 10^▫, e^▫, logₐb, Abs, ∫, d/dx, Σ, Π, Periode).
  Cursor = (Slot-Pfad, Index). Line-Modus nutzt dasselbe Modell, rendert nur linear. Undo als Snapshot-Stack.
  Kapazitätsgrenze wie Original (≈ 199 Bytes).
- **Display**: Layout-Boxen (Breite/Höhe/Baseline) für die Math-Darstellung, horizontales Scrollen mit ◀▶-Anzeige,
  eigene **Bitmap-Fonts** (groß ≈ 7×11, klein ≈ 5×7, Indizes/Exponenten) in einem selbst gezeichneten Glyphensatz,
  Ausgabe in einen 1-Bit-Framebuffer → Canvas mit Punktmatrix-Optik (Punktabstand, leichter Schatten,
  Kontrast aus SETUP). Tests prüfen ein **Text-Displaymodell**, nicht die Pixel.
- **Modes/Screens**: jeder Bildschirm implementiert `onKey(key) → Effekt` und `render() → DisplayModel`.
  Menüs (OPTN, SETUP, CONST, CONV, Typauswahl …) sind deklarative Daten mit Seiten, Einträgen und Aktion.
- **Keymap als Datentabelle**: `keys.ts` beschreibt jede Taste mit `{ normal, shift, alpha, base }` und
  Overrides je Modus. Aktionen sind Kommando-IDs (`insert:sin`, `template:frac`, `cmd:solve`, `nav:setup` …),
  die der aktive Screen interpretiert. Das UI rendert die Beschriftungen aus derselben Tabelle.
- **Persistenz**: `storage.ts` mit try/catch-Wrapper, ein versionierter Schlüssel `classcalc:v1`
  (SETUP, Variablen, M, Ans, Matrizen, Vektoren, Statistikdaten, Tabellenkalk., Tabellenfunktionen).
  Speichern gedrosselt nach jeder Aktion. **Nicht** gespeichert: Ablaufspeicher (wie OFF am Original).

### 2.3 Dateistruktur

```
/
├─ index.html                  Viewport, apple-mobile-web-app-*, Safe-Area, Theme-Color
├─ vite.config.ts              inkl. vite-plugin-pwa
├─ public/                     Icons (eigenes Design), apple-touch-icon 180×180, Manifest-Icons
├─ docs/kurzanleitung-fx991dex.pdf
├─ src/
│  ├─ main.ts                  Bootstrapping
│  ├─ ui/                      keyboard.ts, lcdCanvas.ts, haptics.ts, desktopKeys.ts, styles.css
│  ├─ keys/                    keymap.ts (Datentabelle), keyIds.ts
│  ├─ calculator/              calculator.ts (Controller), state.ts, storage.ts
│  ├─ editor/                  model.ts, cursor.ts, templates.ts, ops.ts (insert/del/ins/undo)
│  ├─ core/
│  │  ├─ parser/               tokens.ts, parser.ts, ast.ts
│  │  ├─ exact/                rational.ts, surd.ts, simplify.ts
│  │  ├─ eval/                 evaluate.ts, functions.ts, angle.ts, errors.ts
│  │  ├─ numeric/              integrate.ts, derive.ts, solve.ts, poly.ts, linalg.ts, regression.ts, distributions.ts
│  │  └─ format/               number.ts, exactForm.ts
│  ├─ display/                 layout.ts, fonts/ (Bitmap-Glyphen), framebuffer.ts, statusbar.ts, icons/
│  ├─ modes/                   menu.ts, setup.ts, reset.ts, calc/, complex/, basen/, matrix/, vector/,
│  │                           stat/, dist/, sheet/, table/, equation/, inequality/, verify/, ratio/
│  └─ data/                    constants.ts, conversions.ts, menus.ts
└─ tests/
   ├─ core/                    Rechenkern-Tests
   ├─ keys/                    Tastenfolge-Tests (Harness: press('SHIFT','CALC',…) → DisplayModel)
   └─ acceptance.test.ts       alle Abnahmewerte aus dem PDF/Auftrag
```

### 2.4 Meilensteine (angepasst)

| # | Inhalt | Ergebnis / Tests |
|---|---|---|
| **1** | git init, Vite/TS/Vitest-Gerüst, PWA (Manifest, SW, Icons, Meta-Tags), Gehäuse + komplette Tastatur aus der Keymap-Tabelle, LCD-Canvas mit Bitmap-Font und Statusleiste, Hauptmenü mit Pixel-Icons und Navigation, Touch-Feinschliff-Basis | Lauffähig auf dem iPhone (Menü bedienbar). Tests: Keymap-Vollständigkeit, Menünavigation per Tastenfolge |
| **2** | Editor (Schablonen, Cursor, DEL/INS/UNDO/AC), Parser, exakter Kern, Modus 1 Grundrechnen, alle Funktionen aus 1.3 außer Analysis, S⇔D/≈, Variablen/STO/RECALL/M/Ans, Ablaufspeicher, Fehler mit Cursorsprung, Math/Line, Deg/Rad/Gra | √7/3+√8/4, 2π→S⇔D, 5!, 10C4, Fehlerfälle |
| **3** | CALC, SOLVE, d/dx, ∫, Σ, Π, Kombinatorik, Zufall, GCD/LCM/Int/Rnd/÷R/FACT, CONST, CONV, OPTN-Menü (Hyperbel, Winkel, Präfixe) | SOLVE-Abnahmewerte, ∫ = −9/8, d/dx = 9, 12,5 ft → 3,81, Σ-Beispiel |
| **4** | SETUP komplett (4 Seiten), Fix/Sci/Norm/ENG, Bruchergebnis, Periode, 1000er-Trennung, Kontrast, Reset, Persistenz | Format-Tests, Persistenz-Roundtrip, Reset-Varianten |
| **5** | Modus A (LGS, Polynome inkl. komplex, Scheitelpunkt), Modus 9 (Tabellen) | x₂ = (5−√137)/8, LGS-Meldungen, Tabellenwerte S. 15 |
| **6** | Modus 7 (alle Verteilungen, Liste, STO), Modus 6 (Editor, Häufigkeit, alle Regressionen, Kennwerte, x̂/ŷ) | Binomial 0,159738478, Regression a/b/c aus S. 10 |
| **7** | Modus 4/5 (Matrizen, Vektoren) | Det = 27, Rref/Inverse, Vektor-Tests |
| **8** | Modi 2, B, C, D, 8, 3 + QR-Overlay | je Modus Tastenfolge-Tests |
| **9** | iOS-Feinschliff (Safe Area, Skalierung iPad, Haptik), Offline-Test, Abgleich aller PDF-Screens, optional Playwright-WebKit | Checkliste PDF-Seiten 2–15 abgehakt |

Nach jedem Meilenstein: `npm test` + `npm run build`, kurze Statusmeldung, Commit.

### 2.5 Teststrategie
1. **Core-Unit-Tests**: Rationalzahlen, Wurzelvereinfachung, Parser (Vorrang, implizite Multiplikation), Funktionen,
   Numerik gegen Referenzwerte, Formatter (10 Stellen, Fix/Sci, Komma).
2. **Tastenfolge-Tests** (Hauptsäule): headless `Calculator`, `press(...)` mit Tasten-IDs, Prüfung auf ein
   Displaymodell `{ status: [...], lines: [...], result: '…' }`. Beispiel:
   `press('7','√',…,'=')` → `result` = `(2√7+3√2)/6` als strukturierter Bruch.
3. **Abnahmetests**: alle Werte aus dem Auftrag + die aus dem PDF abgelesenen (siehe Abschnitt 0).
   SOLVE mit d/dx: Toleranz 1e−8 statt exakter Ziffern (das Rauschen 1,333333341 des Originals bilde ich nicht nach).
4. **Property-Tests** (leichtgewichtig, ohne Zusatzbibliothek): exakter Kern vs. float64 auf Zufallsausdrücken.
5. **Manuell / M9**: iPhone-Safari + PWA-Installation, Flugmodus-Test, iPad-Skalierung.

### 2.6 iOS/Safari-Details
- `viewport-fit=cover`, `user-scalable=no`, `touch-action: manipulation`, `user-select: none`,
  `-webkit-touch-callout: none`, `overscroll-behavior: none`, `position: fixed` auf dem Body gegen Gummiband,
  `env(safe-area-inset-*)`, Höhe mit `100dvh`.
- Tasten reagieren auf `pointerdown` (sofort, kein 300-ms-Delay), visuelles Feedback per CSS-Klasse.
- **Haptik:** iOS Safari unterstützt `navigator.vibrate` nicht. Ab iOS 18 löst das Umschalten eines versteckten
  `<input type="checkbox" switch>` einen System-Haptik-Tick aus. Das nutze ich als best effort mit Abschaltoption,
  sonst bleibt nur die visuelle Animation.
- Layout skaliert über ein festes Seitenverhältnis (Gehäuse ≈ 1 : 2,05) und füllt in der Breite.
  Auf dem iPad zentriert mit Maximalhöhe.

---

## 3. Offene Fragen & Annahmen

**Fragen (wichtig für die Genauigkeit):**
1. **Vollständige Bedienungsanleitung:** Die Kurzanleitung deckt Menütexte, OPTN-Listen, CONST/CONV-Kataloge
   und Fehlertexte nur teilweise ab. Kannst du die offizielle Bedienungsanleitung des fx-991DE X (PDF, ca. 50+ Seiten)
   in `docs/` legen? Sonst rekonstruiere ich aus meinem Wissen über die ClassWiz-Reihe und markiere unsichere Stellen.
2. **Hast du ein echtes Gerät?** Dann würde ich dir pro Meilenstein eine kurze Liste „bitte am Gerät prüfen“
   geben (z. B. Fehlertexte, Grenzen der exakten Ausgabe, Menüwortlaut).
3. **Hosting fürs iPhone:** Eine PWA muss einmal über HTTPS geladen werden. Vorschlag: GitHub Pages
   (kostenlos, statisch). Alternativ Netlify oder Cloudflare Pages. Welche Variante, oder machst du das selbst?
4. **Abi-Einstufung:** Gehören Matrizen (Übergangsprozesse) und Regression bei euch zum Abi-Stoff?
   Danach richte ich die Reihenfolge der Meilensteine 6/7 aus.

**Annahmen (gelten, wenn du nichts anderes sagst):**
- Das PDF heißt aktuell `docskurzanleitung-fx991dex.pdf` und liegt im Hauptordner (Schrägstrich fehlt). Ich verschiebe es in M1 nach `docs/kurzanleitung-fx991dex.pdf`.
- Der Ordner ist noch kein git-Repository. Ich lege in M1 eines an und committe nach jedem Meilenstein lokal, ohne Push.
- Fehlermeldungen auf Englisch wie im Auftrag („Math ERROR“ …), Menütexte auf Deutsch wie im PDF.
- Displayauflösung 192 × 63 Punkte. Die Fonts zeichne ich selbst und kopiere sie nicht.
- Tabellenkalkulation 5 Spalten × 45 Zeilen. Statistik-Editor und Tabellenmodus mit den Zeilenlimits der ClassWiz-Reihe.
- Grenzen der exakten Ausgabe nach dem Verhalten der ClassWiz-Reihe (Wurzelterme mit kleinen Koeffizienten,
  Brüche mit insgesamt ≤ 10 Stellen). Die Feinjustierung erfolgt über die Tests.
- „Mehrzeilengröße“, „QR-Code“ und „Automat Aus“ im SETUP existieren als Einträge, haben aber nur kosmetische bzw. keine Wirkung.
- Zufallsfunktionen sind in Tests seedbar.
- Der Ablaufspeicher wird bei Moduswechsel, OFF und App-Neustart gelöscht. Alles andere bleibt erhalten.

---

## 4. Entscheidungen nach Rückmeldung und Komplettanleitung (Stand 27.10.2026)

**Antworten:**
- Komplettanleitung und Kurzanleitung liegen in `docs/`. Die Komplettanleitung ist ab jetzt die Hauptreferenz.
- Ein echtes Gerät ist vorhanden. Die App ist ein Ersatz für den Unterricht, falls das Gerät vergessen wurde.
- Repository: https://github.com/finnrgrande-wq/Casio-fx-991DEX-Emulator. Hosting über GitHub Pages per GitHub Actions.
- Matrizen und Regression sind Unterthemen im Abi und bleiben **[N]**. Die Reihenfolge der Meilensteine ändert sich nicht.

**Korrekturen aus der Komplettanleitung (gehen dem Auftrag vor, weil das Original so arbeitet):**
- **Fehlermeldungen auf Deutsch** wie beim DE X: „Mathem. Fehler“, „Stapelfehler“, „Syntaxfehler“, „Argumentfehler“,
  „Dimensionsfehler“, „Variablenfehler“, „Keine Lösung gef“, „Bereichsfehler“, „Zeitüberschreit“, „Zirkelbezug“, „Speicherfehler“.
- SETUP-Texte: „Math --> Math“, „Math --> Dezim.“, „Lin. --> Linear“, „Lin. --> Dezim.“; Winkel „Gradmaß (D)“, „Bogenmaß (R)“, „Gon (G)“.
  Standardwerte: Norm 1, Bruch d/c, Period. Darst. **Ein**, Tabellen f(x),g(x), Statistik-Häufigkeit Aus, Autom. Berechn. Ein, Zelle anzeigen Formel.
- ∫ arbeitet nach Gauß-Kronrod (Standard-tol 1×10⁻⁵), d/dx mit zentralem Differenzenquotienten (tol 1×10⁻¹⁰). Im Line-Modus gilt die Syntax ∫(f;a;b;tol) und d/dx(f;a;tol).
- SOLVE: Abfrage aller Variablen, Auswahl der Lösungsvariable, Ausgabe immer dezimal, „Fortfahren:[=]“ bei Nichtkonvergenz.
- π-Form nur für |x| < 10⁶. Gemischte Brüche und Periode nur bei ≤ 10 Stellen inkl. Trennzeichen. Rechenbereich ±1×10⁻⁹⁹ bis ±9,999999999×10⁹⁹.
- π intern 3,14159265358980, e intern 2,71828182845904 (15 Stellen).
- Grenzen: Statistik-Editor 160 / 80 / 53 Zeilen (1 / 2 / 3 Spalten), Tabellen 45 Zeilen (nur f) bzw. 30 Zeilen (f und g),
  Tabellenkalk. A1–E45 mit 1700 Bytes, Verteilungslisten 45 Werte, Konstante je Zelle 10 Bytes, Formel 49 Bytes.
- Zusätzlich im Original: Statistik-Untermenü „Normal-Vert.“ mit P(, Q(, R(, ▸t (1 Variable); Variable M auch in RECALL;
  Berechn. prüf. setzt Ans auf 1/0; Verhältnisse setzen mit AC alle Koeffizienten auf 1.
- Ablaufspeicher wird auch bei Änderung von Eingabe/Ausgabe und bei RESET (Setupdaten/Alle) gelöscht.

**Persistenz (Abgleich Original ↔ Auftrag):** Variablen, M, Ans, SETUP, MatA–D, VctA–D bleiben immer erhalten.
Statistik-, Tabellenkalk.- und Tabellen-Daten bleiben über einen App-Neustart erhalten, werden aber wie am Original
beim **Verlassen des Modus** gelöscht. Der Ablaufspeicher wird nie gespeichert.

**Darstellung:** Die Statusleiste mit S, A, M, →x, √▫, D/R/G, FIX, SCI, E, i/∠, ▲▼ ist wie am Original eine eigene Segmentzeile
über der Punktmatrix. Die Punktmatrix hat 192 × 64 Punkte und zeigt 4 Textzeilen à 17 Zeichen in der großen Schrift.
Die große Schrift wird aus der Open-Source-Schrift Courier Prime (SIL OFL) gerastert und von Hand nachbearbeitet.
Die kleine Schrift (Exponenten, Grenzen, Tabellen) zeichne ich selbst.

---

## 5. Am echten Gerät prüfen (offene Annahmen)

| # | Frage | Aktuelle Umsetzung |
|---|---|---|
| 1 | Wie sieht das Ergebnis von `5 ÷R 2` aus? | `2;R=1` |
| 2 | Wortlaut im Fehlerbildschirm unter der Meldung | `[AC] :Abbrechen` / `[◀][▶]:Gehe zu` |
| 3 | Zeichen der 1000er-Trennung | Apostroph `1'234'567` |
| 4 | Was passiert bei DEL direkt hinter einem ausgefüllten Bruch/einer Wurzel? | Cursor springt in die Schablone, nichts wird gelöscht |
| 5 | DEL am Anfang eines Schablonenfeldes | Schablone wird aufgelöst, Inhalt bleibt |
| 6 | CONV „Winkel“: Bedeutung von `r` in `r▸rad` | volle Umdrehung (1 r = 2π rad) |
| 7 | `2(−)3` (Vorzeichen direkt nach einer Zahl) | implizite Multiplikation = −6 |
| 8 | Ab welchem Nenner zeigt das Gerät Gleitkomma-Ergebnisse (z. B. Integrale) noch als Bruch? | Kettenbruch bis Nenner 100000, 15 Stellen genau |
| 9 | Reihenfolge der Lösungen bei Grad 3/4 (Modus A) | reelle Lösungen absteigend, dann komplexe |
| 10 | Text bei Polynom ohne reelle Lösung, wenn komplexe Lösungen im SETUP aus sind | `Keine reell. Lösg` |
| 11 | Beschriftung des Scheitelpunkts (Modus A, Grad 2) | `𝑥-Wert Minimum=` / `𝑦-Wert Maximum=` |
| 12 | Text der Abfrage „Anzahl der Unbekannten“ | `Unbekannte?` / `2~4 wählen` |
| 13 | Seitenaufteilung OPTN in Modus 4/5 | S.1 definieren, bearbeiten, A, B · S.2 C, D, Ans, Det/Skalarprodukt · S.3 Rest |
| 14 | Abfragetexte beim Definieren einer Matrix | `Zeilen?` / `Spalten?` / `1~4 wählen` |
| 15 | Schreibweise SOLVE mit d/dx: Original zeigt 1,333333341 (Rechenrauschen) | App zeigt 1,333333333 |
