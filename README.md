# ClassCalc

Web-Emulator mit dem Bedienkonzept eines wissenschaftlichen Schulrechners der ClassWiz-Reihe
(Referenz: fx-991DE X). Gedacht zum Mitmachen im Unterricht, wenn der eigene Rechner fehlt.
Die Tastenfolgen und Menüwege sollen denen des echten Geräts entsprechen.

- Läuft komplett im Browser, ohne Backend und offline (PWA)
- Für iPhone/iPad optimiert: In Safari „Teilen → Zum Home-Bildschirm“ wählen
- Kein Herstellerlogo, keine Markennamen in der App. Alle Icons und Schriften sind eigene Arbeit
  oder stehen unter offener Lizenz (siehe [LICENSE-FONTS.md](LICENSE-FONTS.md)).

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Vitest
npm run build    # Typprüfung + Produktions-Build nach dist/
```

Generatoren für Pixelschrift und App-Icons: `npm run font`, `node scripts/build-icons.mjs`.

Computertastatur (zum Testen): Ziffern, `+ - * / ( ) ^`, `,`/`.` = Komma, Enter = `=`, Backspace = DEL,
Esc = AC, Pfeiltasten, F1 = SHIFT, F2 = ALPHA, F3 = MENU, F4 = OPTN.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/keys` | Tastenbelegung als Datentabelle (normal / SHIFT / ALPHA / Basis-N, je Modus) |
| `src/calculator` | Controller (Modifier, Bildschirmstapel), Zustand, Speicherung |
| `src/modes` | Bildschirme der Anwendungen (Hauptmenü, Modi) |
| `src/display` | Scene-Modell, Framebuffer 192 × 64, Pixelschriften, Icons, Statusleiste |
| `src/ui` | DOM-Tastatur, LCD-Canvas, Haptik, Computertastatur |
| `tests` | Vitest: Tastenfolgen → Displaytext, Rechenkern, Daten |

Plan und Meilensteine: [PLAN.md](PLAN.md).

## Deployment

Jeder Push auf `main` baut die App über GitHub Actions und veröffentlicht sie auf GitHub Pages
(`.github/workflows/pages.yml`). Einmalig im Repository unter *Settings → Pages* als Quelle
„GitHub Actions“ auswählen.

Die Bedienungsanleitungen in `docs/` sind nur lokale Referenz und werden nicht eingecheckt.
