"""Winter courses: export web/public/data/winter.json from the newest winter term loaded.

The winter session runs over the break between fall and spring, and nearly every winter class is online. Wade's
course catalog has a winter file once Course Explorer lists it, so until the next winter is out the newest one loaded
is last year's. Course pages show the course's line from here (ran last winter, and in how many of the last three).
A new winter is loaded by adding it to `pipeline/fetch.py` HISTORY_TERMS (the term-watch issue says so).

    python -m pipeline.winter      # print what the export would hold (uses data/illini.db)
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from .course_explorer import term_label, term_sort_key
from .summer import ONLINE, class_courses


def winters(conn: sqlite3.Connection) -> list[str]:
    terms = [r[0] for r in conn.execute("SELECT DISTINCT term FROM sections WHERE term LIKE '%-wi'")]
    return sorted(terms, key=term_sort_key)


def build(conn: sqlite3.Connection, live_terms: tuple[str, ...] = ()) -> dict | None:
    """The newest winter's classes, or None when no winter is loaded. `live_terms`: the current and next term."""
    conn.row_factory = sqlite3.Row
    loaded = winters(conn)
    if not loaded:
        return None
    term, recent = loaded[-1], loaded[-3:]
    ran = {t: set(class_courses(conn, t)) for t in recent}
    rows = []
    for (s, n), ss in sorted(class_courses(conn, term).items()):
        online = sum(1 for r in ss if r["type"] in ONLINE)
        rows.append({
            "s": s, "n": n, "nSec": len(ss),
            "online": "all" if online == len(ss) else "some" if online else "none",
            "ran": sum(1 for t in recent if (s, n) in ran[t]),
        })
    year = int(term[:4])
    # Winter 2027 sorts before Spring 2027: once it's loaded while Fall 2026 is current, it's still ahead
    upcoming = bool(live_terms) and term_sort_key(term) > term_sort_key(live_terms[0])
    return {
        "term": term, "label": term_label(term), "recent": recent, "upcoming": upcoming,
        "next": f"{year + 1}-wi", "next_label": term_label(f"{year + 1}-wi"),
        "courses": rows,
    }


def export(conn: sqlite3.Connection, out_dir: Path, live_terms: tuple[str, ...] = ()) -> str:
    data = build(conn, live_terms)
    if data is None:
        return "no winter term loaded"
    (out_dir / "winter.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return f"{len(data['courses'])} {data['label']} classes"


def main() -> int:
    from .config import DB_PATH
    from .fetch import CURRENT_TERM, NEXT_TERM

    data = build(sqlite3.connect(DB_PATH), (CURRENT_TERM, NEXT_TERM))
    if data is None:
        print("no winter term loaded")
        return 1
    rows = data["courses"]
    print(f"{data['label']}: {len(rows)} classes ({sum(r['online'] == 'all' for r in rows)} online only), "
          f"winters {', '.join(data['recent'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
