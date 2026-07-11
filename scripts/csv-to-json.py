#!/usr/bin/env python3
"""
csv-to-json.py — regeneriert data/historical-pool.json aus einem frischen
nbadraft.app Summer-League-Explorer CSV-Export (Modus "Per 36").

Nutzung:
    python3 scripts/csv-to-json.py pfad/zur/neuen-export.csv

Schreibt data/historical-pool.json im Projekt-Root (Pfad relativ zu diesem
Skript, funktioniert unabhängig vom aktuellen Arbeitsverzeichnis).

Wichtig: Dieses Skript ERSETZT historical-pool.json komplett mit dem Inhalt
der übergebenen CSV. Für den täglichen Workflow (neue 2026er-Sommerliga-Stats
zusätzlich einspeisen, ohne bestehende Jahrgänge zu verlieren) siehe
README.md, Abschnitt "Täglich neue Stats einspeisen" — dafür bitte den
bestehenden nbadraft.app-"Alle Jahrgänge"-Export erneut ziehen (der Explorer
kumuliert selbst) und hier erneut durchlaufen lassen, statt einzelne Tages-
Exports zusammenzustückeln.
"""
import csv
import json
import sys
import os

HEADER_MAP = {
    "player": "player_name", "gp": "gp", "min": "min", "pts": "pts", "reb": "reb",
    "ast": "ast", "stl": "stl", "blk": "blk", "tov": "tov", "oreb": "oreb", "dreb": "dreb",
    "pf": "pf", "+/-": "plus_minus", "efg%": "efg_pct", "fgm": "fgm", "fga": "fga",
    "3pm": "fg3m", "3pa": "fg3a", "ftm": "ftm", "fta": "fta", "fg%": "fg_pct",
    "3p%": "fg3_pct", "ft%": "ft_pct", "gmsc": "game_score", "ts%": "ts_pct",
}


def parse_num(txt):
    if txt is None:
        return None
    txt = str(txt).strip()
    if txt in ("", "—", "-"):
        return None
    try:
        return float(txt.replace(",", ""))
    except ValueError:
        return None


def convert(csv_path, out_path):
    rows_out = []
    skipped = 0
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        field_for_col = [HEADER_MAP.get(h.strip().lower()) for h in header]
        if "player_name" not in field_for_col:
            raise SystemExit(f"Keine 'Player'-Spalte im Header gefunden: {header}")

        for cells in reader:
            if len(cells) < 5:
                skipped += 1
                continue
            row = {}
            for field, val in zip(field_for_col, cells):
                if not field:
                    continue
                if field == "player_name":
                    row["player_name"] = val.strip()
                else:
                    row[field] = parse_num(val)
            if not row.get("player_name") or row.get("gp") is None:
                skipped += 1
                continue
            rows_out.append(row)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows_out, f, ensure_ascii=False)

    print(f"{len(rows_out)} Spieler geschrieben nach {out_path} ({skipped} Zeilen übersprungen).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, "..", "data", "historical-pool.json")
    convert(sys.argv[1], out_path)
