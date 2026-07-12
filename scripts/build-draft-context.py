#!/usr/bin/env python3
"""
build-draft-context.py — befuellt data/draft-context.json in einem Rutsch aus
den CSV-Tabellen von github.com/sumitrodatta/bball-reference-datasets, einem
oeffentlich gepflegten GitHub-Mirror der Basketball-Reference-Tabellen
(Draft-Historie, Spieler-Bio, Saison-fuer-Saison-Stats). Das ist der Nachfolger
von scrape-draft-context.py (RealGM) und scrape-draft-context-nba-stats.py
(stats.nba.com) — beide Ansaetze sind an Bot-Schutz bzw. IP-Sperren fuer
Cloud-/CI-Infrastruktur gescheitert (siehe README, Abschnitt "Warum kein
direktes Scraping"). Dieser Ansatz laedt stattdessen fertige, bereits
oeffentlich publizierte CSV-Dateien per einfachem HTTPS-GET von
raw.githubusercontent.com — kein Bot-Schutz, keine Sonder-Header noetig, kein
Scraping im eigentlichen Sinn.

WICHTIGE EINSCHRAENKUNG: Dieses Mirror-Repo wird von seinen eigenen
Maintainern periodisch aktualisiert, hinkt der Realitaet aber etwas hinterher
(Stand dieses Scripts: der Datensatz enthaelt den 2026er NBA Draft noch
NICHT). Fuer den aktuellen Draft-Jahrgang bleibt Team-Zuordnung weiterhin
js/draft-lookup.js zustaendig; Position/Alter fuer die ~60-70 aktuellen
Rookies siehe stattdessen data/player-meta-overrides.json (siehe
scripts/export-player-meta bzw. den "Als Datei sichern"-Knopf in daten.html).

Was befuellt wird (pro Spieler, wenn eindeutig zuordenbar):
  team, draftYear, draftRound, draftPick (null = undrafted/UDFA-Hinweis nur
  wenn ein Karriere-Eintrag ohne Draft-Eintrag gefunden wurde), position,
  ageAtDraft (Alter im Jahr des Drafts, daher zeitstabil statt "aktuelles
  Alter"), college, careerGames (Summe ueber alle reguläre-Saison-Zeilen,
  Mehrteam-Sommer-Zeilen ueber die "2TM"/"3TM"-Aggregatzeile entdoppelt).

Namens-Zuordnung: strikt nach Normalisierung (Kleinschreibung, Akzente
entfernt, Jr./Sr./II/III/IV entfernt). Bei MEHRDEUTIGKEIT (zwei verschiedene
echte Spieler mit demselben normalisierten Namen) wird bewusst NICHTS
eingetragen statt zu raten — lieber "-" in der Tabelle als eine falsche
Zuordnung.

Bereits vorhandene Eintraege in draft-context.json, die NICHT von diesem
Script stammen (kein "_source": "auto-bbref"), werden nie ueberschrieben —
manuelle Korrekturen bleiben also erhalten.

Nutzung:
  python3 scripts/build-draft-context.py                 # normaler Lauf
  python3 scripts/build-draft-context.py --dry-run        # nur Report, nichts schreiben
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
HISTORICAL_POOL = os.path.join(DATA_DIR, "historical-pool.json")
CURRENT_SEASON_CSV = os.path.join(DATA_DIR, "current-season-2026.csv")
DRAFT_CONTEXT = os.path.join(DATA_DIR, "draft-context.json")

RAW_BASE = "https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data"
FILES = {
    "draft": "Draft Pick History.csv",
    "career": "Player Career Info.csv",
    "totals": "Player Totals.csv",
    "teams": "Team Abbrev.csv",
}

SOURCE_TAG = "auto-bbref"


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def download_csv(filename):
    url = RAW_BASE + "/" + urllib.request.quote(filename)
    log(f"  Lade {filename} ...")
    with urllib.request.urlopen(url, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(raw)))
    log(f"    {len(rows)} Zeilen.")
    return rows


SUFFIX_RE = re.compile(r"\s+(jr|sr|ii|iii|iv|v)\.?$")


def norm_match(name):
    """Aggressive Normalisierung NUR fuer den Zuordnungs-Vergleich (Akzente/
    Suffixe raus) — die Ablage in draft-context.json erfolgt separat unter
    norm_key(), das exakt js/player-app.js:normalizeKeyName entspricht."""
    s = unicodedata.normalize("NFD", name or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = SUFFIX_RE.sub("", s)
    return s.strip()


def norm_key(name):
    """Muss exakt js/player-app.js:normalizeKeyName entsprechen, damit die
    Ranking-/Vergleichsseite die Eintraege wiederfindet."""
    return (name or "").strip().lower()
    # (JS kollabiert zusaetzlich mehrfache Leerzeichen -- unsere Quellnamen
    # haben davon praktisch nie welche, daher hier bewusst simpel gehalten.)


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)


def our_player_names():
    names = set()
    pool = load_json(HISTORICAL_POOL, [])
    for p in pool:
        if p.get("player_name"):
            names.add(p["player_name"])
    if os.path.exists(CURRENT_SEASON_CSV):
        with open(CURRENT_SEASON_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                n = row.get("Player") or row.get("player") or row.get("player_name")
                if n:
                    names.add(n.strip())
    return sorted(names)


def build_draft_index(rows):
    idx = {}
    for row in rows:
        key = norm_match(row["player"])
        idx.setdefault(key, []).append(row)
    return idx


def build_career_index(rows):
    idx = {}
    for row in rows:
        key = norm_match(row["player"])
        idx.setdefault(key, []).append(row)
    return idx


def build_team_names(rows):
    """(season, abbreviation) -> voller Teamname; zusaetzlich abbreviation ->
    letzter bekannter Name als Fallback fuer Season-Luecken."""
    by_season = {}
    latest = {}
    for row in rows:
        try:
            season = int(row["season"])
        except (KeyError, ValueError):
            continue
        abbr = row["abbreviation"]
        by_season[(season, abbr)] = row["team"]
        if abbr not in latest or season > latest[abbr][0]:
            latest[abbr] = (season, row["team"])
    latest_name = {k: v[1] for k, v in latest.items()}
    return by_season, latest_name


MULTI_TEAM_RE = re.compile(r"^\dTM$")


def build_career_games(rows):
    """player_id -> Summe Karriere-Spiele (regular season), Mehrteam-Saisons
    ueber die 2TM/3TM-Aggregatzeile gezaehlt statt pro Einzelteam-Zeile."""
    by_player_season = {}
    for row in rows:
        pid = row["player_id"]
        season = row["season"]
        team = row["team"]
        try:
            g = int(row["g"])
        except (ValueError, TypeError):
            continue
        k = (pid, season)
        existing = by_player_season.get(k)
        is_multi = bool(MULTI_TEAM_RE.match(team))
        if existing is None:
            by_player_season[k] = (g, is_multi)
        elif is_multi and not existing[1]:
            # Aggregatzeile ersetzt vorher gesehene Einzelteam-Zeile derselben Saison
            by_player_season[k] = (g, True)
        elif not is_multi and existing[1]:
            pass  # Aggregatzeile hat schon Vorrang, Einzelteam-Zeile ignorieren
        # sonst: zwei Einzelteam-Zeilen ohne Aggregatzeile sollte es laut
        # Basketball-Reference-Konvention nicht geben; wir ueberschreiben
        # nicht, um kein Doppelzaehlen zu riskieren.

    totals = {}
    for (pid, _season), (g, _is_multi) in by_player_season.items():
        totals[pid] = totals.get(pid, 0) + g
    return totals


def resolve_entry(our_name, draft_idx, career_idx, team_by_season, team_latest, games_by_pid):
    key = norm_match(our_name)
    draft_matches = draft_idx.get(key, [])
    career_matches = career_idx.get(key, [])

    if len(draft_matches) > 1 or len(career_matches) > 1:
        return None, "ambiguous"

    entry = {"_source": SOURCE_TAG}
    pid = None

    if draft_matches:
        d = draft_matches[0]
        pid = d["player_id"]
        try:
            entry["draftYear"] = int(d["season"])
        except ValueError:
            entry["draftYear"] = None
        try:
            entry["draftRound"] = int(d["round"])
        except (ValueError, KeyError):
            pass
        try:
            entry["draftPick"] = int(d["overall_pick"])
        except (ValueError, KeyError):
            entry["draftPick"] = None
        abbr = d.get("tm")
        if abbr:
            team_name = team_by_season.get((entry.get("draftYear"), abbr)) or team_latest.get(abbr)
            entry["team"] = team_name or abbr
        if d.get("college"):
            entry["college"] = d["college"]
    elif career_matches:
        # Kein Draft-Treffer, aber ein Karriere-Eintrag existiert -> mit
        # hoher Wahrscheinlichkeit ein UDFA, der es trotzdem in die NBA
        # geschafft hat. draftPick bleibt explizit null (siehe player-app.js,
        # rendert das als "UDFA" statt "-").
        entry["draftPick"] = None

    if career_matches:
        c = career_matches[0]
        pid = pid or c["player_id"]
        if c.get("pos"):
            entry["position"] = c["pos"]
        birth_date = c.get("birth_date") or ""
        birth_year_m = re.match(r"(\d{4})", birth_date)
        if birth_year_m and entry.get("draftYear"):
            entry["ageAtDraft"] = entry["draftYear"] - int(birth_year_m.group(1))
        if c.get("colleges") and "college" not in entry:
            entry["college"] = c["colleges"]

    if pid and pid in games_by_pid:
        entry["careerGames"] = games_by_pid[pid]

    if len(entry) <= 1:  # nur "_source" gesetzt, kein echter Treffer
        return None, "no_match"

    return entry, "ok"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log("Lade Basketball-Reference-Tabellen (github.com/sumitrodatta/bball-reference-datasets)...")
    draft_rows = download_csv(FILES["draft"])
    career_rows = download_csv(FILES["career"])
    totals_rows = download_csv(FILES["totals"])
    team_rows = download_csv(FILES["teams"])

    draft_idx = build_draft_index(draft_rows)
    career_idx = build_career_index(career_rows)
    team_by_season, team_latest = build_team_names(team_rows)
    games_by_pid = build_career_games(totals_rows)

    names = our_player_names()
    log(f"{len(names)} Spielernamen im eigenen Datenbestand (historisch + aktuelle Saison).")

    existing = load_json(DRAFT_CONTEXT, {})
    readme = existing.pop("_readme", None)

    stats = {"ok": 0, "ambiguous": 0, "no_match": 0, "kept_manual": 0}
    for name in names:
        k = norm_key(name)
        if k in existing and existing[k].get("_source") != SOURCE_TAG:
            stats["kept_manual"] += 1
            continue  # manuell gepflegter/anderer Eintrag -> nicht anfassen
        entry, status = resolve_entry(name, draft_idx, career_idx, team_by_season, team_latest, games_by_pid)
        stats[status] = stats.get(status, 0) + 1
        if entry:
            existing[k] = entry
        elif k in existing and existing[k].get("_source") == SOURCE_TAG:
            # war vorher auto-befuellt, ist es jetzt nicht mehr (z.B. Quelle
            # hat den Eintrag verloren) -> lieber stehen lassen als loeschen
            pass

    log(f"Ergebnis: {stats.get('ok',0)} automatisch befuellt/aktualisiert, "
        f"{stats.get('ambiguous',0)} mehrdeutig uebersprungen, "
        f"{stats.get('no_match',0)} kein Treffer (kein bball-ref-Datensatz), "
        f"{stats['kept_manual']} manuelle Eintraege unangetastet gelassen.")

    existing["_readme"] = readme or (
        "Automatisch befuellt via scripts/build-draft-context.py aus "
        "github.com/sumitrodatta/bball-reference-datasets (oeffentlicher "
        "Basketball-Reference-Mirror, taeglich per Workflow neu abgeglichen). "
        "Eintraege mit \"_source\":\"auto-bbref\" werden bei jedem Lauf "
        "automatisch aktualisiert; alle anderen (z.B. manuell nachgetragene) "
        "Eintraege bleiben unangetastet. Key = Spielername exakt wie im "
        "eigenen Datenbestand, nur trim+lowercase (siehe normalizeKeyName in "
        "js/player-app.js). Deckt den AKTUELLEN Draft-Jahrgang bewusst NICHT "
        "ab, da das Quell-Repo dem echten NBA-Draft etwas hinterherhinkt -- "
        "dafuer siehe js/draft-lookup.js und data/player-meta-overrides.json."
    )

    if args.dry_run:
        log("Dry-Run: nichts geschrieben.")
        return

    save_json(DRAFT_CONTEXT, existing)
    log(f"data/draft-context.json geschrieben ({len(existing) - 1} Eintraege total).")


if __name__ == "__main__":
    main()
