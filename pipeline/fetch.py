"""Download the public source files (Wade's datasets) into data/raw/wade/ with a simple cache.

Also records when each upstream file was last changed (from a tiny blob-less git clone of
wadefagen/datasets) so the UI can say "enrollment status as of <date>".
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from .config import RAW, USER_AGENT, WADE_RAW

WADE_DIR = RAW / "wade"
DATES_FILE = WADE_DIR / "snapshot_dates.json"

STATIC_FILES = [
    "gpa/uiuc-gpa-dataset.csv",
    "geneds/gened-courses.csv",
    "teachers-ranked-as-excellent/uiuc-tre-dataset.csv",
]

# Terms used for offering history (Phase 4): the last 8 regular terms plus summers, and the next term.
HISTORY_TERMS = [
    "2022-fa", "2023-sp", "2023-su", "2023-fa", "2024-sp", "2024-su", "2024-fa", "2025-sp", "2025-su",
    "2025-fa", "2026-sp", "2026-su", "2026-fa", "2027-sp",
]
CURRENT_TERM = "2026-fa"
NEXT_TERM = "2027-sp"


def catalog_path(term: str) -> Path:
    return WADE_DIR / "course-catalog" / "data" / f"{term}.csv"


def _download(rel: str, max_age: timedelta, client: httpx.Client) -> Path:
    dest = WADE_DIR / rel
    if dest.exists() and datetime.now(UTC) - datetime.fromtimestamp(dest.stat().st_mtime, UTC) < max_age:
        return dest
    r = client.get(f"{WADE_RAW}/{rel}")
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    return dest


def fetch_wade(terms: list[str] | None = None, max_age_hours: float = 20) -> list[Path]:
    """Download static datasets + one catalog CSV per term. Cached for `max_age_hours`."""
    rels = STATIC_FILES + [f"course-catalog/data/{t}.csv" for t in (terms or HISTORY_TERMS)]
    out = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=300, follow_redirects=True) as client:
        for rel in rels:
            try:
                out.append(_download(rel, timedelta(hours=max_age_hours), client))
            except httpx.HTTPError as e:
                if (WADE_DIR / rel).exists():
                    print(f"warn: could not refresh {rel} ({e}); using cached copy", file=sys.stderr)
                    out.append(WADE_DIR / rel)
                else:
                    raise
    record_snapshot_dates(rels)
    return out


def record_snapshot_dates(rels: list[str]) -> dict[str, str]:
    """Last upstream commit date per file, via a blob-less shallow clone (commits + trees only)."""
    repo = RAW / "wade-git"
    dates = snapshot_dates()
    try:
        if not repo.exists():
            subprocess.run(
                ["git", "clone", "-q", "--filter=blob:none", "--no-checkout", "--shallow-since=2025-01-01",
                 "https://github.com/wadefagen/datasets.git", str(repo)],
                check=True, timeout=120,
            )
        else:
            subprocess.run(["git", "-C", str(repo), "fetch", "-q", "--filter=blob:none", "origin"],
                           check=True, timeout=120)
            subprocess.run(["git", "-C", str(repo), "update-ref", "HEAD", "FETCH_HEAD"], check=True, timeout=30)
        for rel in rels:
            r = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%cI", "--", rel],
                               capture_output=True, text=True, timeout=60)
            if r.stdout.strip():
                dates[rel] = r.stdout.strip()
    except (subprocess.SubprocessError, OSError) as e:
        print(f"warn: could not read upstream dates ({e}); falling back to download time", file=sys.stderr)
        for rel in rels:
            p = WADE_DIR / rel
            if rel not in dates and p.exists():
                dates[rel] = datetime.fromtimestamp(p.stat().st_mtime, UTC).isoformat(timespec="seconds")
    DATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATES_FILE.write_text(json.dumps(dates, indent=1, sort_keys=True))
    return dates


def snapshot_dates() -> dict[str, str]:
    if DATES_FILE.exists():
        return dict(json.loads(DATES_FILE.read_text()))
    return {}


if __name__ == "__main__":
    for p in fetch_wade():
        print(p)
