"""Copy real rows for the four reference courses out of the downloaded sources into fixtures/.

Run after `python -m pipeline.fetch`. Everything written here is a verbatim slice of real data.
"""

from __future__ import annotations

import csv

from .config import FIXTURES, REFERENCE_COURSES
from .fetch import HISTORY_TERMS, WADE_DIR, catalog_path
from .textio import open_mixed

REF = set(REFERENCE_COURSES)


def slice_csv(src, dest, key_fn) -> int:  # type: ignore[no-untyped-def]
    dest.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open_mixed(src) as fh, open(dest, "w", newline="", encoding="utf-8") as out:
        r = csv.DictReader(fh)
        w = csv.DictWriter(out, fieldnames=r.fieldnames or [])
        w.writeheader()
        for row in r:
            if key_fn(row):
                w.writerow(row)
                n += 1
    return n


def main() -> None:
    for term in HISTORY_TERMS:
        n = slice_csv(catalog_path(term), FIXTURES / "course-catalog" / f"{term}.csv",
                      lambda r: (r["Subject"], r["Number"]) in REF)
        print(term, n)
    n = slice_csv(WADE_DIR / "gpa/uiuc-gpa-dataset.csv", FIXTURES / "gpa" / "uiuc-gpa-dataset.csv",
                  lambda r: (r["Subject"], r["Number"]) in REF)
    print("gpa", n)
    n = slice_csv(WADE_DIR / "geneds/gened-courses.csv", FIXTURES / "gpa" / "gened-courses.csv",
                  lambda r: tuple(r["Course"].split(" ", 1)) in REF or r["Course"].startswith("RHET"))
    print("geneds", n)


if __name__ == "__main__":
    main()
