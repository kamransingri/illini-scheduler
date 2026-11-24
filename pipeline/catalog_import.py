"""Import every undergraduate major's and minor's requirements from the Academic Catalog into data/degrees/<id>.yaml.

    python -m pipeline.catalog_import            # fetch (cached in data/raw/catalog, 1 request/s) and write the files
    python -m pipeline.catalog_import --offline  # re-parse the cached pages only
    python -m pipeline.catalog_import --only minors   # just the minors (or --only majors, --only certificates)

The catalog lays requirements out as course-list tables. This reads only what the tables state outright: course lists
("all of these"), "or" alternatives, "&" pairs taken together, "Select N of the following" and "N hours from". A block
the catalog writes in prose (technical electives, concentrations, free electives) becomes a `manual` group that shows
the catalog's own words and a checkbox, never a guessed rule. Each file says it was generated and when; files without
`generated:` (hand-checked, like finance-data-science.yaml) are never overwritten. Schema: docs/DEGREE-DATA.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
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
MINORS_INDEX = f"{CATALOG}/undergraduate/minors/"
# Undergraduate certificates aren't in the Academic Catalog (its certificates are all graduate GCRTs): LAS lists its own
# with a link to each unit's page, which holds the requirements (DECISIONS D54.1)
LAS_CERTIFICATES = "https://las.illinois.edu/academics/programs/certificates"
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
    "informatics-programs": "Informatics Programs",
    "law": "College of Law",
    "ler": "School of Labor and Employment Relations",
    "provost": "Office of the Provost",
}
GENED_SOURCE = "https://catalog.illinois.edu/general-information/degree-general-education-requirements/"
GENED_RULES_SOURCE = "https://gened.illinois.edu/requirements/"
CS_QUOTE = ("These courses may fulfill other curricular requirements, but no single course can fulfill multiple "
            "Cultural Studies categories.")
GENED_POLICY_SOURCE = "https://gened.illinois.edu/faculty-staff/details-criteria/"
TWO_CATEGORIES_QUOTE = ("Individual courses will be approved to satisfy only one General Education requirement "
                        "except as follows. Exceptions are the Advanced Composition, Quantitative Reasoning II, and "
                        "the Cultural Studies requirements.")
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


def minor_links(index_html: str | bytes) -> list[str]:
    """Minor pages listed on the catalog's minors index ('/undergraduate/<college>/minors/<minor>/')."""
    text = index_html.decode("utf-8", "replace") if isinstance(index_html, bytes) else index_html
    links = sorted(set(re.findall(r'href="(/undergraduate/[a-z0-9-]+/minors/[a-z0-9-]+/)"', text)))
    return [f"{CATALOG}{u}" for u in links]


def certificate_links(page: str | bytes) -> list[tuple[str, str]]:
    """(name, unit page) for each certificate under the LAS page's "LAS undergraduate certificate programs" heading,
    stopping at the graduate ones."""
    text = page.decode("utf-8", "replace") if isinstance(page, bytes) else page
    start = text.find("LAS undergraduate certificate programs")
    end = text.find("LAS graduate certificate programs", start)
    if start < 0:
        return []
    out = []
    part = text[start:end if end > 0 else None]
    for href, body in re.findall(r'<a [^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>', part, re.S):
        name = norm(html.unescape(re.sub(r"<[^>]+>", " ", body)))
        if name:
            out.append((name, href.split("#")[0].replace("http://", "https://", 1)))
    return out


def certificate_doc(name: str, url: str, today: str) -> dict:
    """A certificate as a checklist with one hand-ticked group: its requirements are on the unit's page, not here."""
    words = re.sub(r"[^a-z0-9]+", " ", re.sub(r"\(.*?\)", "", name).lower()).split()  # "(TESL)" isn't in the id
    slug = "-".join(w for w in words if w not in ("of", "and", "the"))
    return {
        "id": f"{slug}-certificate", "type": "certificate", "program": f"{name} Certificate",
        "college": COLLEGES["las"], "catalog_year": "2026-2027", "source": url, "read_on": today, "generated": today,
        "notes": ["Undergraduate certificates aren't in the Academic Catalog. The unit's page has the requirements.",
                  "Certificate programs do not appear on the student's official transcript; only courses taken are "
                  "listed. "
                  f"({LAS_CERTIFICATES})"],
        "double_counting": [],
        "groups": [{"id": "requirements", "name": "Certificate requirements", "section": "Requirements",
                    "rule": "manual",
                    "notes": [f"Follow the requirements on the {name} page; tick this once you (or your advisor) "
                              "confirm they're done."]}],
    }


def is_minor(url: str) -> bool:
    return "/minors/" in url.split("/undergraduate/", 1)[-1]


def has_requirements(page: bytes, url: str) -> bool:
    """A requirements tab, or (some minors) course lists on the overview tab."""
    return b"degreerequirementstextcontainer" in page or (is_minor(url) and b"sc_courselist" in page)


def program_id(url: str) -> str:
    """'.../las/english-balas/' -> 'english-balas'; a concentration '.../english-balas/english-teaching/' ->
    'english-balas-english-teaching'; a minor '.../aces/minors/nutrition/' -> 'nutrition-minor'."""
    parts = url.rstrip("/").split("/undergraduate/", 1)[-1].split("/")
    if len(parts) >= 3 and parts[1] == "minors":
        slug = "-".join(parts[2:])
        return slug if "minor" in slug.split("-") else f"{slug}-minor"
    return re.sub(r"-{2,}", "-", "-".join(parts[1:]))  # ".../science-pre-veterinary--medical/" has a double hyphen


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
            name = ({INDEX: "_index", MINORS_INDEX: "_minors", LAS_CERTIFICATES: "_las_certificates"}.get(u)
                    or program_id(u))
            path = CACHE / f"{name}.html"
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


CHOICE = re.compile(r"\b(select|choose|pick|option|options|list|lists|focus|area|areas)\b", re.I)
ELECTIVE = re.compile(r"\belectives?\b", re.I)
CORE = re.compile(r"\b(core|required|requirements?)\b", re.I)
# A comment that only advises ("Highly recommended, optional 1 credit hour course, CS 100...") states no rule: it
# becomes a note and doesn't turn the list around it into a tick box. Anything with rule words still counts as a rule.
INFO = re.compile(r"\b(recommended|optional)\b", re.I)
RULE_WORDS = re.compile(
    r"\b(must|required|requires?|select|choose|complete|at least|minimum|maximum|only|hours? (?:of|from))\b", re.I)


# A choice written in a heading's parentheses: "Cognitive Neuroscience Advanced Course (choose two):",
# "Psychological Science Breadth, Group 2 (choose 2):".
PICK = re.compile(r"\((?:choose|select|pick|take)\s+(\d+|" + "|".join(NUMBERS) + r")\b[^)]*\)", re.I)


# A rule that points at the list after it ("...must be chosen from the list below", "...focus areas listed below").
BELOW = re.compile(r"\b(below|following)\b", re.I)
# A heading that picks one item: "Statistics elective, one course chosen from:", "Science elective(s), chosen from one
# of the following:".
ONE_OF = re.compile(r"\bone (?:course )?(?:chosen )?(?:of|from)\b|\bchosen from one of\b", re.I)
# A heading that takes its hours column from the list under it: "Technical electives chosen from the departmentally
# approved list below." (6 hours).
CHOSEN_FROM = re.compile(r"\b(?:chosen|selected)\s+from\b", re.I)


def advisory(text: str) -> bool:
    return bool(INFO.search(text)) and not RULE_WORDS.search(text) and not SELECT_N.match(text)


def listish(name: str, n_items: int, own: bool = True) -> bool:
    """A heading that names a choice rather than a list of required courses: "Urbanism (select one)", "Course List",
    "Instrumental Music Options" (one table per option, so it counts for each table under it), "Technical Electives".
    "Electives" counts only on the list's `own` heading (not one inherited from a table above), and not when the
    heading also says core or required ("Major Core Requirements and Electives" heads the required core) or there's a
    single item ("Introductory Economics Elective": ECON 102 or ECON 103 is exactly one requirement)."""
    if CHOICE.search(name):
        return True
    return own and bool(ELECTIVE.search(name)) and not CORE.search(name) and n_items > 1


def program_groups(rows: list[dict], section: str, start_index: int, fresh: bool = True) -> list[dict]:
    """One course-list table (not the gen-ed one) -> groups. Comment rows split the table into segments: courses before
    any comment are required ("all"); "Select N of the following" / "N hours from" segments become n_of / hours; any
    other comment is prose the schema can't express, so that segment (and any list after prose in the same table, like
    CS focus areas under "at least three... from a single focus area") becomes `manual`, listing its courses. So is a
    list under a heading that names a choice (`listish`); a heading is the list's own when it's an area row in the
    table or the page heading right above this table (`fresh`)."""
    groups: list[dict] = []
    name = section
    prose: list[str] = []  # the latest prose rule in this table; it governs the lists that follow it
    seg: dict | None = None
    own_name = fresh  # does `name` head this table, or was it inherited from a table above?

    def new(lead: list[str] | None = None, listish: bool = False, hours: int | None = None,
            pick: int | None = None) -> dict:
        return {"name": name, "lead": list(lead or []), "items": [], "listish": listish, "hours": hours, "join": False,
                "own": own_name, "info": [], "pick": pick, "parts": []}

    def flush() -> None:
        nonlocal seg
        if seg is not None and not seg["items"] and not seg["lead"] and seg["own"] and seg["hours"] and seg["name"]:
            # a heading with hours and no list ("Additional Advanced (300- or 400-level) PSYC or BCOG Courses", 6 hours)
            # is a requirement the catalog states in its heading: keep it rather than drop it
            groups.append({"name": seg["name"], "section": section or seg["name"], "rule": "manual",
                           "notes": [f"Catalog total: {seg['hours']} hours.",
                                     f"{seg['name']}: see the catalog page for which courses count."]})
            seg = None
            return
        if seg is None or (not seg["items"] and not seg["lead"]):
            seg = None
            return
        items, lead = seg["items"], seg["lead"]
        listed = [i[0] if len(i) == 1 else i for i in items]
        g: dict[str, Any] = {"name": seg["name"] or section or "Requirement", "section": section or seg["name"]}
        n = SELECT_N.match(lead[0]) if len(lead) == 1 else None
        h = SELECT_HOURS.match(lead[0]) if len(lead) == 1 else None
        named_choice = listish(seg["name"] or "", len(items), seg["own"])
        parts = [f"{p}: {', '.join(c for i in items[a:b] for c in i)}"
                 for (p, a), (_, b) in zip(seg["parts"], [*seg["parts"][1:], ("", len(items))], strict=False)]
        if items and seg["pick"] and seg["pick"] <= len(items) and not lead:
            # "Cognitive Neuroscience Advanced Course (choose two):", or "Group 1 (choose one):" over several lists
            g.update(rule="n_of", n=seg["pick"], courses=listed, notes=[f"Choose {seg['pick']}.", *parts])
        elif items and not lead and not prose and not named_choice and (not seg["listish"] or len(items) == 1):
            # a colon heading over a single course ("Developmental Psychology Core Course:") is no choice
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
            # a rule governs the lists after it in its table, whether it says so ("...listed below") or not ("At least
            # one Theory and one Methods course beyond the core.", then a Theory list and a Methods list)
            prose.extend(lead)
        if seg["hours"] is not None and g["rule"] != "hours":
            g.setdefault("notes", []).insert(0, f"Catalog total: {seg['hours']} hours.")
        if seg["info"]:
            g["notes"] = [*g.get("notes", []), *seg["info"]]
        groups.append(g)
        seg = None

    for r in rows:
        if r["kind"] == "sum":
            flush()
            name, prose, own_name = section, [], False
        elif r["kind"] == "area":
            t = r["text"]
            if seg is not None and seg["pick"] and not r["hours"].strip() and not PICK.search(t) and len(t) <= 70:
                # a sub-heading under "Group 1 (choose one):": its list joins the choice above
                seg["parts"].append((t.rstrip(":").strip(), len(seg["items"])))
                continue
            m = PICK.search(t)
            if (m or ONE_OF.search(t)) and len(t) <= 120:
                flush()
                own_name = True
                name = t.rstrip(":").strip()
                k = m.group(1).lower() if m else "1"
                seg = new(hours=_hours(r["hours"]), pick=int(k) if k.isdigit() else NUMBERS[k])
                continue
            if CHOSEN_FROM.search(t) and BELOW.search(t) and _hours(r["hours"]) and len(t) <= 120:
                # "Technical electives chosen from the departmentally approved list below." with 6 in the hours column
                flush()
                own_name = True
                name = t.rstrip(".:").strip()
                seg = new(lead=[f"Select {_hours(r['hours'])} hours from the list below."], hours=_hours(r["hours"]))
                seg["info"].append(t)
                continue
            choice = bool(SELECT_N.match(t) or SELECT_HOURS.match(t))
            short = not (len(t) > 70 or t.endswith(".")) and not choice
            if (short and seg is not None and seg["lead"] and not seg["items"] and any(map(BELOW.search, seg["lead"]))
                    and not any(SELECT_N.match(x) or SELECT_HOURS.match(x) for x in seg["lead"])):
                # a rule written right above a named list ("At least one ... from the list below", then "Team Project
                # Course List:") is that list's rule, not a requirement of its own with no courses
                name = t.rstrip(":").strip()
                seg.update(name=name, listish=t.endswith(":"), hours=_hours(r["hours"]), own=True)
                own_name = True
                continue
            flush()
            own_name = True
            if not short and not choice:  # a rule written into a header row
                if len(t) <= 90:  # short enough to name its group, rather than inheriting the heading above
                    name = t.rstrip(".:").strip()
                seg = new(lead=[t])
            elif SELECT_N.match(t) or SELECT_HOURS.match(t):  # "Select two of the following:" as a header row
                name = t.rstrip(":").strip()
                seg = new(lead=[name], hours=_hours(r["hours"]))
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
        elif advisory(r["text"]):
            if seg is None:
                seg = new()
            seg["info"].append(r["text"])
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
    program = re.sub(r",\s*UG$", "", h1[-1] if h1 else title.split("|")[0].strip())  # "History Minor, UG"
    year = re.search(r"(\d{4}-\d{4}) Course Catalog", title)
    # some minors have no requirements tab and list their courses on the overview tab
    found = doc.xpath('//*[@id="degreerequirementstextcontainer"]')
    c = found[0] if found else doc.get_element_by_id("textcontainer")
    text = norm(c.text_content())
    minor = is_minor(url)
    total = re.search(r"Minimum hours required for graduation:\s*(\d+)", text)
    notes = []
    if total:
        notes.append(f"Minimum hours required for graduation: {total.group(1)} hours.")
    upper = re.search(r"(Minimum of 40 hours of upper-division coursework[^.]*\.)", text)
    if upper:
        notes.append(upper.group(1))
    has_quote = PROGRAM_GENED_QUOTE in text
    groups: list[dict] = []
    section = "Requirements" if minor else ""
    sums: list[int] = []  # a minor states its size in a "Total Hours" row: "18", "18-21", "Minimum of 18"
    fresh = True  # no course table since the last heading
    for el in c.iter("h2", "h3", "h4", "p", "table"):
        if el.tag == "table" and "sc_courselist" in (el.get("class") or ""):
            rows = _rows(el)
            sums += [int(m.group()) for r in rows if r["kind"] == "sum" and (m := re.search(r"\d+", r["hours"]))]
            first = next((r for r in rows if r["kind"] != "sum"), None)
            if first and first.get("text", "").lower().startswith("composition i"):
                groups.extend(gened_groups(rows, has_quote))
            else:
                groups.extend(program_groups(rows, section, len(groups) + 1, fresh))
            fresh = False
        elif el.tag != "table" and not el.xpath("ancestor::table"):
            t = norm(el.text_content())
            heading_like = 0 < len(t) <= 80 and not t.endswith(".")
            if el.tag != "p" or (heading_like and not t.lower().startswith(("for the degree", "minimum", "follows"))
                                              and not (minor and t.lower().startswith("for the "))):
                section, fresh = t, True
    rules: list[dict[str, Any]] = [
        {"allow": False, "within": "cultural-studies", "quote": CS_QUOTE, "source": GENED_RULES_SOURCE},
        {"allow": True, "between": ["cultural-studies", "gened"],
         "quote": "These courses may fulfill other curricular requirements", "source": GENED_RULES_SOURCE}]
    if any(x in ("gened:ACP", "gened:QR2") for g in groups if g.get("kind") == "gened" for x in g.get("from", [])):
        rules.append({"allow": True, "between": ["gened", "gened"], "approved_for": ["ACP", "QR2"],
                      "quote": TWO_CATEGORIES_QUOTE, "source": GENED_POLICY_SOURCE})
    if has_quote:
        rules.append({"allow": True, "between": ["program", "gened"], "quote": PROGRAM_GENED_QUOTE, "source": url})
    if not any(g.get("exclusive") for g in groups):
        rules = [r for r in rules
                 if r.get("within") != "cultural-studies" and "cultural-studies" not in list(r.get("between") or [])]
    seg = url.split("/undergraduate/", 1)[-1].split("/")[0]
    college = COLLEGES.get(seg, seg.upper())
    for g in groups:  # a minor's lists under no heading of their own
        if minor and g["name"] == "Requirements":
            g["name"] = "Required courses" if g["rule"] == "all" else "More requirements"
            g["id"] = f"{_slug(g['name'])}-{g['id'].rsplit('-', 1)[1]}"
    hours = int(total.group(1)) if total else sums[-1] if minor and sums else None
    seen: dict[str, int] = {}
    for g in groups:  # a page with several gen-ed or concentration tables can repeat an id
        seen[g["id"]] = seen.get(g["id"], 0) + 1
        if seen[g["id"]] > 1:
            g["id"] = f"{g['id']}-{seen[g['id']]}"
    return {
        "id": program_id(url), **({"type": "minor"} if minor else {}), "program": program, "college": college,
        "catalog_year": year.group(1) if year else "", "source": url, "read_on": read_on, "generated": read_on,
        **({"total_hours": hours} if hours else {}), "notes": notes, "double_counting": rules,
        "groups": groups,
    }


def with_concentrations(urls: list[str], pages: dict[str, bytes], fetch: Any) -> list[str]:
    """The program pages to import, with concentrations. A program whose requirements are only on its concentration
    pages (English, Political Science) is replaced by them. One with requirements of its own *and* concentration pages
    (Psychology: "choose one of ten concentrations", 28-29 hours listed only on the concentration pages) is kept, so
    saved links still open, and each concentration with requirements of its own becomes a program too. `fetch(urls)`
    returns {url: page} and is merged into `pages`."""
    out = list(urls)
    for u in urls:
        if u not in pages or is_minor(u):
            continue
        subs = concentration_links(pages[u], u)
        if not subs:
            continue
        sub_pages = fetch(subs)
        pages.update(sub_pages)
        if not has_requirements(pages[u], u):
            out.remove(u)
            out.extend(subs)
        else:
            out.extend(s for s in subs if s in sub_pages and has_requirements(sub_pages[s], s))
    return out


def write(doc: dict, directory: Path = DEGREES_DIR) -> bool:
    """Write a generated file; never overwrite a hand-checked one (no `generated:` key), and leave one whose
    requirements haven't changed. Returns True if written."""
    path = directory / f"{doc['id']}.yaml"
    if path.exists():
        text = path.read_text(encoding="utf-8")
        if "generated:" not in text:
            return False
        # a minor's overlap rules are added by hand from the page's prose (#112): carry them into the new file
        kept = (yaml.safe_load(text) or {}).get("major_overlap")
        if kept and "major_overlap" not in doc:
            doc = {**{k: v for k, v in doc.items() if k != "groups"}, "major_overlap": kept, "groups": doc["groups"]}
        # the same requirements read again: keep the file (and its date) as it is, so a re-import only shows changes
        same = {k: v for k, v in doc.items() if k not in ("read_on", "generated")}
        old = {k: v for k, v in (yaml.safe_load(text) or {}).items() if k not in ("read_on", "generated")}
        if yaml.safe_dump(same, sort_keys=True) == yaml.safe_dump(old, sort_keys=True):
            return False
    header = (f"# {doc['program']} ({doc['college']}), {doc['catalog_year']} Academic Catalog.\n"
              f"# Generated from {doc['source']} on {doc['generated']} by pipeline/catalog_import.py: course lists,\n"
              "# alternatives and 'Select N' rules are read from the catalog's tables; prose rules are 'manual'\n"
              "# groups with the catalog's own words. Edit by hand and delete the `generated:` line to keep your\n"
              "# changes.\n")
    if doc.get("type") == "certificate":
        header = (f"# {doc['program']} ({doc['college']}), from the LAS certificates list on {doc['generated']} by\n"
                  "# pipeline/catalog_import.py: one hand-ticked group; the requirements are on the source page.\n"
                  "# Edit by hand and delete the `generated:` line to keep your changes.\n")
    path.write_text(header + yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline", action="store_true", help="only re-parse pages already in data/raw/catalog")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    ap.add_argument("--only", choices=["majors", "minors", "certificates"], help="import just one kind of program")
    args = ap.parse_args(argv)
    today = dt.date.today().isoformat()
    urls: list[str] = []
    if args.only in (None, "certificates"):
        page = fetch_all([LAS_CERTIFICATES], args.delay, args.offline).get(LAS_CERTIFICATES)
        certs = certificate_links(page) if page else []
        if not certs:
            print("warn: could not read the LAS certificates page; certificates are not updated", file=sys.stderr)
        n = sum(write(certificate_doc(name, u, today)) for name, u in certs)
        print(f"{len(certs)} certificates: {n} written")
        if args.only:
            return 0
    if args.only != "minors":
        index = fetch_all([INDEX], args.delay, args.offline).get(INDEX)
        if not index:
            print("could not read the catalog index", file=sys.stderr)
            return 1
        urls += program_links(index)
    if args.only != "majors":
        minors_index = fetch_all([MINORS_INDEX], args.delay, args.offline).get(MINORS_INDEX)
        if minors_index:
            urls += minor_links(minors_index)
        else:
            print("warn: could not read the catalog's minors index; minors are not updated", file=sys.stderr)
    pages = fetch_all(urls, args.delay, args.offline)
    urls = with_concentrations(urls, pages, lambda subs: fetch_all(subs, args.delay, args.offline))
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
            if not doc["groups"]:  # a requirements tab with no course tables: nothing a checklist could show
                raise ValueError("no requirement tables on the page")
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
    print(f"{len(urls)} programs ({sum(map(is_minor, urls))} minors): {written} written, {kept} kept (hand-checked or "
          f"unchanged), {failed} skipped; groups by rule {rules}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
