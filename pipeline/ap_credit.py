"""AP credit: validate data/ap-credit/*.yaml and export web/public/data/ap-credit.json.

One file per entering year, copied by hand from CITL's tables (docs/AP-CREDIT.md). Schema problems stop the build;
credited course codes the loaded Course Explorer terms don't know are reported, not fatal, because older years
credit courses that were renumbered since (FR 103 became FR 203 for 2026-2027).

    python -m pipeline.ap_credit      # validate every file and list unknown codes (uses data/illini.db if built)
"""

from __future__ import annotations

import datetime as dt
import itertools
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

import yaml

from .config import DATA

AP_DIR = DATA / "ap-credit"

COURSE_RE = re.compile(r"^[A-Z]{2,5} \d{3}$")
ELECTIVE_RE = re.compile(r"^[A-Z]{2,5} [1-4]--$")  # elective credit in a subject at a level: "MATH 1--"
EXAM_ID_RE = re.compile(r"^[A-Z][A-Z0-9]{1,9}$")
YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
TOP_KEYS = {"year", "entering", "source", "read_on", "notes", "exams"}
EXAM_KEYS = {"id", "name", "sub", "notes", "rows"}
ROW_KEYS = {"scores", "sub", "college", "with", "credit", "message", "fix"}
COLLEGES = {"grainger", "other"}


class ApCreditError(ValueError):
    """An AP credit file doesn't match the schema. The message lists every problem found."""


def _int_list(v: Any, lo: int, hi: int) -> bool:
    return isinstance(v, list) and bool(v) and all(isinstance(x, int) and lo <= x <= hi for x in v) \
        and len(set(v)) == len(v)


def _str_list(v: Any) -> bool:
    return isinstance(v, list) and all(isinstance(x, str) and x.strip() for x in v)


def validate(doc: Any, name: str) -> dict:
    """Check one year's file and return it in the exported shape. Raises ApCreditError listing every problem."""
    errs: list[str] = []
    if not isinstance(doc, dict):
        raise ApCreditError(f"{name}: not a mapping")
    for k in doc:
        if k not in TOP_KEYS:
            errs.append(f"unknown key '{k}'")
    m = YEAR_RE.match(str(doc.get("year", "")))
    if not m or int(m.group(2)) != int(m.group(1)) + 1:
        errs.append("'year' must look like 2026-2027")
    elif name != f"{doc['year']}.yaml":
        errs.append(f"'year' is '{doc['year']}' but the file name must match it")
    if not str(doc.get("entering", "")).strip():
        errs.append("'entering' must say which terms the table covers")
    if not str(doc.get("source", "")).startswith("https://"):
        errs.append("'source' must be the https URL the table was copied from")
    read_on = doc.get("read_on")
    if not isinstance(read_on, dt.date):
        errs.append("'read_on' must be a date (YYYY-MM-DD)")
    if "notes" in doc and not _str_list(doc["notes"]):
        errs.append("'notes' must be a list of strings")
    exams = doc.get("exams")
    if not isinstance(exams, list) or not exams:
        errs.append("'exams' must be a non-empty list")
        exams = []

    ids = [e.get("id") for e in exams if isinstance(e, dict)]
    out_exams = []
    for i, e in enumerate(exams):
        if not isinstance(e, dict):
            errs.append(f"exams[{i}]: not a mapping")
            continue
        where = f"exam '{e.get('id', i)}'"
        for k in e:
            if k not in EXAM_KEYS:
                errs.append(f"{where}: unknown key '{k}'")
        if not EXAM_ID_RE.match(str(e.get("id", ""))):
            errs.append(f"{where}: 'id' must be 2-10 capital letters or digits, starting with a letter")
        elif ids.count(e["id"]) > 1:
            errs.append(f"{where}: duplicate id")
        if not str(e.get("name", "")).strip():
            errs.append(f"{where}: needs a 'name'")
        if "notes" in e and not _str_list(e["notes"]):
            errs.append(f"{where}: 'notes' must be a list of strings")
        rows = e.get("rows")
        if not isinstance(rows, list) or not rows:
            errs.append(f"{where}: 'rows' must be a non-empty list")
            rows = []
        out_rows = []
        for j, r in enumerate(rows):
            rw = f"{where} row {j + 1}"
            if not isinstance(r, dict):
                errs.append(f"{rw}: not a mapping")
                continue
            for k in r:
                if k not in ROW_KEYS:
                    errs.append(f"{rw}: unknown key '{k}'")
            if not _int_list(r.get("scores"), 1, 5):
                errs.append(f"{rw}: 'scores' must list AP scores 1 to 5")
            if "sub" in r:
                if not _int_list(r["sub"], 0, 5):
                    errs.append(f"{rw}: 'sub' must list subscores 0 (none) to 5")
                if not e.get("sub"):
                    errs.append(f"{rw}: uses 'sub' but the exam doesn't name its subscore ('sub: <label>')")
            if "college" in r and r["college"] not in COLLEGES:
                errs.append(f"{rw}: 'college' must be one of {sorted(COLLEGES)}")
            w = r.get("with")
            if w is not None and (not isinstance(w, dict) or not w
                                  or any(x not in ids or x == e.get("id") or not _int_list(v, 0, 5)
                                         for x, v in w.items())):
                errs.append(f"{rw}: 'with' must map other exam ids to their scores (0 = not taken)")
            credit = r.get("credit")
            if not isinstance(credit, dict):
                errs.append(f"{rw}: 'credit' must map course codes to hours ({{}} for none)")
                credit = {}
            for code, hours in credit.items():
                if not (COURSE_RE.match(str(code)) or ELECTIVE_RE.match(str(code))):
                    errs.append(f"{rw}: '{code}' is not a course code (MATH 220) or elective credit (MATH 1--)")
                if not isinstance(hours, int | float) or isinstance(hours, bool) or not 0 < hours <= 20:
                    errs.append(f"{rw}: hours for '{code}' must be a number above 0")
            if not credit and not r.get("message"):
                errs.append(f"{rw}: a row with no credit needs a 'message'")
            for k in ("message", "fix"):
                if k in r and not (isinstance(r[k], str) and r[k].strip()):
                    errs.append(f"{rw}: '{k}' must be text")
            out_rows.append({
                "scores": r.get("scores"), "sub": r.get("sub"), "college": r.get("college"), "with": w,
                "credit": [[str(c), h] for c, h in credit.items()],
                "message": r.get("message"), "fix": r.get("fix"),
            })
        errs += [f"{where}: {p}" for p in overlaps(out_rows)]
        out_exams.append({"id": e.get("id"), "name": e.get("name"), "sub": e.get("sub"),
                          "notes": list(e.get("notes") or []), "rows": out_rows})

    if errs:
        raise ApCreditError(f"{name}:\n  - " + "\n  - ".join(errs))
    start = str(doc["year"])[:4]
    return {"id": start, "label": str(doc["year"]), "entering": doc["entering"], "source": doc["source"],
            "read_on": str(read_on), "notes": list(doc.get("notes") or []),
            "exams": sorted(out_exams, key=lambda x: str(x["name"]))}


def overlaps(rows: list[dict]) -> list[str]:
    """Every combination of score, subscore, college and other exams' scores must match at most one row."""
    probs: list[str] = []
    others = sorted({x for r in rows if isinstance(r.get("with"), dict) for x in r["with"]})
    for score, sub, college in itertools.product(range(1, 6), range(0, 6), sorted(COLLEGES)):
        for other in itertools.product(range(0, 6), repeat=len(others)):
            given = dict(zip(others, other, strict=True))
            hits = [i for i, r in enumerate(rows) if row_matches(r, score, sub, college, given)]
            msg = f"rows {', '.join(str(i + 1) for i in hits)} both apply to a score of {score}"
            if len(hits) > 1 and msg not in probs:
                probs.append(msg)
    return probs


def row_matches(r: dict, score: int, sub: int, college: str, other: dict[str, int]) -> bool:
    if not isinstance(r.get("scores"), list) or score not in r["scores"]:
        return False
    if isinstance(r.get("sub"), list) and sub not in r["sub"]:
        return False
    if r.get("college") and r["college"] != college:
        return False
    w = r.get("with")
    return not isinstance(w, dict) or all(other.get(x, 0) in (v or []) for x, v in w.items())


def load_all(directory: Path = AP_DIR) -> list[dict]:
    """Every year's table, newest first."""
    years = [validate(yaml.safe_load(p.read_text(encoding="utf-8")), p.name) for p in sorted(directory.glob("*.yaml"))]
    return sorted(years, key=lambda y: y["id"], reverse=True)


def credited_codes(year: dict) -> set[str]:
    return {c for e in year["exams"] for r in e["rows"] for c, _ in r["credit"] if COURSE_RE.match(c)}


def export(conn: sqlite3.Connection, out_dir: Path, directory: Path = AP_DIR) -> str:
    """Write ap-credit.json: {"years": [...]}, newest first, each with the credited codes this build doesn't know."""
    from .degrees import catalog_from_db

    years = load_all(directory)
    known = set(catalog_from_db(conn))
    for y in years:
        y["unknown"] = sorted(credited_codes(y) - known)
    (out_dir / "ap-credit.json").write_text(json.dumps({"years": years}, separators=(",", ":")), encoding="utf-8")
    return f"{len(years)} AP credit table(s)"


def main() -> int:
    from .config import DB_PATH

    try:
        years = load_all()
    except ApCreditError as e:
        print(e, file=sys.stderr)
        return 1
    if DB_PATH.exists():
        from .degrees import catalog_from_db

        conn = sqlite3.connect(DB_PATH)
        known = set(catalog_from_db(conn))
        conn.close()
        for y in years:
            unknown = sorted(credited_codes(y) - known)
            print(f"{y['label']}: {len(y['exams'])} exams, credited codes not in the loaded terms: "
                  f"{', '.join(unknown) or 'none'}")
    else:
        print(f"{len(years)} file(s) valid (run `make data` first to check course codes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
