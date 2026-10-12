#!/usr/bin/env python3
"""Live numbers and dates for the showcase cards, read from a checkout of the
source platform's repository. Free to run: no network, no AI, just its data
files and its git history.

  source_metrics.py SOURCE_DIR [OUT_JSON]   (default OUT_JSON: build/metrics.json)

Writes {"tools": {id: {"metrics": {key: value}, "improved": date,
"data_as_of": iso}}, "generated": iso}. Anything it cannot read is left out,
and the build falls back to the values written in showcase/tools.json.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# What each tool is made of in the source repo, as git pathspecs. Globs keep
# the source repo's internal package names out of this (public) repository.
TOOL_PATHS = {
    "nfl-lines-tracker": [
        "site/lines.html", "site/nfl.html", "site/linechart.js", "site/oddsmerge.js",
        "site/lib/odds.php", "db/odds_tick.php", ":(glob)etl/**/odds.py",
    ],
    "nfl-injury-tracker": [
        "site/injuries.html", "site/injury.js", "site/lib/injuries.php",
        "db/injury_tick.php", ":(glob)etl/**/sleeper_injuries.py",
    ],
    "nfl-depth-charts": [
        "site/depth-charts.html", "site/madden.js", ":(glob)etl/**/depth_chart.py",
        ":(glob)etl/**/player_bio.py", ":(glob)etl/**/madden.py",
    ],
}


def read(src: Path, rel: str):
    try:
        return json.loads((src / rel).read_text())
    except (OSError, ValueError):
        return None


def iso(stamp: str | None) -> str | None:
    """Normalize the source's stamps ("2026-10-10 19:45" is UTC) to ISO 8601 UTC."""
    if not stamp:
        return None
    s = stamp.strip().replace("Z", "+00:00")
    if len(s) == 16 and s[10] == " ":
        s = s.replace(" ", "T") + ":00+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def latest(*stamps: str | None) -> str | None:
    got = [s for s in (iso(x) for x in stamps) if s]
    return max(got) if got else None


def improved(src: Path, paths: list[str]) -> str | None:
    """Date of the newest commit touching the tool's code (not its data refreshes)."""
    try:
        out = subprocess.run(["git", "-C", str(src), "log", "-1", "--format=%cs", "--", *paths],
                             capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return out or None


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    src = Path(argv[0])
    out = Path(argv[1] if len(argv) > 1 else "build/metrics.json")

    games = read(src, "site/data/odds-games.json") or {}
    futures = read(src, "site/data/odds-futures.json") or {}
    depth = read(src, "site/private/depth-chart.json") or {}
    madden = read(src, "site/private/madden-index.json") or {}
    sleeper_inj = read(src, "site/data/sleeper-injuries.json") or {}

    exchanges = {e.get("source") for wk in (games.get("weeks") or {}).values() for g in wk
                 for e in (g.get("exchanges") or []) if e.get("source")}

    tools = {
        "nfl-lines-tracker": {
            "metrics": {
                "books": len(games.get("books") or []) or None,
                "exchanges": len(exchanges) or None,
                "futures": len(futures.get("markets") or []) or None,
            },
            "data_as_of": latest(games.get("generated"), futures.get("generated")),
        },
        "nfl-injury-tracker": {
            "metrics": {},
            "data_as_of": latest(sleeper_inj.get("updated")),
        },
        "nfl-depth-charts": {
            "metrics": {
                "players": len(depth.get("players") or {}) or None,
                "madden": madden.get("matched"),
            },
            "data_as_of": latest(depth.get("updated"), madden.get("updated")),
        },
    }
    for tid, paths in TOOL_PATHS.items():
        tools[tid]["improved"] = improved(src, paths)
        tools[tid]["metrics"] = {k: v for k, v in tools[tid]["metrics"].items() if v}

    result = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "tools": tools}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
