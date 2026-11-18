"""AP and IB credit: validate data/ap-credit/*.yaml and data/ib-credit/*.yaml, export web/public/data/ap-credit.json
and ib-credit.json.

One file per entering year, copied by hand from CITL's tables (docs/AP-CREDIT.md). Schema problems stop the build;
credited course codes the loaded Course Explorer terms don't know are reported, not fatal, because older years
credit courses that were renumbered since (FR 103 became FR 203 for 2026-2027).

IB files have the same shape with two differences (issue #25): scores run 1 to 7, and every row names the exam's
level, HL (Higher Level) or SL (Standard Level), because the two levels give different credit. IB rows don't use AP's
subscore, college or other-exam conditions.

    python -m pipeline.ap_credit      # validate every file and list unknown codes (uses data/illini.db if built)
"""

from __future__ import annotations

import datetime as dt
import itertools
import json
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .config import DATA

AP_DIR = DATA / "ap-credit"
IB_DIR = DATA / "ib-credit"

COURSE_RE = re.compile(r"^[A-Z]{2,5} \d{3}$")
ELECTIVE_RE = re.compile(r"^[A-Z]{2,5} [1-4]--$")  # elective credit in a subject at a level: "MATH 1--"
EXAM_ID_RE = re.compile(r"^[A-Z][A-Z0-9]{1,9}$")
YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
TOP_KEYS = {"year", "entering", "source", "read_on", "notes", "exams"}
EXAM_KEYS = {"id", "name", "sub", "notes", "rows"}
ROW_KEYS = {"scores", "sub", "college", "with", "credit", "message", "fix"}
COLLEGES = {"grainger", "other"}
LEVELS = ("HL", "SL")


@dataclass(frozen=True)
class Kind:
    """What sets AP and IB files apart."""

    name: str
    directory: Path
    out_file: str
    max_score: int
    exam_keys: frozenset[str]
    row_keys: frozenset[str]
    levels: tuple[str, ...] = ()  # every row names one of these; () = rows have no level


AP = Kind("AP", AP_DIR, "ap-credit.json", 5, frozenset(EXAM_KEYS), frozenset(ROW_KEYS))
IB = Kind("IB", IB_DIR, "ib-credit.json", 7, frozenset(EXAM_KEYS - {"sub"}),
          frozenset({"level", "scores", "credit", "message", "fix"}), LEVELS)


class ApCreditError(ValueError):
    """An AP credit file doesn't match the schema. The message lists every problem found."""


def _int_list(v: Any, lo: int, hi: int) -> bool:
    return isinstance(v, list) and bool(v) and all(isinstance(x, int) and lo <= x <= hi for x in v) \
        and len(set(v)) == len(v)


def _str_list(v: Any) -> bool:
    return isinstance(v, list) and all(isinstance(x, str) and x.strip() for x in v)


def validate(doc: Any, name: str, kind: Kind = AP) -> dict:
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
            if k not in kind.exam_keys:
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
                if k not in kind.row_keys:
                    errs.append(f"{rw}: unknown key '{k}'")
            if not _int_list(r.get("scores"), 1, kind.max_score):
                errs.append(f"{rw}: 'scores' must list {kind.name} scores 1 to {kind.max_score}")
            if kind.levels and r.get("level") not in kind.levels:
                errs.append(f"{rw}: 'level' must be one of {list(kind.levels)}")
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
            row = {"scores": r.get("scores"), "sub": r.get("sub"), "college": r.get("college"), "with": w,
                   "credit": [[str(c), h] for c, h in credit.items()],
                   "message": r.get("message"), "fix": r.get("fix")}
            if kind.levels:
                row = {"level": r.get("level"), **row}
            out_rows.append(row)
        errs += [f"{where}: {p}" for p in overlaps(out_rows, kind)]
        exam = {"id": e.get("id"), "name": e.get("name"), "sub": e.get("sub"),
                "notes": list(e.get("notes") or []), "rows": out_rows}
        if kind.levels:  # the levels this exam has rows for, in LEVELS order
            exam["levels"] = [lv for lv in kind.levels if any(x.get("level") == lv for x in out_rows)]
        out_exams.append(exam)

    if errs:
        raise ApCreditError(f"{name}:\n  - " + "\n  - ".join(errs))
    start = str(doc["year"])[:4]
    return {"id": start, "label": str(doc["year"]), "entering": doc["entering"], "source": doc["source"],
            "read_on": str(read_on), "notes": list(doc.get("notes") or []),
            "exams": sorted(out_exams, key=lambda x: str(x["name"]))}


def overlaps(rows: list[dict], kind: Kind = AP) -> list[str]:
    """Every combination of level, score, subscore, college and other exams' scores must match at most one row."""
    probs: list[str] = []
    others = sorted({x for r in rows if isinstance(r.get("with"), dict) for x in r["with"]})
    levels: tuple[str | None, ...] = kind.levels or (None,)
    for level, score, sub, college in itertools.product(levels, range(1, kind.max_score + 1), range(0, 6),
                                                        sorted(COLLEGES)):
        for other in itertools.product(range(0, 6), repeat=len(others)):
            given = dict(zip(others, other, strict=True))
            hits = [i for i, r in enumerate(rows) if row_matches(r, score, sub, college, given, level)]
            msg = f"rows {', '.join(str(i + 1) for i in hits)} both apply to a score of {score}"
            if len(hits) > 1 and msg not in probs:
                probs.append(msg)
    return probs


def row_matches(r: dict, score: int, sub: int, college: str, other: dict[str, int], level: str | None = None) -> bool:
    if not isinstance(r.get("scores"), list) or score not in r["scores"]:
        return False
    if r.get("level") and r["level"] != level:
        return False
    if isinstance(r.get("sub"), list) and sub not in r["sub"]:
        return False
    if r.get("college") and r["college"] != college:
        return False
    w = r.get("with")
    return not isinstance(w, dict) or all(other.get(x, 0) in (v or []) for x, v in w.items())


def load_all(directory: Path | None = None, kind: Kind = AP) -> list[dict]:
    """Every year's table, newest first."""
    paths = sorted((directory or kind.directory).glob("*.yaml"))
    years = [validate(yaml.safe_load(p.read_text(encoding="utf-8")), p.name, kind) for p in paths]
    return sorted(years, key=lambda y: y["id"], reverse=True)


def credited_codes(year: dict) -> set[str]:
    return {c for e in year["exams"] for r in e["rows"] for c, _ in r["credit"] if COURSE_RE.match(c)}


def export(conn: sqlite3.Connection, out_dir: Path, directory: Path | None = None, kind: Kind = AP) -> str:
    """Write ap-credit.json (ib-credit.json for IB): {"years": [...]}, newest first, each with the credited codes this
    build doesn't know."""
    from .degrees import catalog_from_db

    years = load_all(directory, kind)
    known = set(catalog_from_db(conn))
    for y in years:
        y["unknown"] = sorted(credited_codes(y) - known)
    (out_dir / kind.out_file).write_text(json.dumps({"years": years}, separators=(",", ":")), encoding="utf-8")
    return f"{len(years)} {kind.name} credit table(s)"


def main() -> int:
    from .config import DB_PATH

    try:
        tables = [(kind, load_all(kind=kind)) for kind in (AP, IB)]
    except ApCreditError as e:
        print(e, file=sys.stderr)
        return 1
    known: set[str] | None = None
    if DB_PATH.exists():
        from .degrees import catalog_from_db

        conn = sqlite3.connect(DB_PATH)
        known = set(catalog_from_db(conn))
        conn.close()
    for kind, years in tables:
        if known is None:
            print(f"{kind.name}: {len(years)} file(s) valid (run `make data` first to check course codes)")
            continue
        for y in years:
            unknown = sorted(credited_codes(y) - known)
            print(f"{kind.name} {y['label']}: {len(y['exams'])} exams, credited codes not in the loaded terms: "
                  f"{', '.join(unknown) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
