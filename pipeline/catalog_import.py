"""Import every undergraduate program's degree requirements from the Academic Catalog into data/degrees/<id>.yaml.

    python -m pipeline.catalog_import            # fetch (cached in data/raw/catalog, 1 request/s) and write the files
    python -m pipeline.catalog_import --offline  # re-parse the cached pages only

The catalog lays requirements out as course-list tables. This reads only what the tables state outright: course lists
("all of these"), "or" alternatives, "&" pairs taken together, "Select N of the following" and "N hours from". A block
the catalog writes in prose (technical electives, concentrations, free electives) becomes a `manual` group that shows
the catalog's own words and a checkbox, never a guessed rule. Each file says it was generated and when; files without
`generated:` (hand-checked, like finance-data-science.yaml) are never overwritten. Schema: docs/DEGREE-DATA.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import yaml
from lxml import html as lhtml

from .config import RAW, USER_AGENT
from .degrees import DEGREES_DIR, DegreeError, validate

CATALOG = "https://catalog.illinois.edu"
INDEX = f"{CATALOG}/undergraduate/"
CACHE = RAW / "catalog"
COLLEGES = {
    "aces": "College of Agricultural, Consumer and Environmental Sciences",
    "ahs": "College of Applied Health Sciences",
    "bus": "Gies College of Business",
    "education": "College of Education",
    "engineering": "The Grainger College of Engineering",
    "faa": "College of Fine and Applied Arts",
    "ischool": "School of Information Sciences",
    "las": "College of Liberal Arts and Sciences",
    "media": "College of Media",
    "socw": "School of Social Work",
}
GENED_SOURCE = "https://catalog.illinois.edu/general-information/degree-general-education-requirements/"
GENED_RULES_SOURCE = "https://gened.illinois.edu/requirements/"
CS_QUOTE = ("These courses may fulfill other curricular requirements, but no single course can fulfill multiple "
            "Cultural Studies categories.")
PROGRAM_GENED_QUOTE = "Some Gen Ed requirements may be met by courses required and/or electives in the program."
COMP1 = ["RHET 105", "RHET 101 + RHET 102", "CMN 111 + CMN 112", "ESL 115", "ESL 111 + ESL 112"]
CODE_RE = re.compile(r"\b([A-Z]{2,5})\s+(\d{3})\b")
NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
SELECT_N = re.compile(r"^(?:select|choose|take|complete)\s+(?:a minimum of\s+|at least\s+)?(\d+|" + "|".join(NUMBERS)
                      + r")\s+(?:\(\d+\)\s+)?(?:courses?\s+|of\s+)?(?:from|of)?\s*(?:the\s+)?(?:following|list below|"
                      r"courses below|below)\b", re.I)
SELECT_HOURS = re.compile(r"^(?:select|choose|take|complete)\s+(?:a minimum of\s+|at least\s+)?(\d+)\s+(?:credit\s+)?"
                          r"hours?\s+(?:of|from)\b", re.I)


def norm(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())


def program_links(index_html: str | bytes) -> list[str]:
    """Program pages listed on the undergraduate index (no 'undeclared' or individual-plan pages)."""
    text = index_html.decode("utf-8", "replace") if isinstance(index_html, bytes) else index_html
    links = sorted(set(re.findall(r'href="(/undergraduate/[a-z0-9-]+/[a-z0-9-]+/)"', text)))
    return [f"{CATALOG}{u}" for u in links if not re.search(r"undeclared|individual-plans", u)]


def program_id(url: str) -> str:
    """'.../las/english-balas/' -> 'english-balas'; a concentration '.../english-balas/english-teaching/' ->
    'english-balas-english-teaching'."""
    parts = url.rstrip("/").split("/undergraduate/", 1)[-1].split("/")
    return "-".join(parts[1:])


def concentration_links(page: str | bytes, url: str) -> list[str]:
    """Concentration pages one level under a program page (programs whose requirements live there)."""
    text = page.decode("utf-8", "replace") if isinstance(page, bytes) else page
    base = url.split(CATALOG, 1)[-1]
    return [f"{CATALOG}{u}" for u in sorted(set(re.findall(rf'href="({re.escape(base)}[a-z0-9-]+/)"', text)))]


def fetch_all(urls: list[str], delay: float = 1.0, offline: bool = False, client: Any = None) -> dict[str, bytes]:
    """Each page once, cached on disk; at most one request per `delay` seconds."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out: dict[str, bytes] = {}
    http = client or (None if offline else httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30,
                                                        follow_redirects=True))
    try:
        for u in urls:
            path = CACHE / f"{program_id(u) if u != INDEX else '_index'}.html"
            if path.exists():
                out[u] = path.read_bytes()
                continue
            if http is None:
                continue
            r = http.get(u)
            if r.status_code == 200:
                path.write_bytes(r.content)
                out[u] = r.content
            else:
                print(f"warn: {u}: HTTP {r.status_code}", file=sys.stderr)
            time.sleep(delay)
    finally:
        if http is not None and client is None:
            http.close()
    return out


def _rows(table: Any) -> list[dict]:
    """Row kinds: code (a course or an "A & B" pair), or (an alternative to the row above), comment, area, sum."""
    out = []
    for tr in table.iter("tr"):
        cls = tr.get("class") or ""
        if "hidden" in cls or "noscript" in cls:
            continue
        hours_td = tr.xpath("./td[contains(@class,'hourscol')]")
        hours = norm(hours_td[0].text_content()) if hours_td else ""
        code_td = tr.xpath("./td[contains(@class,'codecol')]")
        comment = tr.xpath(".//span[contains(@class,'courselistcomment')]")
        text = norm(comment[0].text_content()) if comment else norm(tr.text_content())
        if code_td:
            codes = [norm(a.text_content()) for a in code_td[0].xpath(".//a[contains(@class,'code')]")]
            codes = [c for c in codes if CODE_RE.fullmatch(c)]
            if not codes:
                codes = [f"{m[0]} {m[1]}" for m in CODE_RE.findall(norm(code_td[0].text_content()))]
            if codes:
                out.append({"kind": "or" if "orclass" in cls else "code", "codes": codes, "hours": hours})
                continue
        if "listsum" in cls or re.match(r"^(minimum\s+)?total hours", text, re.I):
            out.append({"kind": "sum", "text": text, "hours": hours})
        elif "areaheader" in cls:
            out.append({"kind": "area", "text": text, "hours": hours})
        elif text:
            out.append({"kind": "comment", "text": text, "hours": hours})
    return out


def _hours(text: str) -> int | None:
    m = re.fullmatch(r"(\d+)", text.strip())
    return int(m.group(1)) if m else None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40].strip("-") or "requirement"


def gened_groups(rows: list[dict], has_program_quote: bool) -> list[dict]:
    """The campus gen-ed table every program page carries, row by row (names and hours as the page gives them)."""
    groups: list[dict] = []
    for r in rows:
        if r["kind"] != "comment":
            continue
        t = r["text"]
        low = t.lower()
        hours = None
        m = re.search(r"\((\d+)\s+hours?\)", t)
        if m:
            hours = int(m.group(1))
        elif _hours(r["hours"]):
            hours = _hours(r["hours"])
        base = {"section": "General Education", "kind": "gened"}
        if low.startswith("fulfilled by") and groups:
            groups[-1].setdefault("notes", []).append(t)
        elif low.startswith("composition i"):
            groups.append({"id": "comp1", "name": "Composition I", **base, "rule": "n_of", "n": 1, "courses": COMP1,
                           "source": GENED_SOURCE})
        elif low.startswith("advanced composition"):
            groups.append({"id": "acp", "name": "Advanced Composition", **base, "rule": "hours", "hours": hours or 3,
                           "from": ["gened:ACP"]})
        elif low.startswith("humanities"):
            groups.append({"id": "hum", "name": t, **base, "rule": "hours", "hours": hours or 6,
                           "from": ["gened:HP", "gened:LA"]})
        elif low.startswith("natural sciences"):
            groups.append({"id": "nat", "name": t, **base, "rule": "hours", "hours": hours or 6,
                           "from": ["gened:LS", "gened:PS"]})
        elif low.startswith("social"):
            groups.append({"id": "sbs", "name": t, **base, "rule": "hours", "hours": hours or 6,
                           "from": ["gened:SS", "gened:BSC"]})
        elif "non-western" in low:
            groups.append({"id": "cs-nw", "name": t, **base, "rule": "n_of", "n": 1, "from": ["gened:NW"],
                           "exclusive": "cultural-studies"})
        elif re.search(r"u\.?s\.? minorit", low):
            groups.append({"id": "cs-us", "name": t, **base, "rule": "n_of", "n": 1, "from": ["gened:US"],
                           "exclusive": "cultural-studies"})
        elif "western/comparative" in low:
            groups.append({"id": "cs-wcc", "name": t, **base, "rule": "n_of", "n": 1, "from": ["gened:WCC"],
                           "exclusive": "cultural-studies"})
        elif low.startswith("quantitative reasoning"):
            g = {"id": "qr", "name": t, **base, "rule": "n_of", "n": 2, "from": ["gened:QR1", "gened:QR2"]}
            if "at least one" in low:
                g["min_from"] = {"gened:QR1": 1}
            groups.append(g)
        elif low.startswith("language"):
            groups.append({"id": "language", "name": "Language other than English", **base, "rule": "manual",
                           "notes": [t], "source": GENED_SOURCE})
        else:
            groups.append({"id": f"gened-{len(groups) + 1}", "name": t[:80], **base, "rule": "manual", "notes": [t]})
    return groups


LISTISH = re.compile(r"(list|lists|elective|electives|focus|option|options|select|choose|area|areas)", re.I)


def program_groups(rows: list[dict], section: str, start_index: int) -> list[dict]:
    """One course-list table (not the gen-ed one) -> groups. Comment rows split the table into segments: courses before
    any comment are required ("all"); "Select N of the following" / "N hours from" segments become n_of / hours; any
    other comment is prose the schema can't express, so that segment (and any list after prose in the same table, like
    CS focus areas under "at least three... from a single focus area") becomes `manual`, listing its courses."""
    groups: list[dict] = []
    name = section
    prose: list[str] = []  # the latest prose rule in this table; it governs the lists that follow it
    seg: dict | None = None

    def new(lead: list[str] | None = None, listish: bool = False, hours: int | None = None) -> dict:
        return {"name": name, "lead": list(lead or []), "items": [], "listish": listish, "hours": hours, "join": False}

    def flush() -> None:
        nonlocal seg
        if seg is None or (not seg["items"] and not seg["lead"]):
            seg = None
            return
        items, lead = seg["items"], seg["lead"]
        listed = [i[0] if len(i) == 1 else i for i in items]
        g: dict[str, Any] = {"name": seg["name"] or section or "Requirement", "section": section or seg["name"]}
        n = SELECT_N.match(lead[0]) if len(lead) == 1 else None
        h = SELECT_HOURS.match(lead[0]) if len(lead) == 1 else None
        if items and not lead and not prose and not seg["listish"] and not LISTISH.search(seg["name"] or ""):
            g.update(rule="all", courses=listed)
        elif items and n and (int(n.group(1)) if n.group(1).isdigit() else NUMBERS[n.group(1).lower()]) <= len(items):
            k = n.group(1)
            g.update(rule="n_of", n=int(k) if k.isdigit() else NUMBERS[k.lower()], courses=listed, notes=lead)
        elif items and h:
            g.update(rule="hours", hours=int(h.group(1)), courses=listed, notes=lead)
        else:
            fallback = f"The catalog lists these courses under {g['name']}; see the catalog page for the rule."
            notes = lead or prose[-2:] or [fallback]
            g.update(rule="manual", notes=notes, **({"courses": listed} if listed else {}))
            prose.extend(lead)
        if seg["hours"] is not None and g["rule"] != "hours":
            g.setdefault("notes", []).insert(0, f"Catalog total: {seg['hours']} hours.")
        groups.append(g)
        seg = None

    for r in rows:
        if r["kind"] == "sum":
            flush()
            name, prose = section, []
        elif r["kind"] == "area":
            flush()
            t = r["text"]
            if len(t) > 70 or t.endswith("."):  # a rule written into a header row
                seg = new(lead=[t])
            else:
                name = t.rstrip(":").strip()
                seg = new(listish=t.endswith(":"), hours=_hours(r["hours"]))
        elif r["kind"] in ("code", "or"):
            if seg is None:
                seg = new()
            sq = " + ".join(r["codes"])
            if (r["kind"] == "or" or seg["join"]) and seg["items"]:
                seg["items"][-1].append(sq)
            else:
                seg["items"].append([sq])
            seg["join"] = False
        elif r["text"].strip().upper() == "OR":
            if seg is not None:
                seg["join"] = True
        else:
            if seg is not None and seg["items"]:
                flush()
            if seg is None:
                seg = new()
            seg["lead"].append(r["text"])
    flush()
    for i, g in enumerate(groups):
        g["id"] = f"{_slug(g['name'])}-{start_index + i}"
    return groups


def parse_program(page: str | bytes, url: str, read_on: str) -> dict:
    """One catalog program page -> a degree document (validated by pipeline.degrees.validate)."""
    doc = lhtml.fromstring(page)
    title = norm(doc.findtext(".//title") or "")
    h1 = [norm(h.text_content()) for h in doc.xpath("//h1")]
    program = h1[-1] if h1 else title.split("|")[0].strip()
    year = re.search(r"(\d{4}-\d{4}) Course Catalog", title)
    c = doc.get_element_by_id("degreerequirementstextcontainer")
    text = norm(c.text_content())
    total = re.search(r"Minimum hours required for graduation:\s*(\d+)", text)
    notes = []
    if total:
        notes.append(f"Minimum hours required for graduation: {total.group(1)} hours.")
    upper = re.search(r"(Minimum of 40 hours of upper-division coursework[^.]*\.)", text)
    if upper:
        notes.append(upper.group(1))
    has_quote = PROGRAM_GENED_QUOTE in text
    groups: list[dict] = []
    section = ""
    for el in c.iter("h2", "h3", "h4", "p", "table"):
        if el.tag == "table" and "sc_courselist" in (el.get("class") or ""):
            rows = _rows(el)
            first = next((r for r in rows if r["kind"] != "sum"), None)
            if first and first.get("text", "").lower().startswith("composition i"):
                groups.extend(gened_groups(rows, has_quote))
            else:
                groups.extend(program_groups(rows, section, len(groups) + 1))
        elif el.tag != "table" and not el.xpath("ancestor::table"):
            t = norm(el.text_content())
            heading_like = 0 < len(t) <= 80 and not t.endswith(".")
            if el.tag != "p" or (heading_like and not t.lower().startswith(("for the degree", "minimum", "follows"))):
                section = t
    rules: list[dict[str, Any]] = [
        {"allow": False, "within": "cultural-studies", "quote": CS_QUOTE, "source": GENED_RULES_SOURCE},
        {"allow": True, "between": ["cultural-studies", "gened"],
         "quote": "These courses may fulfill other curricular requirements", "source": GENED_RULES_SOURCE}]
    if has_quote:
        rules.append({"allow": True, "between": ["program", "gened"], "quote": PROGRAM_GENED_QUOTE, "source": url})
    if not any(g.get("exclusive") for g in groups):
        rules = [r for r in rules
                 if r.get("within") != "cultural-studies" and "cultural-studies" not in list(r.get("between") or [])]
    seg = url.split("/undergraduate/", 1)[-1].split("/")[0]
    college = COLLEGES.get(seg, seg.upper())
    seen: dict[str, int] = {}
    for g in groups:  # a page with several gen-ed or concentration tables can repeat an id
        seen[g["id"]] = seen.get(g["id"], 0) + 1
        if seen[g["id"]] > 1:
            g["id"] = f"{g['id']}-{seen[g['id']]}"
    return {
        "id": program_id(url), "program": program, "college": college,
        "catalog_year": year.group(1) if year else "", "source": url, "read_on": read_on, "generated": read_on,
        **({"total_hours": int(total.group(1))} if total else {}), "notes": notes, "double_counting": rules,
        "groups": groups,
    }


def write(doc: dict, directory: Path = DEGREES_DIR) -> bool:
    """Write a generated file; never overwrite a hand-checked one (no `generated:` key). Returns True if written."""
    path = directory / f"{doc['id']}.yaml"
    if path.exists() and "generated:" not in path.read_text(encoding="utf-8"):
        return False
    header = (f"# {doc['program']} ({doc['college']}), {doc['catalog_year']} Academic Catalog.\n"
              f"# Generated from {doc['source']} on {doc['generated']} by pipeline/catalog_import.py: course lists,\n"
              "# alternatives and 'Select N' rules are read from the catalog's tables; prose rules are 'manual'\n"
              "# groups with the catalog's own words. Edit by hand and delete the `generated:` line to keep your\n"
              "# changes.\n")
    path.write_text(header + yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline", action="store_true", help="only re-parse pages already in data/raw/catalog")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    args = ap.parse_args(argv)
    today = dt.date.today().isoformat()
    index = fetch_all([INDEX], args.delay, args.offline).get(INDEX)
    if not index:
        print("could not read the catalog index", file=sys.stderr)
        return 1
    urls = program_links(index)
    pages = fetch_all(urls, args.delay, args.offline)
    # Programs whose requirements are on concentration pages (English, Political Science...): import those instead.
    for u in list(urls):
        if u in pages and b"degreerequirementstextcontainer" not in pages[u]:
            subs = concentration_links(pages[u], u)
            urls.remove(u)
            urls.extend(subs)
            pages.update(fetch_all(subs, args.delay, args.offline))
    hand = set()
    for f in DEGREES_DIR.glob("*.yaml"):
        text = f.read_text(encoding="utf-8")
        if "generated:" not in text:
            hand.add(str((yaml.safe_load(text) or {}).get("source", "")))
    written = kept = failed = 0
    rules: dict[str, int] = {}
    for u in urls:
        if u not in pages:
            continue
        try:
            doc = parse_program(pages[u], u, today)
            validate(yaml.safe_load(yaml.safe_dump(doc)), doc["id"])
        except (DegreeError, KeyError, ValueError) as e:
            failed += 1
            print(f"skip {program_id(u)}: {str(e)[:300]}", file=sys.stderr)
            continue
        if doc["source"] in hand:  # a hand-checked file already covers this program
            kept += 1
            continue
        for g in doc["groups"]:
            rules[g["rule"]] = rules.get(g["rule"], 0) + 1
        if write(doc):
            written += 1
        else:
            kept += 1
    print(f"{len(urls)} programs: {written} written, {kept} hand-checked kept, {failed} skipped; "
          f"groups by rule {rules}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
