# Schriftlizenzen

Die große LCD-Schrift (`src/display/fonts/large.ts`) ist aus **Courier Prime**
abgeleitet (Copyright 2015 The Courier Prime Project Authors), gerastert mit
`scripts/build-font.mjs`, auf 1 Bit geschwellt und von Hand nachbearbeitet.
Nicht in Courier Prime enthaltene Zeichen (griechische Buchstaben, Rechen- und
Pfeilsymbole, Dreiecke usw.) sind eigene Zeichnungen im gleichen Stil.

Courier Prime steht unter der **SIL Open Font License, Version 1.1**:
<https://openfontlicense.org>

Die Schrift wird über das npm-Paket `@fontsource/courier-prime` bezogen und
nur zur Erzeugung der Bitmap-Glyphen verwendet (Entwicklungsabhängigkeit); die
Original-Schriftdateien werden nicht mit der Anwendung ausgeliefert. Die
abgeleiteten Bitmaps werden ebenfalls unter der OFL 1.1 weitergegeben.
