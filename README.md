# MFHFB Sticky Score

Summer-League-Analyse-Tool: Sticky Score / Rotation Score + Spieler-Vergleich
(Spinnendiagramm gegen historische Summer-League-Spieler). Läuft komplett im
Browser, keine Backend-Abhängigkeit — als GitHub Pages hostbar.

## Struktur

```
site/
  index.html              Haupt-Tool: CSV laden, Sticky/Rotation Score, Ranking-Tabelle
  player.html             Vergleichsseite: Spinnendiagramm + Top-5-Comps
  css/style.css           gemeinsames Stylesheet
  js/stats.js             Kern-Rechenlogik (Parsing, Sticky/Rotation Score) — von beiden Seiten genutzt
  js/draft-lookup.js       Team-Zuordnung 2026er Draft-Klasse (informativ, nicht Teil des Scores)
  js/similarity.js         Vergleichs-Engine (z-normalisierte euklidische Distanz)
  js/radar.js              generischer SVG-Spinnendiagramm-Renderer
  js/app.js                Seiten-Logik index.html (Storage, Tabellen-Rendering)
  js/player-app.js         Seiten-Logik player.html (Suche, Comp-Rendering)
  data/historical-pool.json   historischer Katalog (~1.870 Spieler, 2013–2026, aus nbadraft.app-Export)
  data/draft-context.json     BEST-EFFORT Zusatzdaten: Team/Draft-Pick/Karriere-Spiele (siehe unten)
  scripts/csv-to-json.py      regeneriert historical-pool.json aus einem frischen CSV-Export
```

## Lokal starten

Browser blockieren `fetch()` auf lokale Dateien (`file://`) per CORS — die
JSON-Dateien unter `data/` laden deshalb nur über einen echten Server:

```bash
cd site
python3 -m http.server 8000
# dann im Browser: http://localhost:8000/index.html
```

Auf GitHub Pages funktioniert es automatisch, da dort immer über `https://`
ausgeliefert wird.

## Täglich neue Stats einspeisen

**Beides läuft jetzt automatisch, ohne dass du etwas hochladen musst:**

- `.github/workflows/update-historical-pool.yml` (08:00 UTC) — lädt den vollen
  "Alle Jahrgänge"-Export und regeneriert `data/historical-pool.json` (Vergleichsmotor).
- `.github/workflows/update-current-season.yml` (08:15 UTC) — lädt gefiltert nur die
  2026er Draft-Klasse aus der 2026er Summer League
  (`...&year_min=2026&draft_class=2026&format=csv`) und speichert sie als
  `data/current-season-2026.csv`. `index.html` lädt diese Datei automatisch beim
  Öffnen der Seite (`autoLoadCurrentSeason()` in `js/app.js`) — kein Paste/Upload mehr nötig.

Einmalig einrichten: Repo → Settings → Actions → General → unter "Workflow
permissions" **"Read and write permissions"** aktivieren (sonst dürfen die
Actions nicht committen). Danach manuell antriggern zum Testen: Tab "Actions" →
gewünschten Workflow auswählen → "Run workflow".

**Wichtig beim Umstieg:** Falls du vorher schon manuell 2026er-Daten hochgeladen
hattest, einmal auf "Gespeicherte Daten löschen" klicken, damit die alten
manuellen Einträge nicht doppelt neben den neuen automatischen auftauchen
(unterschiedliche interne Quellenkennung, würde sonst zu Doppelzeilen führen).

**Der Upload/Paste-Bereich in `index.html` bleibt bestehen** — für zusätzliche
Spieler, Korrekturen, oder falls nbadraft.app den Filter mal ändert und die
Action ausfällt.

**Manuell (Fallback, falls Actions mal nicht laufen sollen):**

1. Im nbadraft.app Summer League Explorer den **gesamten** Export (alle
   Jahrgänge inkl. der neuesten 2026er-Spiele) als CSV ziehen — der Explorer
   kumuliert selbst, du musst keine Tages-Deltas basteln.
2. `python3 scripts/csv-to-json.py pfad/zur/csv` ausführen → schreibt
   `data/historical-pool.json` neu.
3. Committen & pushen. Das Vergleichs-Feature auf `player.html` zieht danach
   automatisch die aktuellen Zahlen.

**Weiterhin manuell (nicht automatisierbar):** Position/Alter/Draft-Pick pro
neuem Spieler in `index.html` einmalig zuordnen (Dropdown-Felder) — das war
nie Teil der CSV und wird von dir gepflegt. Persistiert dauerhaft im
`localStorage` des Browsers.

## Draft-Context erweitern

`data/draft-context.json` ist bewusst **getrennt** vom eigentlichen
Ähnlichkeits-Score — er liefert nur die informativen Spalten "Team (Jahr)",
"Draft-Pick" und "Karriere-Spiele" in der Vergleichstabelle. Die
Summer-League-CSV enthält diese Daten NICHT, deshalb ist die Datei aktuell
nur mit 2 verifizierten Beispiel-Einträgen (Jarrett Allen, Deandre Ayton)
gefüllt statt für den ganzen ~1.870-Spieler-Katalog.

Schema pro Eintrag (Key = Spielername, `trim().toLowerCase()`):

```json
"spielername": {"team": "Team-Name", "draftYear": 2019, "draftPick": 22, "careerGames": 350}
```

Für Undrafted-Spieler: `"draftPick": null`. Fehlt ein Eintrag komplett, zeigt
die Vergleichstabelle einfach "—" — das Tool bricht dabei nicht.

Zum Erweitern eignen sich die Draft-Class-Seiten auf basketball-reference.com
(ein Seitenaufruf pro Jahrgang liefert Team/Pick/Karriere-Spiele für alle 60
Picks dieses Jahres). Undrafted-Spieler mit NBA-Spielen lassen sich einzeln
nachtragen. Das ist der einzige Teil des Tools, der laufende manuelle Pflege
braucht — alles andere (Sticky Score, Rotation Score, Ähnlichkeits-Engine)
funktioniert vollautomatisch aus der Summer-League-CSV.

## Wie die Vergleichs-Engine funktioniert

`js/similarity.js`: für jeden Spieler mit ≥40 Gesamtminuten (GP × MPG) wird
ein 11-dimensionaler "Shape-Vektor" gebildet (PTS/TRB/ORB/AST/STL/BLK/TOV pro
36, 3PAr, FTr, TS%, eFG%), z-normalisiert gegen den gesamten Pool. Die
Ähnlichkeit zwischen zwei Spielern ist die euklidische Distanz zwischen ihren
Vektoren — kein Positions-Tag nötig, das Statprofil selbst impliziert die
Rolle (ein Big mit vielen Rebounds/Blocks landet automatisch bei anderen
Bigs).

Getestet gegen den ursprünglichen Prototyp-Fall (Hannes Steinbach, 1 Spiel,
24,8 PTS/36, 18,2 TRB/36, 3,3 BLK/36, TS% 85,6): Top-Comp ist weiterhin
Jarrett Allen, gefolgt von mehreren anderen effizienten Rim-Runnern ohne
Distanzwurf — konsistent mit dem ursprünglichen Testergebnis.

## Bekannte Grenzen

- Die Ähnlichkeits-Engine sieht nur Summer-League-Boxscore-Raten — keine
  Athletik, Verletzungshistorie oder Scouting-Einschätzung (gleiche Grenze
  wie beim Sticky Score selbst, siehe `Sticky-Score-Erklaerung.md`).
- `draft-context.json` ist unvollständig (s.o.) — behandle die
  Team/Pick/Karriere-Spalten als Kontext, nicht als vollständige Datenbasis.
- Beim Öffnen direkt als `file://` lädt `player.html` die JSON-Dateien nicht
  (CORS) — lokalen Server oder GitHub Pages nutzen.
