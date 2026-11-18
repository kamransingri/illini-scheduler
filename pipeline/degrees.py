"""Degree requirements: validate data/degrees/*.yaml and export web/public/data/degrees/*.json.

The schema is documented in docs/DEGREE-DATA.md. Schema problems stop the build (a wrong checklist is worse than
none); course codes the loaded Course Explorer data doesn't know are logged and exported as `unknown`, not fatal,
because a catalog can list a course before or after the terms this build loads.

    python -m pipeline.degrees      # validate every file and list unknown codes (uses data/illini.db if built)
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .config import DATA

DEGREES_DIR = DATA / "degrees"

CODE_RE = re.compile(r"^([A-Z]{2,5}) (\d{3})$")
RANGE_RE = re.compile(r"^([A-Z]{2,5}) (\d{3})-(\d{3})$")
GENED_RE = re.compile(r"^gened:([A-Z0-9]+)$")
GENED_CODES = {"ACP", "COMP1", "HP", "LA", "LS", "PS", "QR1", "QR2", "SS", "BSC", "NW", "US", "WCC"}
RULES = {"all", "n_of", "hours", "manual"}
KINDS = {"program", "gened"}
TYPES = {"major", "minor"}
TOP_KEYS = {"id", "type", "program", "college", "catalog_year", "source", "read_on", "total_hours", "notes",
            "double_counting", "groups", "generated"}
GROUP_KEYS = {"id", "name", "section", "kind", "rule", "n", "hours", "courses", "from", "exclude", "max_hours",
              "min_from", "not_with", "exclusive", "source", "notes"}


class DegreeError(ValueError):
    """A degree file doesn't match the schema. The message lists every problem found."""


@dataclass
class Group:
    id: str
    name: str
    section: str
    kind: str
    rule: str
    n: int | None
    hours: float | None
    items: list[list[list[str]]]  # item -> alternatives -> a sequence of codes taken together
    selectors: list[str]
    exclude: list[str]
    max_hours: dict[str, float]
    min_from: dict[str, int]
    not_with: list[str]
    exclusive: str | None
    source: str | None
    notes: list[str]


@dataclass
class Degree:
    id: str
    program: str
    college: str
    catalog_year: str
    source: str
    read_on: str
    total_hours: int | None
    notes: list[str]
    double_counting: list[dict[str, Any]]
    groups: list[Group]
    unknown: list[str] = field(default_factory=list)
    generated: str = ""  # date, for files written by pipeline/catalog_import.py
    type: str = "major"  # or "minor"

    def codes(self) -> set[str]:
        """Every course code named in a list, an exclusion or a cap."""
        out: set[str] = set()
        for g in self.groups:
            for item in g.items:
                for alt in item:
                    out.update(alt)
            out.update(g.exclude)
            out.update(g.max_hours)
            out.update(k for k in g.min_from if CODE_RE.match(k))
        return out


def parse_seq(text: str) -> list[str]:
    """'RHET 101 + RHET 102' -> ['RHET 101', 'RHET 102'] (a sequence that counts as one item)."""
    return [p.strip() for p in text.split("+")]


def parse_item(x: Any) -> list[list[str]]:
    """A course list item -> its alternatives, each a sequence of codes."""
    if isinstance(x, str):
        return [parse_seq(x)]
    if isinstance(x, list) and x and all(isinstance(a, str) for a in x):
        return [parse_seq(a) for a in x]
    raise TypeError(f"{x!r} is not a course code, a 'A + B' sequence or a list of alternatives")


def _str_list(v: Any) -> bool:
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


def validate(doc: Any, name: str = "?") -> Degree:
    """Check one parsed YAML document against the schema and return it as a Degree."""
    errs: list[str] = []
    if not isinstance(doc, dict):
        raise DegreeError(f"{name}: the file must be a mapping of keys")
    for k in sorted(set(doc) - TOP_KEYS):
        errs.append(f"unknown key '{k}'")
    for k in ("id", "program", "college", "catalog_year", "source", "read_on", "groups"):
        if k not in doc:
            errs.append(f"missing '{k}'")
    if "id" in doc and (not isinstance(doc["id"], str) or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", doc["id"])):
        errs.append("'id' must be a lower-case slug like finance-data-science")
    if "type" in doc and doc["type"] not in TYPES:
        errs.append("'type' must be major or minor (leave it out for a major)")
    if "catalog_year" in doc and not re.fullmatch(r"\d{4}-\d{4}", str(doc["catalog_year"])):
        errs.append("'catalog_year' must look like 2026-2027")
    if "source" in doc and not str(doc["source"]).startswith("https://catalog.illinois.edu/"):
        errs.append("'source' must be an Academic Catalog URL (https://catalog.illinois.edu/...)")
    read_on = doc.get("read_on")
    if isinstance(read_on, dt.date):
        read_on = read_on.isoformat()
    if "read_on" in doc and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(read_on)):
        errs.append("'read_on' must be a date, YYYY-MM-DD")
    if "total_hours" in doc and not isinstance(doc["total_hours"], int):
        errs.append("'total_hours' must be a whole number")
    if "notes" in doc and not _str_list(doc["notes"]):
        errs.append("'notes' must be a list of strings")

    groups: list[Group] = []
    raw_groups = doc.get("groups") or []
    if not isinstance(raw_groups, list):
        errs.append("'groups' must be a list")
        raw_groups = []
    ids = [g.get("id") for g in raw_groups if isinstance(g, dict)]
    for i, g in enumerate(raw_groups):
        where = f"group {g.get('id', i) if isinstance(g, dict) else i}"
        if not isinstance(g, dict):
            errs.append(f"{where}: must be a mapping")
            continue
        for k in sorted(set(g) - GROUP_KEYS):
            errs.append(f"{where}: unknown key '{k}'")
        for k in ("id", "name", "rule"):
            if k not in g:
                errs.append(f"{where}: missing '{k}'")
        if ids.count(g.get("id")) > 1:
            errs.append(f"{where}: duplicate id")
        rule, kind = g.get("rule"), g.get("kind", "program")
        if rule not in RULES:
            errs.append(f"{where}: 'rule' must be one of {sorted(RULES)}")
        if kind not in KINDS:
            errs.append(f"{where}: 'kind' must be one of {sorted(KINDS)}")
        items: list[list[list[str]]] = []
        for x in g.get("courses") or []:
            try:
                items.append(parse_item(x))
            except TypeError as e:
                errs.append(f"{where}: {e}")
        for alt in (a for item in items for a in item):
            for code in alt:
                if not CODE_RE.match(code):
                    errs.append(f"{where}: '{code}' is not a course code like 'MATH 221'")
        selectors = g.get("from") or []
        if not _str_list(selectors):
            errs.append(f"{where}: 'from' must be a list of selectors")
            selectors = []
        for s in selectors:
            m_range, m_gened = RANGE_RE.match(s), GENED_RE.match(s)
            if m_range and int(m_range.group(2)) > int(m_range.group(3)):
                errs.append(f"{where}: range '{s}' runs backwards")
            elif m_gened and m_gened.group(1) not in GENED_CODES:
                errs.append(f"{where}: unknown gen-ed code in '{s}'")
            elif not m_range and not m_gened:
                errs.append(f"{where}: '{s}' is not a selector like 'FIN 400-499' or 'gened:HP'")
        n, hours = g.get("n"), g.get("hours")
        if rule == "all" and (not items or selectors):
            errs.append(f"{where}: rule 'all' needs 'courses' and no 'from'")
        if rule in ("n_of", "hours") and not (items or selectors):
            errs.append(f"{where}: rule '{rule}' needs 'courses' or 'from'")
        if rule == "n_of" and not (isinstance(n, int) and n >= 1):
            errs.append(f"{where}: rule 'n_of' needs a whole number 'n' of at least 1")
        if rule == "n_of" and items and isinstance(n, int) and n > len(items):
            errs.append(f"{where}: 'n' is {n} but only {len(items)} items are listed")
        if rule == "hours" and not (isinstance(hours, (int, float)) and hours > 0):
            errs.append(f"{where}: rule 'hours' needs a positive 'hours'")
        if rule == "manual" and not g.get("notes"):
            errs.append(f"{where}: rule 'manual' needs 'notes' saying what satisfies it")
        exclude = g.get("exclude") or []
        max_hours = g.get("max_hours") or {}
        min_from = g.get("min_from") or {}
        not_with = g.get("not_with") or []
        if not _str_list(exclude) or any(not CODE_RE.match(c) for c in exclude):
            errs.append(f"{where}: 'exclude' must be a list of course codes")
        if not isinstance(max_hours, dict) or any(not CODE_RE.match(str(c)) or not isinstance(v, (int, float))
                                                  for c, v in max_hours.items()):
            errs.append(f"{where}: 'max_hours' must map course codes to hours")
        if not isinstance(min_from, dict) or any(not isinstance(v, int) or v < 1 for v in min_from.values()):
            errs.append(f"{where}: 'min_from' must map selectors to whole numbers")
        elif any(k not in selectors and not CODE_RE.match(str(k)) for k in min_from):
            errs.append(f"{where}: every 'min_from' key must be one of its 'from' selectors or a course code")
        if not _str_list(not_with) or any(x not in ids or x == g.get("id") for x in not_with):
            errs.append(f"{where}: 'not_with' must list other group ids")
        if "notes" in g and not _str_list(g["notes"]):
            errs.append(f"{where}: 'notes' must be a list of strings")
        groups.append(Group(
            id=str(g.get("id")), name=str(g.get("name")), section=str(g.get("section", "")), kind=str(kind),
            rule=str(rule), n=n if isinstance(n, int) else None,
            hours=float(hours) if isinstance(hours, (int, float)) else None, items=items, selectors=list(selectors),
            exclude=list(exclude) if _str_list(exclude) else [],
            max_hours={str(k): float(v) for k, v in max_hours.items()} if isinstance(max_hours, dict) else {},
            min_from={str(k): int(v) for k, v in min_from.items()} if isinstance(min_from, dict) else {},
            not_with=list(not_with) if _str_list(not_with) else [], exclusive=g.get("exclusive"),
            source=g.get("source"), notes=list(g.get("notes") or []),
        ))

    sets = {g.exclusive for g in groups if g.exclusive}
    dc = doc.get("double_counting") or []
    if not isinstance(dc, list):
        errs.append("'double_counting' must be a list of rules")
        dc = []
    for i, r in enumerate(dc):
        where = f"double_counting rule {i + 1}"
        if not isinstance(r, dict) or not isinstance(r.get("allow"), bool):
            errs.append(f"{where}: needs 'allow: true' or 'allow: false'")
            continue
        if ("within" in r) == ("between" in r):
            errs.append(f"{where}: needs exactly one of 'within' or 'between'")
        if "within" in r and r["within"] not in sets:
            errs.append(f"{where}: 'within' must name an exclusive set ({sorted(sets)})")
        if "between" in r and (not _str_list(r["between"]) or len(r["between"]) != 2
                               or any(x not in KINDS | sets for x in r["between"])):
            errs.append(f"{where}: 'between' must name two kinds or exclusive sets")
        if "approved_for" in r and ("between" not in r or not _str_list(r["approved_for"]) or not r["approved_for"]
                                    or any(x not in GENED_CODES for x in r["approved_for"])):
            errs.append(f"{where}: 'approved_for' goes with 'between' and lists gen-ed codes ({sorted(GENED_CODES)})")
        if not r.get("quote") or not str(r.get("source", "")).startswith("https://"):
            errs.append(f"{where}: needs the 'quote' it rests on and its 'source' URL")

    if errs:
        raise DegreeError(f"{name}:\n  - " + "\n  - ".join(errs))
    return Degree(
        id=doc["id"], program=doc["program"], college=doc["college"], catalog_year=str(doc["catalog_year"]),
        source=doc["source"], read_on=str(read_on), total_hours=doc.get("total_hours"),
        notes=list(doc.get("notes") or []),
        double_counting=[dict(r) for r in dc], groups=groups,
        generated=str(doc.get("generated") or ""), type=str(doc.get("type") or "major"),
    )


def load_all(directory: Path = DEGREES_DIR) -> list[Degree]:
    out = []
    for p in sorted(directory.glob("*.yaml")):
        d = validate(yaml.safe_load(p.read_text(encoding="utf-8")), p.name)
        if d.id != p.stem:
            raise DegreeError(f"{p.name}: 'id' is '{d.id}' but must match the file name")
        out.append(d)
    return out


@dataclass
class CatalogCourse:
    title: str
    credits: list[float]  # [min, max]
    geneds: list[str]


def catalog_from_db(conn: sqlite3.Connection) -> dict[str, CatalogCourse]:
    """Every course in the loaded Course Explorer terms, from its latest term: title, credits, gen-ed codes."""
    from .export import credit_range
    from .names import term_order

    rows: dict[str, tuple[int, CatalogCourse]] = {}
    for r in conn.execute("SELECT term, subject, number, title, credit_hours, gened_codes FROM courses"):
        code, order = f"{r[1]} {r[2]}", term_order(r[0])
        if code not in rows or order > rows[code][0]:
            rows[code] = (order, CatalogCourse(r[3] or code, credit_range(r[4] or ""), (r[5] or "").split()))
    gen = {}
    for r in conn.execute("SELECT subject, number, codes FROM geneds"):
        gen[f"{r[0]} {r[1]}"] = (r[2] or "").split()
    out = {code: c for code, (_, c) in rows.items()}
    for code, extra in gen.items():
        if code in out:
            out[code].geneds = sorted(set(out[code].geneds) | set(extra))
    return out


def matches(selector: str, code: str, course: CatalogCourse) -> bool:
    m = RANGE_RE.match(selector)
    if m:
        subj, num = code.split(" ")
        return subj == m.group(1) and int(m.group(2)) <= int(num) <= int(m.group(3))
    g = GENED_RE.match(selector)
    return bool(g) and g.group(1) in course.geneds  # type: ignore[union-attr]


def resolve(d: Degree, catalog: dict[str, CatalogCourse]) -> dict[str, list[str]]:
    """Codes each selector-based group can use (exclusions applied); also records unknown codes on the degree."""
    d.unknown = sorted(c for c in d.codes() if c not in catalog)
    eligible: dict[str, list[str]] = {}
    for g in d.groups:
        if not g.selectors:
            continue
        hits = {code for code, c in catalog.items() for s in g.selectors if matches(s, code, c)}
        eligible[g.id] = sorted(hits - set(g.exclude), key=lambda c: (c.split()[0], int(c.split()[1])))
    return eligible


def to_json(d: Degree, eligible: dict[str, list[str]], courses: dict[str, dict]) -> dict:
    """Gen-ed-only groups export no eligible list: the page fills it from the shared degrees/gened-courses.json."""
    return {
        "id": d.id, "type": d.type, "program": d.program, "college": d.college, "catalog_year": d.catalog_year,
        "source": d.source,
        "read_on": d.read_on, "generated": d.generated, "total_hours": d.total_hours, "notes": d.notes,
        "double_counting": d.double_counting,
        "groups": [{
            "id": g.id, "name": g.name, "section": g.section, "kind": g.kind, "rule": g.rule, "n": g.n,
            "hours": g.hours, "items": g.items, "from": g.selectors,
            "eligible": [] if g.selectors and all(GENED_RE.match(x) for x in g.selectors) else eligible.get(g.id, []),
            "exclude": g.exclude, "max_hours": g.max_hours, "min_from": g.min_from, "not_with": g.not_with,
            "exclusive": g.exclusive, "source": g.source, "notes": g.notes,
        } for g in d.groups],
        "courses": courses, "unknown": d.unknown,
    }


def export(conn: sqlite3.Connection, out_dir: Path, summaries: dict[str, dict], directory: Path = DEGREES_DIR) -> str:
    """Write degrees/index.json, degrees/gened-courses.json (every course with a gen-ed code, shared by all
    programs) and degrees/<id>.json (the program's groups and its own listed courses). `summaries` are the course
    facts the site already exports (GPA, next-term sections, professors), keyed by code, for courses with a page."""
    degrees = load_all(directory)
    catalog = catalog_from_db(conn)
    dest = out_dir / "degrees"
    dest.mkdir(parents=True, exist_ok=True)

    def info(code: str) -> dict:
        c = catalog[code]
        base = {"t": c.title, "cr": c.credits, "g": c.geneds, "page": code in summaries}
        return {**base, **summaries[code]} if code in summaries else base

    gened = {code: info(code) for code in sorted(catalog) if catalog[code].geneds}
    (dest / "gened-courses.json").write_text(json.dumps(gened, separators=(",", ":")))
    index, notes = [], []
    for d in degrees:
        eligible = resolve(d, catalog)
        if d.unknown:
            notes.append(f"{d.id}: {len(d.unknown)} unknown")
        listed = d.codes() | {c for g in d.groups if not all(GENED_RE.match(x) for x in g.selectors)
                              for c in eligible.get(g.id, [])}
        courses = {code: info(code) for code in sorted(listed) if code in catalog and code not in gened}
        (dest / f"{d.id}.json").write_text(json.dumps(to_json(d, eligible, courses), separators=(",", ":")))
        index.append({"id": d.id, "type": d.type, "program": d.program, "college": d.college,
                      "catalog_year": d.catalog_year,
                      "groups": len(d.groups), "generated": d.generated})
    (dest / "index.json").write_text(json.dumps(sorted(index, key=lambda x: (x["college"], x["program"])),
                                                separators=(",", ":")))
    if notes:
        print(f"warn: course codes not in the loaded Course Explorer terms in {len(notes)} programs "
              f"(python -m pipeline.degrees lists them)", file=sys.stderr)
    return f"{len(degrees)} degree file(s), {len(notes)} with unknown codes"


def main() -> int:
    from .config import DB_PATH

    try:
        degrees = load_all()
    except DegreeError as e:
        print(e, file=sys.stderr)
        return 1
    if DB_PATH.exists():
        conn = sqlite3.connect(DB_PATH)
        catalog = catalog_from_db(conn)
        conn.close()
        for d in degrees:
            resolve(d, catalog)
            print(f"{d.id}: {len(d.groups)} groups, unknown codes: {', '.join(d.unknown) or 'none'}")
    else:
        print(f"{len(degrees)} file(s) valid (run `make data` first to check course codes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
