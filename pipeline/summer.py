"""Summer courses (#35): export web/public/data/summer.json from the newest summer term loaded.

Course Explorer publishes a summer's schedule around March (Summer 2027: about March 2027), so until then the newest
summer loaded is last year's. Most summer classes run again each year, so the page shows that summer's classes and
says how many of the last three summers each one ran in. A new summer is loaded by adding it to
`pipeline/fetch.py` HISTORY_TERMS (the term-watch issue says so); this module picks it up on its own.

Only classes are listed: a course needs a primary section that meets as a class (lecture, online, lab, seminar...),
not only independent study, internships, research or study abroad.

    python -m pipeline.summer      # print what the export would hold (uses data/illini.db)
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

from .course_explorer import term_label, term_sort_key

# Section types that aren't a class someone signs up to attend (pipeline/course_explorer.py TYPE_BY_NAME codes)
NOT_A_CLASS = {"IND", "INT", "RES", "STA", "TRV", "PKG"}
ONLINE = {"ONL", "OLC", "OLD", "OD", "OLB"}
# Summer parts of term: Course Explorer's code -> (label, weeks). Read from Summer 2026 sections in Course Explorer
# (2026-11-18): 1, SF and LF run May 18 to Aug 6; S1 May 18 to Jun 12; S2 Jun 15 to Aug 6; S2A Jun 15 to Jul 10;
# S2B Jul 13 to Aug 6; S18 May 18 to Jul 10; A May 18 to Jun 26; B Jun 29 to Aug 6.
SESSIONS = {
    "S1": ("Session I", 4),
    "S2": ("Session II", 8),
    "S2A": ("First half of Session II", 4),
    "S2B": ("Second half of Session II", 4),
    "S18": ("First 8 weeks", 8),
    "A": ("First 6 weeks", 6),
    "B": ("Second 6 weeks", 6),
    "1": ("Full summer", 12),
    "SF": ("Full summer", 12),
    "LF": ("Full summer", 12),
}
ORDER = ["S1", "S18", "A", "full", "S2", "S2A", "S2B", "B", "other"]


def session_id(pot: str) -> str:
    """Course Explorer's part of term -> the id the page filters on ("full" for the three 12-week codes)."""
    if pot in ("1", "SF", "LF"):
        return "full"
    return pot if pot in SESSIONS else "other"


def summers(conn: sqlite3.Connection) -> list[str]:
    terms = [r[0] for r in conn.execute("SELECT DISTINCT term FROM sections WHERE term LIKE '%-su'")]
    return sorted(terms, key=term_sort_key)


def class_courses(conn: sqlite3.Connection, term: str) -> dict[tuple[str, str], list[sqlite3.Row]]:
    """Primary class sections of a term, by course."""
    out: dict[tuple[str, str], list[sqlite3.Row]] = defaultdict(list)
    q = ("SELECT subject, number, type, part_of_term, building FROM sections "
         "WHERE term = ? AND (component = 'primary' OR component IS NULL OR component = '')")
    for r in conn.execute(q, (term,)):
        if r["type"] not in NOT_A_CLASS:
            out[(r["subject"], r["number"])].append(r)
    return out


def build(conn: sqlite3.Connection, live_terms: tuple[str, ...] = ()) -> dict | None:
    """The newest summer's classes, or None when no summer is loaded. `live_terms`: terms with course pages."""
    from .degrees import catalog_from_db
    from .export import r3

    conn.row_factory = sqlite3.Row
    loaded = summers(conn)
    if not loaded:
        return None
    term, recent = loaded[-1], loaded[-3:]
    ran = {t: set(class_courses(conn, t)) for t in recent}
    secs = class_courses(conn, term)
    catalog = catalog_from_db(conn)
    gpa = {(r["subject"], r["number"]): r for r in conn.execute(
        "SELECT subject, number, recent_avg_gpa, recent_students FROM gpa_course")}
    pages = {(r[0], r[1]) for t in live_terms for r in conn.execute(
        "SELECT DISTINCT subject, number FROM sections WHERE term = ?", (t,))}
    rows = []
    for (s, n), ss in sorted(secs.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        c = catalog.get(f"{s} {n}")
        online = sum(1 for r in ss if r["type"] in ONLINE)
        sessions = sorted({session_id(r["part_of_term"] or "") for r in ss}, key=ORDER.index)
        g = gpa.get((s, n))
        rows.append({
            "s": s, "n": n, "t": c.title if c else f"{s} {n}", "cr": c.credits if c else None,
            "codes": c.geneds if c else [], "nSec": len(ss),
            "online": "all" if online == len(ss) else "some" if online else "none",
            "sess": sessions, "ran": sum(1 for t in recent if (s, n) in ran[t]),
            "gpa": r3(g["recent_avg_gpa"]) if g else None, "page": (s, n) in pages,
        })
    year = int(term[:4])
    # after the spring rollover the newest summer is still ahead (current term Spring 2027, Summer 2027 loaded)
    upcoming = bool(live_terms) and term_sort_key(term) > term_sort_key(live_terms[0])
    return {
        "term": term, "label": term_label(term), "recent": recent, "upcoming": upcoming,
        "next": f"{year + 1}-su", "next_label": term_label(f"{year + 1}-su"),
        "courses": rows,
    }


def export(conn: sqlite3.Connection, out_dir: Path, live_terms: tuple[str, ...] = ()) -> str:
    data = build(conn, live_terms)
    if data is None:
        return "no summer term loaded"
    (out_dir / "summer.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return f"{len(data['courses'])} {data['label']} classes"


def main() -> int:
    from .config import DB_PATH
    from .fetch import CURRENT_TERM, NEXT_TERM

    conn = sqlite3.connect(DB_PATH)
    data = build(conn, (CURRENT_TERM, NEXT_TERM))
    if data is None:
        print("no summer term loaded")
        return 1
    rows = data["courses"]
    by_sess: dict[str, int] = defaultdict(int)
    for r in rows:
        for x in r["sess"]:
            by_sess[x] += 1
    print(f"{data['label']}: {len(rows)} classes ({sum(r['online'] == 'all' for r in rows)} online only), "
          f"summers {', '.join(data['recent'])}; by session {dict(by_sess)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
