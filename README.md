# MFHFB Sticky Score

Summer-League-Analyse-Tool: Sticky Score / Rotation Score + Spieler-Vergleich
(Spinnendiagramm gegen historische Summer-League-Spieler). Läuft komplett im
Browser, keine Backend-Abhängigkeit — als GitHub Pages hostbar.

## Struktur

```
site/
  index.html              Haupt-Tool: Modus/Gewichtung, Sticky/Rotation Score, Ranking-Tabelle
  daten.html               Daten laden (CSV/Paste) + Methodik-Erklärung (ausgelagert aus index.html)
  player.html              Vergleichsseite: Spinnendiagramm + Top-5-Comps + Erfolgs-Anhaltspunkt
  css/style.css            gemeinsames Stylesheet, Pastell-Palette mit Dark-Mode-Variablenset
  js/theme.js               Dark-/Light-Mode-Toggle (Button-Icon + Klick-Handler; Attribut selbst
                            wird per Inline-Script im <head> jeder Seite gesetzt, gegen Flackern)
  js/stats.js              Kern-Rechenlogik (Parsing, Sticky/Rotation Score) — von index.html & player.html genutzt
  js/draft-lookup.js       Team-Zuordnung 2026er Draft-Klasse (informativ, nicht Teil des Scores)
  js/similarity.js         Vergleichs-Engine (z-normalisierte euklidische Distanz)
  js/radar.js              generischer SVG-Spinnendiagramm-Renderer
  js/app.js                Seiten-Logik index.html (Storage lesen, Tabellen-Rendering, Score neu berechnen)
  js/data-app.js            Seiten-Logik daten.html (CSV/Paste parsen, in denselben localStorage-Pool schreiben)
  js/player-app.js         Seiten-Logik player.html (Suche, Comp-Rendering, Erfolgs-Badge, DraftGuru-Link)
  data/historical-pool.json   historischer Katalog (~1.870 Spieler, 2013–2026, aus nbadraft.app-Export)
  data/draft-context.json     Pos./Team/Draft-Pick/Karriere-Spiele für Vergleichsspieler (automatisch, ~85% Abdeckung — siehe unten)
  data/player-meta-overrides.json  Position/Alter-Basiswerte für die aktuelle Draft-Klasse (Export-Knopf in index.html)
  scripts/csv-to-json.py      regeneriert historical-pool.json aus einem frischen CSV-Export
  scripts/build-draft-context.py  befüllt draft-context.json aus github.com/sumitrodatta/bball-reference-datasets
```

`daten.html` und `index.html` teilen sich denselben localStorage-Key
(`mfhfb_sticky_score_players`) über zwei getrennte, kleine JS-Dateien
(`data-app.js` schreibt, `app.js` liest) — dadurch bleiben beide Seiten
synchron, ohne dass `index.html` die Upload-UI selbst enthalten muss.

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

**Aktuelle Draft-Klasse (Position/Alter):** In `index.html` einmalig pro
Spieler zuordnen (Dropdown-Felder). Persistiert im `localStorage` des
Browsers — und lässt sich zusätzlich über den Knopf "💾 Position/Alter als
Datei sichern" als `data/player-meta-overrides.json` exportieren und ins
Repo committen. Danach übersteht die Zuordnung auch das komplette Leeren des
Browser-Speichers, weil sie beim Seitenstart als Basiswert nachgeladen wird.
Grund, warum das nicht automatisch geht: Basketball-Reference & Co. tragen
den jeweils aktuellsten Draft-Jahrgang typischerweise erst mit einigen
Wochen/Monaten Verzug in ihre öffentlichen Datensätze ein (Stand dieses
Repos: der 2026er Draft fehlt in der unten verlinkten Quelle noch) — für die
laufende Saison gibt es also (noch) keine saubere automatisierbare Quelle.

## Draft-Context (historischer Vergleichspool)

`data/draft-context.json` ist bewusst **getrennt** vom eigentlichen
Ähnlichkeits-Score — er liefert nur die informativen Spalten "Pos.",
"Team (Jahr)", "Draft-Pick" und "Karriere-Spiele" in der Vergleichstabelle
auf `player.html`. Die Summer-League-CSV enthält diese Daten selbst nicht.

Wird automatisch befüllt von `scripts/build-draft-context.py`, das die
fertigen CSV-Tabellen von
[github.com/sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets)
lädt — ein öffentlich gepflegter GitHub-Mirror der Basketball-Reference-
Tabellen (Draft-Historie, Spieler-Bio, Saison-für-Saison-Statlinien). Läuft
wöchentlich über `.github/workflows/update-draft-context.yml`, deckt
aktuell **~1.580 von ~1.870** historischen Spielern automatisch ab.

**Warum kein direktes Scraping:** Zwei frühere Anläufe sind daran
gescheitert, dass GitHub-Actions-Runner aus Rechenzentrums-IP-Bereichen
laufen, die von Bot-Schutz-Systemen aktiv geblockt werden:
- `basketball.realgm.com` — konsequentes `403 Forbidden` auf jede Anfrage
  (CrowdSec o.ä.), kein Parsing-Problem, sondern eine bewusste Netzwerksperre.
- `stats.nba.com` (offizielle NBA-API) — technisch erreichbar, aber
  Sonder-Header-abhängig (Referer/Origin/x-nba-stats-*) und nicht offiziell
  für Drittzugriffe gedacht; Verlässlichkeit aus CI-Umgebungen unklar.

Der jetzige Ansatz umgeht beides: `raw.githubusercontent.com` liefert
fertige, bereits von den bball-reference-datasets-Maintainern selbst
gepflegte CSV-Dateien per einfachem HTTPS-GET aus — kein Bot-Schutz, keine
Sonder-Header, kein Namens-Scraping gegen eine Fanseite.

**Bekannte Lücke:** Der Quell-Datensatz hinkt dem echten NBA-Draft um einige
Monate hinterher — der jeweils aktuellste Draft-Jahrgang (aktuell: 2026)
fehlt dort, bis die Maintainer nachziehen. Für die aktuelle Saison bleibt
Team-Zuordnung deshalb weiterhin `js/draft-lookup.js` (hardcodierte Liste),
Position/Alter siehe `data/player-meta-overrides.json` oben.

Warum keine Ableitung des Draft-Jahrs aus der Anzahl/dem Jahr der
Summer-League-Spiele (Idee: "1 Spiel → Draft-Jahr = Erscheinungsjahr"):
funktioniert nur für Spieler, die genau einmal und im Draft-Jahr selbst in
der Summer League aufgetaucht sind — viele Spieler spielen mehrere
Jahrgänge SL (Two-Way-Verträge, Comeback-Versuche, verletzungsbedingt
verschobene Rookie-Saison), und die von `csv-to-json.py` erzeugte
`historical-pool.json` aggregiert ohnehin über alle SL-Jahrgänge eines
Spielers hinweg (keine Jahres-Spalte pro Zeile). Die Heuristik wäre also für
einen unbekannten, vermutlich nicht kleinen Anteil der Spieler schlicht
falsch — echte Draft-Pick-History (wie oben) ist die zuverlässigere Quelle,
wo verfügbar; für den Rest lieber "—" als eine geratene Zahl.

Schema pro Eintrag (Key = Spielername exakt wie im eigenen Datenbestand,
nur `trim().toLowerCase()`):

```json
"spielername": {
  "_source": "auto-bbref",
  "team": "Team-Name", "draftYear": 2019, "draftRound": 1, "draftPick": 22,
  "position": "F-C", "ageAtDraft": 19, "college": "Duke", "careerGames": 350
}
```

Einträge mit `"_source": "auto-bbref"` werden bei jedem Workflow-Lauf
automatisch neu geschrieben. Alles andere (z.B. von Hand nachgetragene
Einträge ohne dieses Feld) bleibt beim nächsten Lauf unangetastet — auch
wenn du `_source` einfach weglässt. Für Undrafted-Spieler mit NBA-Laufbahn:
`"draftPick": null`. Fehlt ein Eintrag komplett, zeigt die Vergleichstabelle
"—" — das Tool bricht dabei nicht.

Manueller Nachtrag (z.B. für den aktuellen Draft-Jahrgang, sobald relevant)
bleibt weiterhin möglich — einfach ohne `"_source": "auto-bbref"` eintragen,
dann fasst der automatische Lauf den Eintrag nicht mehr an.

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
- `draft-context.json` deckt ~85% des historischen Pools ab (s.o.), nicht
  100% — behandle die Pos./Team/Pick/Karriere-Spalten weiterhin als Kontext,
  nicht als lückenlose Datenbasis. Der aktuelle Draft-Jahrgang fehlt dort
  systembedingt bis die Quelle nachzieht.
- Beim Öffnen direkt als `file://` lädt `player.html` die JSON-Dateien nicht
  (CORS) — lokalen Server oder GitHub Pages nutzen.
