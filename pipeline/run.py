"""`make data`: fetch sources, build data/illini.db, export JSON for the web app."""

from __future__ import annotations

import argparse
import sys
import time
from datetime import UTC, datetime

from . import db
from .config import DATA, RAW
from .fetch import CURRENT_TERM, HISTORY_TERMS, NEXT_TERM, WADE_DIR, catalog_path, fetch_wade, snapshot_dates


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--subjects", default="all")
    ap.add_argument("--terms", default=",".join(HISTORY_TERMS))
    ap.add_argument("--source", choices=["auto", "api", "csv"], default="auto",
                    help="Course Explorer source for the current and next term (history always uses the CSV mirror)")
    ap.add_argument("--no-rmp", action="store_true", help="skip Rate My Professors")
    ap.add_argument("--skip-export", action="store_true")
    args = ap.parse_args(argv)
    subjects = None if args.subjects == "all" else {s.strip().upper() for s in args.subjects.split(",")}
    terms = [t.strip() for t in args.terms.split(",") if t.strip()]

    from . import course_explorer, exam_format, export, gpa, instructors, offerings

    log("fetching sources")
    fetch_wade(terms)
    dates = snapshot_dates()
    conn = db.connect()
    db.set_meta(conn, "built_at", datetime.now(UTC).isoformat(timespec="seconds"))
    db.set_meta(conn, "current_term", CURRENT_TERM)
    db.set_meta(conn, "next_term", NEXT_TERM)
    db.set_meta(conn, "subjects", args.subjects)

    log("phase 1: Course Explorer")
    for term in terms:
        src = args.source if term in (CURRENT_TERM, NEXT_TERM) else "csv"
        n, used = course_explorer.load_term(conn, term, subjects, src, catalog_path(term),
                                            dates.get(f"course-catalog/data/{term}.csv", ""))
        log(f"  {term}: {n} sections ({used})")
    conn.commit()

    log("phase 2: GPA")
    df = gpa.load_gpa_csv(WADE_DIR / "gpa" / "uiuc-gpa-dataset.csv")
    if subjects:
        df = df[df["Subject"].isin(subjects)]
    res = gpa.compute(df)
    gpa.store(conn, res)
    gpa.store_geneds(conn, gpa.load_geneds(WADE_DIR / "geneds" / "gened-courses.csv"))
    db.set_meta(conn, "gpa_window", f"{res.window[0]},{res.window[1]}")
    db.set_meta(conn, "gpa_recent", ",".join(res.recent))
    db.set_meta(conn, "gpa_snapshot", dates.get("gpa/uiuc-gpa-dataset.csv", ""))
    db.set_meta(conn, "geneds_snapshot", dates.get("geneds/gened-courses.csv", ""))
    log(f"  {len(res.course)} courses, {len(res.instructor_course)} instructor-course rows")
    conn.commit()

    log("phase 3: instructors + RMP")
    report = instructors.run(conn, df, rmp_enabled=not args.no_rmp,
                             tre_path=WADE_DIR / "teachers-ranked-as-excellent" / "uiuc-tre-dataset.csv",
                             unmatched_path=DATA / "unmatched.csv", rmp_cache=RAW / "rmp")
    log(f"  {report}")
    conn.commit()

    log("phase 4: offerings + changes")
    log(f"  {offerings.run(conn, NEXT_TERM)}")
    conn.commit()

    log("phase 5: exam format")
    log(f"  {exam_format.run(conn)}")
    conn.commit()

    if not args.skip_export:
        log("export JSON")
        log(f"  {export.run(conn)}")
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
