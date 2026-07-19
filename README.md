# NBA Front Office

https://pizzaratops.github.io/NBA-Front-Office/

Fantasy-Front-Office-Tool: Roster, Free Agents, Trade Calculator, CBA-Tools und Off-Season-Planer.

## Struktur

```
.
├── .github/workflows/update-data.yml   ← GitHub Action, holt 3x täglich die Sheet-Daten
├── css/style.css                       ← komplettes Styling
├── data/data.json                      ← alle Team-/Spieler-/FA-Daten (wird automatisch aktualisiert)
├── js/app.js                           ← komplette App-Logik
├── scripts/update_data.py              ← Skript, das das Google Sheet lädt und data/data.json schreibt
├── daten.html                          ← zeigt an, wann/woher die Daten zuletzt aktualisiert wurden
├── index.html                          ← die App selbst
└── README.md
```

Vorher war alles (CSS, JS und alle Daten) in einer einzigen `index.html` zusammengefasst.
Jetzt ist es sauber getrennt, damit:
- die Daten automatisch per GitHub Action aktualisiert werden können, ohne den Code anzufassen,
- man CSS/JS einzeln bearbeiten kann,
- `data/data.json` auch von anderen Tools/Skripten wiederverwendet werden kann.

## Automatische Aktualisierung (3x täglich)

`.github/workflows/update-data.yml` läuft automatisch um 07:00, 15:00 und 23:00 UTC
(anpassbar über die `cron`-Zeilen in der Datei) und außerdem manuell über
**Actions → Auto-Update Data → Run workflow**.

Der Workflow:
1. checkt das Repo aus,
2. führt `scripts/update_data.py` aus, welches den öffentlichen CSV-Export
   des Google Sheets lädt (`.../export?format=csv&gid=82`),
3. schreibt die Werte in `data/data.json`,
4. committet & pusht die Änderung automatisch (nur wenn sich etwas geändert hat).

### ⚠️ Noch zu erledigen: Spalten-Mapping

Ich hatte keinen Lesezugriff auf dein Google Sheet, daher weiß
`scripts/update_data.py` aktuell noch **nicht**, welche Spalte z.B. „Gehalt“,
„Spielername“ oder „Bird Rights“ enthält. Das Skript lädt das Sheet bereits
zuverlässig herunter (das funktioniert, weil GitHub-Actions-Runner freien
Internetzugriff haben — im Gegensatz zu meiner Sandbox hier), schreibt aber
erstmal nur den Zeitstempel + die Zeilenanzahl nach `data.json`, ohne die
eigentlichen Spielerdaten zu verändern.

So schließt du die Lücke:
1. Öffne dein Sheet, schau dir die Spaltenüberschriften der ersten Zeile an.
2. Öffne `scripts/update_data.py`, Funktion `parse_sheet_to_data()`.
3. Ersetze den TODO-Block durch echtes Mapping deiner Spalten auf die Felder
   in `data/data.json` (Beispielcode ist bereits als Kommentar vorhanden).
4. Committen, pushen — beim nächsten automatischen Lauf (oder manuell über
   „Run workflow“) werden dann echte Werte übernommen.

Falls du mir die Spaltenüberschriften deines Sheets schickst, schreibe ich dir
das Mapping gerne fertig.

### Sheet muss "öffentlich mit Link" sein

Der CSV-Export (`/export?format=csv&gid=...`) funktioniert nur, wenn das
Sheet auf „Jeder mit dem Link kann ansehen“ freigegeben ist. Falls es aktuell
noch privat ist: Sheet öffnen → *Freigeben* → *Jeder mit dem Link* → *Betrachter*.

### Mehrere Tabs / Reiter im Sheet

Falls Teams, Free Agents und Owner-Caps auf unterschiedlichen Tabs liegen,
in `scripts/update_data.py` einfach die Liste `SHEETS` um weitere
`{"name": "...", "gid": "..."}`-Einträge ergänzen (die `gid` steht in der
URL, wenn du den jeweiligen Tab im Sheet anklickst).

## Lokal testen

```bash
python3 scripts/update_data.py   # aktualisiert data/data.json
python3 -m http.server 8000      # dann im Browser: http://localhost:8000
```

(`index.html` lädt `data/data.json` per `fetch()` — das braucht einen echten
HTTP-Server, `file://` funktioniert wegen CORS nicht.)
