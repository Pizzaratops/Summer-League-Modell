#!/usr/bin/env python3
"""
scrape-draft-context.py — reichert data/draft-context.json automatisch aus
RealGM (basketball.realgm.com) an: Position, Draftjahr, Draft-Runde/-Pick,
Team, Alter/Geburtsdatum, Pre-Draft-Team, Karriere-Spiele.

WICHTIG — Stand vor dem ersten echten Lauf:
Die Feld-Erkennung (siehe parse_bio_block) basiert auf dem Bio-Block-Muster
"**Label:** Wert", das auf jeder RealGM-Spielerseite direkt unter dem Foto
steht (z.B. "**NBA Draft:** [2019](...) Round 1, Pick 1, New Orleans
Pelicans"). Das Muster wurde an echten Seiten (u.a. Zion Williamson,
AJ Dybantsa) geprüft, aber NICHT gegen den rohen HTML-Quelltext (nur gegen
eine text-extrahierte Ansicht) — vor dem produktiven Scharfschalten daher
einmal manuell mit --dry-run und wenigen bekannten Spielern laufen lassen
und die Ausgabe in draft-context.debug.json kontrollieren.

Ablauf:
  1) ID-Auflösung: Für jedes Jahr 2013..aktuell wird die RealGM
     Summer-League-Statsseite dieses Jahres geladen. Jeder Spielername
     dort ist auf seine numerische Profil-ID verlinkt — daraus entsteht
     eine Name -> ID Zuordnung ohne Fuzzy-Matching. Ergebnis wird in
     data/realgm-id-cache.json zwischengespeichert (nur neue Jahre/Spieler
     werden nachgeladen).
  2) Bio-Scraping: Für Spieler aus data/historical-pool.json, die noch
     keinen Eintrag in data/draft-context.json haben, wird die Profilseite
     geladen und der Bio-Block geparst. Läuft INKREMENTELL (siehe
     MAX_NEW_PLAYERS_PER_RUN) — RealGM zeigt bei zu vielen Anfragen zu
     schnell hintereinander gelegentlich eine Bot-Detection-Seite, das
     Script erkennt das, wartet mit Backoff und versucht es erneut.

Nutzung:
  python3 scripts/scrape-draft-context.py                # normaler Lauf
  python3 scripts/scrape-draft-context.py --dry-run       # nichts schreiben, nur loggen
  python3 scripts/scrape-draft-context.py --limit 5 --only "Zion Williamson,AJ Dybantsa"
"""
import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
HISTORICAL_POOL = os.path.join(DATA_DIR, "historical-pool.json")
DRAFT_CONTEXT = os.path.join(DATA_DIR, "draft-context.json")
ID_CACHE = os.path.join(DATA_DIR, "realgm-id-cache.json")
DEBUG_OUT = os.path.join(DATA_DIR, "draft-context.debug.json")

BASE = "https://basketball.realgm.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

MAX_NEW_PLAYERS_PER_RUN = 80   # Politeness-Limit gegen Bot-Detection/Sperren
REQUEST_DELAY_RANGE = (1.5, 3.5)   # Sekunden Pause zwischen Profilseiten-Abrufen
BOT_DETECTION_MARKERS = ("access denied", "are you a human", "captcha", "blocked")

PLAYER_LINK_RE = re.compile(
    r'href="/player/([^/"]+)/Summary/(\d+)"[^>]*>\s*([^<]+?)\s*<'
)

# Bio-Feld-Muster: "**Label:** ..." wie im Bio-Block jeder Profilseite.
BIO_LINE_RE = re.compile(r"\*\*([^*:]+):\*\*\s*(.+)")
DRAFT_LINE_RE = re.compile(
    r"(\d{4}).*?Round\s+(\d+),\s*Pick\s+(\d+)", re.IGNORECASE
)
UNDRAFTED_RE = re.compile(r"undrafted", re.IGNORECASE)
AGE_RE = re.compile(r"\((\d+)\s*years? old\)")
HEADER_RE = re.compile(r"^##\s+(.+?)\s+([A-Z/]{1,3})\s+#\d+\s*$", re.MULTILINE)


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def fetch(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                raw = resp.read()
                text = raw.decode("utf-8", errors="replace")
                lowered = text.lower()
                if any(marker in lowered for marker in BOT_DETECTION_MARKERS) and len(text) < 5000:
                    raise RuntimeError("Bot-Detection-Seite erkannt")
                return text
        except Exception as e:  # noqa: BLE001 - bewusst breit, da wir immer retryen wollen
            wait = (2 ** attempt) + random.uniform(0.5, 1.5)
            log(f"  Fehler bei {url}: {e} -- retry in {wait:.1f}s ({attempt + 1}/{retries})")
            time.sleep(wait)
    return None


def normalize_key(name):
    return (name or "").strip().lower()


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)


def collect_ids_for_year(year):
    """Sammelt Name -> RealGM-ID Zuordnungen aus der Summer-League-Statsseite eines Jahres.

    ACHTUNG: erfasst nur Spieler, die in DIESEM Jahr schon Summer-League-
    Spielzeit haben. Aktuelle Draftees, die noch nicht (oder von RealGM noch
    nicht erfasst) in der Summer League gespielt haben, fehlen hier -- dafuer
    siehe collect_ids_from_draft_results().
    """
    url = f"{BASE}/nba/stats/{year}/Averages/Qualified/points/All/desc/1/Summer_League"
    html = fetch(url)
    if not html:
        log(f"  Konnte SL-Statsseite fuer {year} nicht laden, ueberspringe.")
        return {}
    mapping = {}
    for slug, pid, display_name in PLAYER_LINK_RE.findall(html):
        mapping[normalize_key(display_name)] = pid
    log(f"  SL-Stats {year}: {len(mapping)} Spieler-IDs gefunden.")
    time.sleep(random.uniform(*REQUEST_DELAY_RANGE))
    return mapping


def collect_ids_from_draft_results(year):
    """Sammelt Name -> RealGM-ID Zuordnungen aus den Draftergebnissen eines Jahres.

    Unabhaengig von Summer-League-Aktivitaet -- diese Seite ist direkt nach
    dem Draft selbst befuellt (z.B. past_drafts/2026 kurz nach der Draft-
    Nacht), deshalb die bevorzugte Quelle fuer den AKTUELLEN Draft-Jahrgang,
    bei dem die Summer-League-Stats evtl. noch nicht online sind.
    """
    url = f"{BASE}/nba/draft/past_drafts/{year}"
    html = fetch(url)
    if not html:
        log(f"  Konnte Draftergebnisse fuer {year} nicht laden, ueberspringe.")
        return {}
    mapping = {}
    for slug, pid, display_name in PLAYER_LINK_RE.findall(html):
        mapping[normalize_key(display_name)] = pid
    log(f"  Draft {year}: {len(mapping)} Spieler-IDs gefunden.")
    time.sleep(random.uniform(*REQUEST_DELAY_RANGE))
    return mapping


def build_id_cache(years, existing_cache, current_year=None):
    """Erweitert den ID-Cache um fehlende Jahre (Cache wird nie geloescht, nur ergaenzt).

    Fuer alle Jahre: SL-Stats-Seite. Zusaetzlich fuer das aktuelle Jahr
    (current_year, typischerweise das laufende Draftjahr): auch die
    Draftergebnis-Seite, da dort auch Spieler ohne SL-Auftritt (noch) drin
    sind. Bei Namensgleichheit gewinnt die SL-Stats-ID (spezifischer),
    Draft-Ergebnis-ID ist nur Fallback.
    """
    cache = dict(existing_cache)
    done_years = set(cache.get("_years_done", []))
    done_draft_years = set(cache.get("_draft_years_done", []))
    id_map = cache.get("ids", {})

    for year in years:
        if year in done_years:
            continue
        new_ids = collect_ids_for_year(year)
        for k, v in new_ids.items():
            id_map[k] = v
        done_years.add(year)

    if current_year is not None and current_year not in done_draft_years:
        draft_ids = collect_ids_from_draft_results(current_year)
        for k, v in draft_ids.items():
            id_map.setdefault(k, v)  # nur auffuellen, SL-Daten (falls vorhanden) haben Vorrang
        done_draft_years.add(current_year)

    cache["ids"] = id_map
    cache["_years_done"] = sorted(done_years)
    cache["_draft_years_done"] = sorted(done_draft_years)
    return cache


def parse_bio_block(html, player_name):
    """Extrahiert Position/Alter/Draft/Team aus dem Bio-Block der Profilseite.

    ACHTUNG: basiert auf text-extrahiertem Markdown-Muster, siehe Docstring
    oben. Bei Aenderungen am RealGM-Template muss dies angepasst werden.
    """
    result = {
        "team": None,
        "position": None,
        "draftYear": None,
        "draftRound": None,
        "draftPick": None,
        "age": None,
        "preDraftTeam": None,
        "careerGames": None,
        "_raw_match_debug": {},
    }

    header_match = HEADER_RE.search(html)
    if header_match:
        result["position"] = header_match.group(2)
        result["_raw_match_debug"]["header"] = header_match.group(0)

    for line in html.splitlines():
        m = BIO_LINE_RE.search(line)
        if not m:
            continue
        label, value = m.group(1).strip(), m.group(2).strip()
        label_lower = label.lower()

        if label_lower == "born":
            age_m = AGE_RE.search(value)
            if age_m:
                result["age"] = int(age_m.group(1))
            result["_raw_match_debug"]["born"] = value

        elif label_lower == "current team":
            # Linktext wie "[New Orleans Pelicans](...)" -> Klartext extrahieren
            text_m = re.search(r"\[([^\]]+)\]", value)
            result["team"] = text_m.group(1) if text_m else value
            result["_raw_match_debug"]["current_team"] = value

        elif label_lower == "nba draft":
            if UNDRAFTED_RE.search(value):
                result["draftPick"] = None
            else:
                d_m = DRAFT_LINE_RE.search(value)
                if d_m:
                    result["draftYear"] = int(d_m.group(1))
                    result["draftRound"] = int(d_m.group(2))
                    result["draftPick"] = int(d_m.group(3))
            result["_raw_match_debug"]["nba_draft"] = value

        elif label_lower == "pre-draft team":
            text_m = re.search(r"\[([^\]]+)\]", value)
            result["preDraftTeam"] = text_m.group(1) if text_m else value

    # Karriere-Spiele: steht meist im Fliesstext "Zion Williamson played X
    # seasons... in Y games" auf der FAQ-Seite, NICHT auf Summary -- daher
    # hier bewusst nicht geparst (siehe TODO unten). Fuer den Vergleichs-
    # Kontext ist Team/Draft/Position/Alter ohnehin der wichtigere Teil.

    return result


def scrape_player_bio(player_name, player_id):
    slug = player_name.strip().replace(" ", "-")
    url = f"{BASE}/player/{slug}/Summary/{player_id}"
    html = fetch(url)
    if not html:
        return None
    return parse_bio_block(html, player_name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Nichts committen/schreiben, nur nach draft-context.debug.json loggen")
    parser.add_argument("--limit", type=int, default=MAX_NEW_PLAYERS_PER_RUN, help="Max. neue Spieler in diesem Lauf")
    parser.add_argument("--only", type=str, default=None, help="Kommagetrennte Namensliste zum gezielten Testen")
    parser.add_argument("--start-year", type=int, default=2013)
    parser.add_argument("--end-year", type=int, default=2026)
    args = parser.parse_args()

    pool = load_json(HISTORICAL_POOL, [])
    all_names = [p["player_name"] for p in pool] if pool else []
    if args.only:
        all_names = [n.strip() for n in args.only.split(",")]

    draft_context = load_json(DRAFT_CONTEXT, {})
    draft_context.pop("_readme", None)  # wird am Ende neu gesetzt

    id_cache = load_json(ID_CACHE, {"ids": {}, "_years_done": []})

    todo_names = [n for n in all_names if normalize_key(n) not in draft_context]
    log(f"{len(todo_names)} Spieler ohne draft-context-Eintrag (von {len(all_names)} gesamt).")

    if not todo_names:
        log("Nichts zu tun.")
        return

    years = list(range(args.start_year, args.end_year + 1))
    id_cache = build_id_cache(years, id_cache, current_year=args.end_year)
    id_map = id_cache["ids"]

    processed = 0
    debug_log = {}
    for name in todo_names:
        if processed >= args.limit:
            log(f"Limit von {args.limit} neuen Spielern erreicht, Rest folgt im naechsten Lauf.")
            break
        key = normalize_key(name)
        pid = id_map.get(key)
        if not pid:
            log(f"  Keine RealGM-ID gefunden fuer '{name}', ueberspringe (evtl. anderer Jahrgang noetig).")
            continue
        log(f"  Lade Profil: {name} (ID {pid})")
        bio = scrape_player_bio(name, pid)
        time.sleep(random.uniform(*REQUEST_DELAY_RANGE))
        if not bio:
            log(f"  Konnte Profil fuer '{name}' nicht laden.")
            continue
        debug_log[key] = bio
        entry = {k: v for k, v in bio.items() if not k.startswith("_raw")}
        entry["realgmId"] = pid
        draft_context[key] = entry
        processed += 1

    log(f"{processed} Spieler neu verarbeitet.")

    if args.dry_run:
        save_json(DEBUG_OUT, debug_log)
        log(f"Dry-Run: nichts geschrieben, Debug-Ausgabe in {DEBUG_OUT}")
        return

    draft_context["_readme"] = (
        "Automatisch befuellt via scripts/scrape-draft-context.py (Quelle: "
        "basketball.realgm.com). Key = Spielername normalisiert "
        "(trim + lowercase). Wird inkrementell ergaenzt, nie komplett "
        "neu geschrieben. Manuelle Korrekturen bleiben erhalten, solange "
        "der Key nicht erneut ueberschrieben wird."
    )
    save_json(DRAFT_CONTEXT, draft_context)
    save_json(ID_CACHE, id_cache)
    save_json(DEBUG_OUT, debug_log)
    log(f"draft-context.json aktualisiert ({len(draft_context) - 1} Eintraege total).")


if __name__ == "__main__":
    main()
