"""Phase 1: Course Explorer ingestion.

Two interchangeable sources produce the same records:

* ``api``  - the public Course Explorer XML API (https://courses.illinois.edu/cisapp/explorer/...).
             Crawled politely (max 4 concurrent requests, retry with backoff, raw XML cached under
             data/raw/cis/ so reruns are fast).
* ``csv``  - Wade Fagen-Ulmschneider's ``course-catalog`` mirror of the same API (one CSV per term).
             Used when the API host is unreachable (see DECISIONS.md D0.3).

``auto`` tries the API first and falls back to the CSV mirror.

Usage:  python -m pipeline.course_explorer --subjects CS,STAT,MATH [--source auto|api|csv] [--terms 2027-sp]
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import html
import io
import re
import sqlite3
import sys
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

from . import db
from .config import CIS_BASE, RAW, USER_AGENT
from .timeparse import days_to_str, parse_days, parse_time

SEASONS = {"sp": "spring", "su": "summer", "fa": "fall", "wi": "winter"}
SEASON_CODE = {v: k for k, v in SEASONS.items()}
# Course Explorer term ids: '1' + year + season digit.
SEASON_DIGIT = {"spring": "1", "summer": "5", "fall": "8", "winter": "0"}

# Gen-ed attribute text (as printed in "Degree Attributes") -> (category, code).
GENED_TEXT = {
    "Advanced Composition": ("ACP", "ACP"),
    "Composition I": ("COMP1", "COMP1"),
    "Cultural Studies - US Minority": ("CS", "US"),
    "Cultural Studies - Western": ("CS", "WCC"),
    "Cultural Studies - Non-West": ("CS", "NW"),
    "Humanities - Hist & Phil": ("HUM", "HP"),
    "Humanities - Lit & Arts": ("HUM", "LA"),
    "Nat Sci & Tech - Phys Sciences": ("NAT", "PS"),
    "Nat Sci & Tech - Life Sciences": ("NAT", "LS"),
    "Quantitative Reasoning I": ("QR", "QR1"),
    "Quantitative Reasoning II": ("QR", "QR2"),
    "Social & Beh Sci - Soc Sci": ("SBS", "SS"),
    "Social & Beh Sci - Beh Sci": ("SBS", "BSC"),
}

# Normalised short type code by Course Explorer type *name* (codes like S1/L2/E3 are numbered variants).
TYPE_BY_NAME = {
    "Lecture": "LEC", "Lecture-Discussion": "LCD", "Online": "ONL", "Online Lecture": "OLC",
    "Online Lecture-Discussion": "OLD", "Discussion/Recitation": "DIS", "Online Discussion": "OD",
    "Laboratory": "LAB", "Laboratory-Discussion": "LBD", "Online Lab": "OLB", "Quiz": "Q",
    "Practice": "PR", "Seminar": "SEM", "Conference": "CNF", "Independent Study": "IND",
    "Internship": "INT", "Research": "RES", "Studio": "ST", "Study Abroad": "STA", "Travel": "TRV",
    "Packaged Section": "PKG",
}
# Components that are taken *in addition to* a lecture (see DECISIONS.md D1.3).
SECONDARY_TYPES = {"DIS", "OD", "LAB", "LBD", "OLB", "Q", "PR"}


def term_parts(term: str) -> tuple[int, str]:
    """'2027-sp' -> (2027, 'spring')."""
    year, code = term.split("-")
    return int(year), SEASONS[code]


def term_label(term: str) -> str:
    year, season = term_parts(term)
    return f"{season.title()} {year}"


def term_sort_key(term: str) -> tuple[int, int]:
    year, season = term_parts(term)
    return year, ["winter", "spring", "summer", "fall"].index(season)


def parse_gened(text: str) -> list[str]:
    """'Humanities - Hist & Phil, and Cultural Studies - Non-West course.' -> ['HP', 'NW']."""
    codes: list[str] = []
    for name, (_cat, code) in GENED_TEXT.items():
        if name in text and code not in codes:
            # 'Quantitative Reasoning I' is a prefix of 'Quantitative Reasoning II'.
            if name == "Quantitative Reasoning I" and not re.search(r"Quantitative Reasoning I(?!I)", text):
                continue
            codes.append(code)
    return codes


def extract_prereq(*texts: str) -> str:
    for t in texts:
        m = re.search(r"Prerequisites?:\s*(.+)", t or "", flags=re.S)
        if m:
            return m.group(1).strip()
    return ""


def normalise_type(code: str, name: str) -> str:
    if name in TYPE_BY_NAME:
        return TYPE_BY_NAME[name]
    return re.sub(r"\d+$", "", code) or code


@dataclass
class Meeting:
    type: str
    type_name: str
    start: int | None
    end: int | None
    days: int
    building: str
    room: str
    instructors: list[str]


@dataclass
class Section:
    term: str
    crn: str
    subject: str
    number: str
    section_code: str
    part_of_term: str
    status_code: str
    enrollment_status: str
    section_title: str = ""
    section_credit_hours: str = ""
    section_text: str = ""
    section_notes: str = ""
    meetings: list[Meeting] = field(default_factory=list)
    component: str = "primary"
    link_group: str = "*"

    @property
    def type(self) -> str:
        primary = [m.type for m in self.meetings if m.type not in SECONDARY_TYPES]
        return (primary or [m.type for m in self.meetings] or [""])[0]

    @property
    def type_name(self) -> str:
        for m in self.meetings:
            if m.type == self.type:
                return m.type_name
        return ""

    @property
    def instructors(self) -> list[str]:
        out: list[str] = []
        for m in self.meetings:
            for i in m.instructors:
                if i not in out:
                    out.append(i)
        return out


@dataclass
class Course:
    term: str
    subject: str
    number: str
    title: str
    credit_hours: str
    description: str
    gened_text: str
    section_info_text: str
    schedule_info_text: str
    subject_name: str = ""

    @property
    def gened_codes(self) -> list[str]:
        return parse_gened(self.gened_text)

    @property
    def prereq_text(self) -> str:
        return extract_prereq(self.section_info_text, self.description)


# --------------------------------------------------------------------------------------------------
# Linked sections
# --------------------------------------------------------------------------------------------------

def _group_key(code: str) -> str | None:
    """'AL1' -> 'A', 'AYF' -> 'A'. Codes that don't start with two letters ('L1', 'B10') have no key."""
    if len(code) >= 2 and code[0].isalpha() and code[1].isalpha():
        return code[0].upper()
    return None


def assign_links(sections: list[Section]) -> None:
    """Infer which lectures pair with which discussions/labs for one course in one term.

    Rule (DECISIONS.md D1.3):
      1. A section's component is 'primary' unless every meeting is a secondary type (DIS, LAB, ...),
         in which case the component is that type. If a course has no primary sections at all, every
         section is primary (each is a standalone choice).
      2. If every section code starts with two letters and at least one first-letter group contains two
         or more components (e.g. AL1 + AD1..ADn), sections link only within their first-letter group.
      3. Otherwise any primary may pair with any secondary of each needed type (link_group '*').
    """
    for s in sections:
        types = {m.type for m in s.meetings}
        s.component = "primary" if (not types or types - SECONDARY_TYPES) else sorted(types)[0]
    if not any(s.component == "primary" for s in sections):
        for s in sections:
            s.component = "primary"
    comps = {s.component for s in sections}
    if len(comps) <= 1:
        for s in sections:
            s.link_group = "*"
        return
    keys = {s.crn: _group_key(s.section_code) for s in sections}
    if all(keys.values()):
        groups: dict[str, set[str]] = defaultdict(set)
        for s in sections:
            groups[keys[s.crn] or ""].add(s.component)
        if any(len(c) >= 2 for c in groups.values()):
            for s in sections:
                s.link_group = keys[s.crn] or "*"
            return
    for s in sections:
        s.link_group = "*"


# --------------------------------------------------------------------------------------------------
# CSV mirror (wadefagen/datasets course-catalog)
# --------------------------------------------------------------------------------------------------

def _split_instructors(raw: str) -> list[str]:
    return [p.strip() for p in raw.split(";") if p.strip()]


def parse_catalog_csv(
    source: Path | str | io.TextIOBase, subjects: set[str] | None = None
) -> tuple[list[Course], list[Section]]:
    """Parse one term of the course-catalog CSV mirror. One CSV row = one meeting of one CRN."""
    fh: io.TextIOBase
    if isinstance(source, (str, Path)):
        fh = open(source, newline="", encoding="utf-8")  # noqa: SIM115
    else:
        fh = source
    courses: dict[tuple[str, str], Course] = {}
    sections: dict[str, Section] = {}
    with fh:
        for row in csv.DictReader(fh):
            subj, num = row["Subject"].strip(), row["Number"].strip()
            if subjects and subj not in subjects:
                continue
            term = row["YearTerm"].strip()
            key = (subj, num)
            if key not in courses:
                courses[key] = Course(
                    term=term, subject=subj, number=num, title=html.unescape(row["Name"].strip()),
                    credit_hours=row["Credit Hours"].strip(), description=html.unescape(row["Description"].strip()),
                    gened_text=row["Degree Attributes"].strip(), section_info_text=row["Section Info"].strip(),
                    schedule_info_text=row["Schedule Information"].strip(),
                )
            crn = row["CRN"].strip()
            if not crn:
                continue
            sec = sections.get(crn)
            if sec is None:
                sec = sections[crn] = Section(
                    term=term, crn=crn, subject=subj, number=num, section_code=row["Section"].strip(),
                    part_of_term=row["Part of Term"].strip(), status_code=row["Status Code"].strip(),
                    enrollment_status=row["Enrollment Status"].strip(),
                    section_title=row["Section Title"].strip(),
                    section_credit_hours=row["Section Credit Hours"].strip(),
                )
            type_name = row["Type"].strip()
            sec.meetings.append(Meeting(
                type=normalise_type(row["Type Code"].strip(), type_name), type_name=type_name,
                start=parse_time(row["Start Time"]), end=parse_time(row["End Time"]),
                days=parse_days(row["Days of Week"]), building=_clean_place(row["Building"]),
                room=row["Room"].strip(), instructors=_split_instructors(row["Instructors"]),
            ))
    by_course: dict[tuple[str, str], list[Section]] = defaultdict(list)
    for s in sections.values():
        by_course[(s.subject, s.number)].append(s)
    for secs in by_course.values():
        assign_links(secs)
    return list(courses.values()), list(sections.values())


def _clean_place(text: str | None) -> str:
    t = (text or "").strip()
    return "" if t.lower() in {"n.a.", "na", "tba"} else t


# --------------------------------------------------------------------------------------------------
# XML API
# --------------------------------------------------------------------------------------------------

def _local(el: etree._Element, name: str) -> etree._Element | None:
    found = el.xpath(f"./*[local-name()='{name}']")
    return found[0] if found else None


def _text(el: etree._Element | None, name: str | None = None) -> str:
    if el is None:
        return ""
    if name is not None:
        el = _local(el, name)
        if el is None:
            return ""
    return (el.text or "").strip()


def parse_meeting_xml(m: etree._Element) -> Meeting:
    type_el = _local(m, "type")
    code = type_el.get("code", "") if type_el is not None else ""
    name = _text(type_el)
    instructors = [
        (i.text or "").strip() for i in m.xpath("./*[local-name()='instructors']/*[local-name()='instructor']")
    ]
    return Meeting(
        type=normalise_type(code, name), type_name=name,
        start=parse_time(_text(m, "start")), end=parse_time(_text(m, "end")),
        days=parse_days(_text(m, "daysOfTheWeek")), building=_clean_place(_text(m, "buildingName")),
        room=_text(m, "roomNumber"), instructors=[i for i in instructors if i],
    )


def parse_section_el(el: etree._Element, term: str, subject: str, number: str) -> Section:
    sec = Section(
        term=term, crn=el.get("id", ""), subject=subject, number=number,
        section_code=_text(el, "sectionNumber"), part_of_term=_text(el, "partOfTerm"),
        status_code=_text(el, "statusCode"), enrollment_status=_text(el, "enrollmentStatus"),
        section_title=_text(el, "sectionTitle"), section_credit_hours=_text(el, "creditHours"),
        section_text=_text(el, "sectionText"), section_notes=_text(el, "sectionNotes"),
    )
    for m in el.xpath("./*[local-name()='meetings']/*[local-name()='meeting']"):
        sec.meetings.append(parse_meeting_xml(m))
    return sec


def _term_from_parents(root: etree._Element) -> str:
    term_el = root.xpath("./*[local-name()='parents']/*[local-name()='term']")
    if not term_el:
        raise ValueError("XML has no parents/term")
    label = (term_el[0].text or "").strip()  # 'Spring 2027'
    season, year = label.split()
    return f"{year}-{SEASON_CODE[season.lower()]}"


def parse_course_xml(data: bytes) -> tuple[Course, list[Section]]:
    """Parse /schedule/{year}/{term}/{SUBJ}/{num}.xml?mode=cascade (course with detailedSections)."""
    root = etree.fromstring(data)
    subject, number = (root.get("id") or " ").split(" ", 1)
    term = _term_from_parents(root)
    subj_el = root.xpath("./*[local-name()='parents']/*[local-name()='subject']")
    course = Course(
        term=term, subject=subject, number=number, title=html.unescape(_text(root, "label")),
        credit_hours=_text(root, "creditHours"), description=html.unescape(_text(root, "description")),
        gened_text=_text(root, "sectionDegreeAttributes"),
        section_info_text=_text(root, "courseSectionInformation"),
        schedule_info_text=_text(root, "classScheduleInformation"),
        subject_name=(subj_el[0].text or "").strip() if subj_el else "",
    )
    if not course.gened_text:
        attrs = root.xpath(".//*[local-name()='genEdAttribute']")
        course.gened_text = ", and ".join((a.text or "").strip() for a in attrs)
    sections = [
        parse_section_el(el, term, subject, number)
        for el in root.xpath(".//*[local-name()='detailedSection']")
    ]
    assign_links(sections)
    return course, sections


def parse_section_xml(data: bytes) -> Section:
    """Parse /schedule/{year}/{term}/{SUBJ}/{num}/{crn}.xml (one section, mode=detail)."""
    root = etree.fromstring(data)
    term = _term_from_parents(root)
    course_el = root.xpath("./*[local-name()='parents']/*[local-name()='course']")
    subject, number = (course_el[0].get("id") or " ").split(" ", 1) if course_el else ("", "")
    return parse_section_el(root, term, subject, number)


def parse_index_xml(data: bytes, child: str) -> list[tuple[str, str]]:
    """Return (id, text) for children like <subject id='CS'>Computer Science</subject>."""
    root = etree.fromstring(data)
    return [(e.get("id", ""), (e.text or "").strip()) for e in root.iter() if etree.QName(e).localname == child]


class ApiCrawler:
    """Polite Course Explorer crawler: <= 4 concurrent requests, retries with backoff, on-disk cache."""

    def __init__(self, cache_dir: Path = RAW / "cis", concurrency: int = 4, refresh: bool = False):
        self.cache_dir = cache_dir
        self.sem = asyncio.Semaphore(concurrency)
        self.refresh = refresh

    async def get(self, client, path: str) -> bytes:  # type: ignore[no-untyped-def]
        cache = self.cache_dir / path.replace("?", "_")
        if cache.exists() and not self.refresh:
            return cache.read_bytes()
        delay = 1.0
        for attempt in range(5):
            async with self.sem:
                try:
                    r = await client.get(f"{CIS_BASE}/{path}")
                    if r.status_code == 200:
                        cache.parent.mkdir(parents=True, exist_ok=True)
                        cache.write_bytes(r.content)
                        return bytes(r.content)
                    if r.status_code == 404:
                        raise FileNotFoundError(path)
                except (OSError, TimeoutError) as e:  # network errors
                    if isinstance(e, FileNotFoundError) or attempt == 4:
                        raise
            await asyncio.sleep(delay)
            delay *= 2
        raise RuntimeError(f"giving up on {path}")

    async def crawl_term(
        self, term: str, subjects: set[str] | None
    ) -> tuple[list[Course], list[Section], dict[str, str]]:
        import httpx

        year, season = term_parts(term)
        async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
            subj_index = parse_index_xml(await self.get(client, f"schedule/{year}/{season}.xml"), "subject")
            names = dict(subj_index)
            wanted = [s for s, _ in subj_index if not subjects or s in subjects]
            course_ids: list[tuple[str, str]] = []
            for subj_xml in await asyncio.gather(
                *(self.get(client, f"schedule/{year}/{season}/{s}.xml") for s in wanted)
            ):
                root = etree.fromstring(subj_xml)
                subj = root.get("id", "")
                course_ids += [(subj, e.get("id", "")) for e in root.iter() if etree.QName(e).localname == "course"]
            results = await asyncio.gather(
                *(self.get(client, f"schedule/{year}/{season}/{s}/{n}.xml?mode=cascade") for s, n in course_ids)
            )
        courses, sections = [], []
        for data in results:
            c, secs = parse_course_xml(data)
            c.subject_name = names.get(c.subject, "")
            courses.append(c)
            sections += secs
        return courses, sections, names


def discover_terms_api() -> list[str]:
    """Read schedule.xml and return available terms like ['2026-fa', '2027-sp']."""
    import httpx

    r = httpx.get(f"{CIS_BASE}/schedule.xml", headers={"User-Agent": USER_AGENT}, timeout=20)
    r.raise_for_status()
    terms = []
    for _id, label in parse_index_xml(r.content, "calendarYear"):
        year = int(label)
        r2 = httpx.get(f"{CIS_BASE}/schedule/{year}.xml", headers={"User-Agent": USER_AGENT}, timeout=20)
        for _tid, tlabel in parse_index_xml(r2.content, "term"):
            season = tlabel.split()[0].lower()
            terms.append(f"{year}-{SEASON_CODE[season]}")
    return sorted(set(terms), key=term_sort_key)


def api_reachable() -> bool:
    import httpx

    try:
        r = httpx.get(f"{CIS_BASE}/schedule.xml", headers={"User-Agent": USER_AGENT}, timeout=10)
        return r.status_code == 200
    except Exception:
        return False


# --------------------------------------------------------------------------------------------------
# Load into SQLite
# --------------------------------------------------------------------------------------------------

def store(
    conn: sqlite3.Connection, term: str, courses: Iterable[Course], sections: Iterable[Section],
    source: str, checked_at: str, subject_names: dict[str, str] | None = None,
) -> int:
    year, season = term_parts(term)
    conn.execute("DELETE FROM courses WHERE term=?", (term,))
    conn.execute("DELETE FROM sections WHERE term=?", (term,))
    conn.execute("DELETE FROM meetings WHERE term=?", (term,))
    conn.execute(
        "INSERT OR REPLACE INTO terms VALUES (?,?,?,?,?,?)",
        (term, year, season, term_label(term), source, checked_at),
    )
    for subj, name in (subject_names or {}).items():
        conn.execute("INSERT OR REPLACE INTO subjects VALUES (?, ?)", (subj, name))
    conn.executemany(
        "INSERT OR REPLACE INTO courses VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
            (term, c.subject, c.number, c.title, c.credit_hours, c.description, " ".join(c.gened_codes),
             c.gened_text, c.prereq_text, c.section_info_text, c.schedule_info_text)
            for c in courses
        ],
    )
    n = 0
    for s in sections:
        m0 = next((m for m in s.meetings if m.type == s.type), s.meetings[0] if s.meetings else None)
        conn.execute(
            "INSERT OR REPLACE INTO sections VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                term, s.crn, s.subject, s.number, s.section_code, s.type, s.type_name, s.part_of_term,
                m0.start if m0 else None, m0.end if m0 else None, m0.days if m0 else 0,
                days_to_str(m0.days) if m0 else "", m0.building if m0 else "", m0.room if m0 else "",
                "; ".join(s.instructors), s.enrollment_status, s.status_code, s.section_title,
                s.section_credit_hours, s.section_text, s.section_notes, s.component, s.link_group,
            ),
        )
        for i, m in enumerate(s.meetings):
            conn.execute(
                "INSERT OR REPLACE INTO meetings VALUES (?,?,?,?,?,?,?,?,?,?)",
                (term, s.crn, i, m.type, m.start, m.end, m.days, m.building, m.room, "; ".join(m.instructors)),
            )
        n += 1
    return n


def load_term(
    conn: sqlite3.Connection, term: str, subjects: set[str] | None, source: str = "auto",
    catalog_csv: Path | None = None, checked_at: str = "",
) -> tuple[int, str]:
    """Load one term from the chosen source. Returns (n_sections, source_used)."""
    if source in ("api", "auto") and (source == "api" or api_reachable()):
        courses, sections, names = asyncio.run(ApiCrawler().crawl_term(term, subjects))
        from datetime import UTC, datetime

        n = store(conn, term, courses, sections, "cis-api", datetime.now(UTC).isoformat(timespec="seconds"), names)
        return n, "cis-api"
    if catalog_csv is None or not catalog_csv.exists():
        raise FileNotFoundError(f"no CSV mirror for {term}: {catalog_csv}")
    courses, sections = parse_catalog_csv(catalog_csv, subjects)
    return store(conn, term, courses, sections, "wade-course-catalog", checked_at), "wade-course-catalog"


def main(argv: list[str] | None = None) -> int:
    from .fetch import catalog_path, fetch_wade, snapshot_dates

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--subjects", default="all", help="comma list, e.g. CS,STAT,MATH, or 'all'")
    ap.add_argument("--all", action="store_true", help="same as --subjects all")
    ap.add_argument("--terms", default="2026-fa,2027-sp")
    ap.add_argument("--source", choices=["auto", "api", "csv"], default="auto")
    args = ap.parse_args(argv)
    subjects = None if args.all or args.subjects == "all" else {s.strip().upper() for s in args.subjects.split(",")}
    terms = [t.strip() for t in args.terms.split(",")]
    fetch_wade(terms)
    dates = snapshot_dates()
    conn = db.connect()
    for term in terms:
        n, used = load_term(conn, term, subjects, args.source, catalog_path(term),
                            dates.get(f"course-catalog/data/{term}.csv", ""))
        print(f"{term}: {n} sections from {used}")
    conn.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
