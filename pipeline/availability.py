"""Section availability (Open / Closed / Open (Restricted)) from the public Course Explorer web pages.

The Course Explorer XML feed no longer includes enrollment status, but each course's public page
(https://courses.illinois.edu/schedule/{year}/{season}/{SUBJ}/{NUM}) lists "Availability:" per section.
Seat *counts* are only in Self-Service (NetID login) and are never scraped (DECISIONS.md D11.1).

Polite: at most 4 concurrent requests, retries with backoff, a User-Agent naming the project, and a time budget
(AVAILABILITY_BUDGET_SECONDS, default 15 min) after which the run keeps whatever it has.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sqlite3
import sys
import time
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from lxml import html as lhtml

from .config import DATA, RAW, USER_AGENT
from .course_explorer import term_parts
from .timeparse import parse_time

WEB_BASE = "https://courses.illinois.edu/schedule"
AVAIL_DIR = DATA / "availability"
CRN_RE = re.compile(r"^\d{5}$")


def parse_availability(page: str | bytes) -> dict[str, str]:
    """CRN -> availability text ('Open', 'Closed', 'Open (Restricted)', 'CrossListOpen', ...)."""
    doc = lhtml.fromstring(page)
    out: dict[str, str] = {}
    for row in doc.iter("tr"):
        crn = None
        for div in row.iter("div"):
            t = (div.text or "").strip()
            if CRN_RE.match(t):
                crn = t
                break
        if crn is None:
            continue
        for dt in row.iter("dt"):
            if (dt.text or "").strip().rstrip(":").lower() == "availability":
                dd = dt.getnext()
                if dd is not None and dd.tag == "dd":
                    status = " ".join(dd.text_content().split())
                    if status:
                        out[crn] = status
                break
    return out


def _texts(td) -> list[str]:  # type: ignore[no-untyped-def]
    """Per-meeting texts of a table cell (one div.app-meeting per meeting), or the cell text."""
    divs = [d for d in td.iter("div") if "app-meeting" in (d.get("class") or "")]
    if divs:
        return [" ".join(d.text_content().split()) for d in divs]
    t = " ".join(td.text_content().split())
    return [t] if t else []


def _split_place(text: str) -> tuple[str, str]:
    """'4025 Campus Instructional Facility' -> ('4025', 'Campus Instructional Facility'); 'n.a.' -> ('', '')."""
    t = text.strip()
    if not t or t.lower() in {"n.a.", "na", "tba"}:
        return "", ""
    first, _, rest = t.partition(" ")
    if rest and (any(ch.isdigit() for ch in first) or (first.isupper() and len(first) <= 6)):
        return first, rest
    return "", t


def parse_course_page(page: str | bytes) -> dict:
    """Everything the course page shows: course details + every section row with all its meetings.

    Returns {"title", "credits", "description", "info", "geneds": [...], "sections": [
        {"crn", "type_name", "code", "status", "part", "notes", "meetings": [
            {"start", "end", "days", "room", "building", "instructors": [...]}]}]}"""
    doc = lhtml.fromstring(page)
    out: dict = {"title": "", "credits": "", "description": "", "info": "", "geneds": [], "sections": []}
    label = doc.xpath("//div[contains(@class,'app-label')]")
    if label:
        out["title"] = " ".join(label[0].text_content().split())
    detail = doc.xpath("//*[@id='schedule-course-detail']")
    if detail:
        paras = [" ".join(p.text_content().split()) for p in detail[0].findall(".//p")]
        for ptxt in paras:
            if ptxt.startswith("Credit:"):
                out["credits"] = ptxt.removeprefix("Credit:").strip()
            elif ptxt.startswith("This course satisfies"):
                continue
            elif not out["description"]:
                out["description"] = ptxt
            elif not out["info"]:
                out["info"] = ptxt
        out["geneds"] = [" ".join(d.text_content().split()) for d in detail[0].findall("div")]
    for row in doc.iter("tr"):
        tds = row.findall("td")
        crn_i = next((k for k, td in enumerate(tds) if CRN_RE.match(" ".join(td.text_content().split()))), None)
        if crn_i is None or len(tds) < crn_i + 8:
            continue
        crn = " ".join(tds[crn_i].text_content().split())
        types, codes, times, days, places, insts = (_texts(tds[crn_i + k]) for k in range(1, 7))
        details: dict[str, str] = {}
        for dt in tds[crn_i + 7].iter("dt"):
            dd = dt.getnext()
            if dd is not None and dd.tag == "dd":
                details[(dt.text or "").strip().rstrip(":")] = " ".join(dd.text_content().split())
        n = max(len(times), len(days), 1)
        meetings = []
        for k in range(n):
            tm = times[k] if k < len(times) else ""
            if "ARRANGED" in tm.upper() or not tm:
                start = end = None
            else:
                a, _, b = tm.partition("-")
                start, end = parse_time(a.strip()), parse_time(b.strip())
            room, building = _split_place(places[k] if k < len(places) else "")
            who = insts[k] if k < len(insts) else (insts[0] if insts else "")
            meetings.append({"start": start, "end": end, "days": days[k] if k < len(days) else "",
                             "room": room, "building": building,
                             "type_name": types[k] if k < len(types) else (types[0] if types else ""),
                             "instructors": [x.strip() for x in who.split(";") if x.strip()] if who else []})
        notes = " ".join(filter(None, (details.get("Section Info", ""), details.get("Restriction(s)", ""))))
        out["sections"].append({
            "crn": crn, "code": codes[0] if codes else "", "type_name": types[0] if types else "",
            "status": details.get("Availability", ""), "part": details.get("Part of Term", "1") or "1",
            "title": details.get("Section Title", ""), "notes": notes[:600], "meetings": meetings,
        })
    return out


async def _fetch_all(courses: list[tuple[str, str]], year: int, season: str, budget: float,
                     concurrency: int = 2) -> tuple[dict[str, str], int, bool, Counter[str]]:
    """Fetch every course page. Throttling (429/503, or repeated errors) pauses *all* workers, honouring
    Retry-After; failures get one more pass after a cool-down. Returns statuses, failures, timeout, reasons."""
    import httpx

    sem = asyncio.Semaphore(concurrency)
    t0 = time.monotonic()
    statuses: dict[str, str] = {}
    reasons: Counter[str] = Counter()
    timed_out = False
    pause_until = 0.0
    cache_dir = RAW / "cis-web" / f"{year}-{season}"
    cache_dir.mkdir(parents=True, exist_ok=True)

    async def one(client: httpx.AsyncClient, subj: str, num: str) -> bool:
        nonlocal timed_out, pause_until
        delay = 2.0
        for _attempt in range(4):
            if time.monotonic() - t0 > budget:
                timed_out = True
                return False
            wait = pause_until - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            async with sem:
                try:
                    r = await client.get(f"{WEB_BASE}/{year}/{season}/{subj}/{num}")
                    if r.status_code == 200:
                        (cache_dir / f"{subj}{num}.html").write_bytes(r.content)
                        statuses.update(parse_availability(r.content))
                        return True
                    if r.status_code == 404:
                        return True
                    reasons[f"HTTP {r.status_code}"] += 1
                    if r.status_code in (429, 503):
                        ra = r.headers.get("Retry-After", "")
                        pause = min(float(ra), 120.0) if ra.isdigit() else 30.0
                        pause_until = max(pause_until, time.monotonic() + pause)
                except httpx.TransportError as e:
                    reasons[type(e).__name__] += 1
            await asyncio.sleep(delay)
            delay *= 2
        return False

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True) as client:
        ok = await asyncio.gather(*(one(client, s, n) for s, n in courses))
        retry = [c for c, good in zip(courses, ok, strict=True) if not good]
        if retry and not timed_out:
            await asyncio.sleep(60)  # cool down, then one more pass
            ok2 = await asyncio.gather(*(one(client, s, n) for s, n in retry))
            failed = sum(1 for g in ok2 if not g)
        else:
            failed = len(retry)
    return statuses, failed, timed_out, reasons


# ---------------------------------------------------------------------------------------------------------
# Slow, resumable job (GitHub Actions: .github/workflows/availability.yml). Course Explorer answers bursts from
# datacenter IPs with HTTP 202, so this fetches ~1 page/second, oldest-checked courses first, saving as it goes.
# ---------------------------------------------------------------------------------------------------------

EVENT_DAYS = 21  # how long seat-change events are kept


def load_file(term: str) -> dict:
    """Term file: sections {crn: [status, checked_at, since]}, courses {"CS 124": checked_at},
    rows {"CS 124": parsed page without statuses}, events [[at, crn, course, code, old, new], ...]."""
    p = AVAIL_DIR / f"{term}.json"
    d = json.loads(p.read_text()) if p.exists() else {"term": term}
    for k, default in (("sections", {}), ("courses", {}), ("rows", {}), ("events", [])):
        d.setdefault(k, default)
    return d


def record_page(d: dict, course: str, page: dict, now: str) -> None:
    """Store one parsed course page and log any status change as an event."""
    d["rows"][course] = {**{k: v for k, v in page.items() if k != "sections"},
                         "sections": [{k: v for k, v in sec.items() if k != "status"} for sec in page["sections"]]}
    for sec in page["sections"]:
        status = sec["status"]
        if not status:
            continue
        prev = d["sections"].get(sec["crn"])
        if prev is None:
            since = ""  # first time we see it: we don't know how long it has been this way
        elif prev[0] != status:
            since = now
            d["events"].append([now, sec["crn"], course, sec["code"], prev[0], status])
        else:
            since = prev[2] if len(prev) > 2 else ""
        d["sections"][sec["crn"]] = [status, now, since]


def save_file(term: str, d: dict) -> None:
    cutoff = (datetime.now(UTC) - timedelta(days=EVENT_DAYS)).isoformat(timespec="seconds")
    d["events"] = [e for e in d.get("events", []) if e[0] >= cutoff][-5000:]
    AVAIL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = AVAIL_DIR / f"{term}.json.part"
    tmp.write_text(json.dumps(d, sort_keys=True, separators=(",", ":")))
    tmp.replace(AVAIL_DIR / f"{term}.json")


def crawl_slow(term: str, courses: list[tuple[str, str]], deadline: float, interval: float = 1.0,
               client: Any = None, sleep: Any = time.sleep) -> dict:
    """Fetch course pages one at a time until `deadline` (time.monotonic()). Returns the updated term file."""
    import httpx

    year, season = term_parts(term)
    d = load_file(term)
    order = sorted(courses, key=lambda c: d["courses"].get(f"{c[0]} {c[1]}", ""))  # never-checked first
    own = client is None
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True)
    reasons: Counter[str] = Counter()
    ok = streak = 0
    try:
        for i, (subj, num) in enumerate(order):
            if time.monotonic() > deadline:
                break
            try:
                r = http.get(f"{WEB_BASE}/{year}/{season}/{subj}/{num}")
                code = r.status_code
            except httpx.TransportError as e:
                code, r = 0, None
                reasons[type(e).__name__] += 1
            now = datetime.now(UTC).isoformat(timespec="seconds")
            if code == 200 and r is not None:
                record_page(d, f"{subj} {num}", parse_course_page(r.content), now)
                d["courses"][f"{subj} {num}"] = now
                ok += 1
                streak = 0
            elif code == 404:
                d["courses"][f"{subj} {num}"] = now
            else:
                if code:
                    reasons[f"HTTP {code}"] += 1
                streak += 1
                if streak >= 10:  # being pushed back: cool down hard, then carry on
                    sleep(300)
                    streak = 0
                else:
                    sleep(15)
            if i % 100 == 99:
                save_file(term, d)
            sleep(interval)
    finally:
        if own:
            http.close()
        save_file(term, d)
    d["_report"] = f"{term}: {ok} course pages read, {len(d['sections'])} sections known, failures {dict(reasons)}"
    return d


def courses_from_index(term: str, client: Any = None) -> list[tuple[str, str]]:
    """Course list from Course Explorer's own subject index (includes courses added after the mirror snapshot).
    Returns [] if the index can't be read; callers fall back to the catalog mirror."""
    import httpx

    from .config import CIS_BASE
    from .course_explorer import parse_index_xml

    year, season = term_parts(term)
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True)
    out: set[tuple[str, str]] = set()
    try:
        r = http.get(f"{CIS_BASE}/schedule/{year}/{season}.xml")
        if r.status_code != 200:
            return []
        for subj, _name in parse_index_xml(r.content, "subject"):
            time.sleep(0.5)
            r2 = http.get(f"{CIS_BASE}/schedule/{year}/{season}/{subj}.xml")
            if r2.status_code != 200:
                return []  # partial index would drop courses: use the mirror instead
            out |= {(subj, cid) for cid, _t in parse_index_xml(r2.content, "course")}
    except httpx.HTTPError:
        return []
    finally:
        if client is None:
            http.close()
    return sorted(out)


def courses_from_catalog(term: str) -> list[tuple[str, str]]:
    import csv

    from .fetch import catalog_path

    with open(catalog_path(term), newline="", encoding="utf-8") as fh:
        return sorted({(r["Subject"].strip(), r["Number"].strip()) for r in csv.DictReader(fh)})


def main(argv: list[str] | None = None) -> int:
    import argparse

    from .fetch import CURRENT_TERM, NEXT_TERM, fetch_wade

    ap = argparse.ArgumentParser(description="Slow, resumable seat-availability crawl")
    ap.add_argument("--terms", default=f"{NEXT_TERM},{CURRENT_TERM}", help="first term gets the time first")
    ap.add_argument("--minutes", type=float, default=270)
    ap.add_argument("--interval", type=float, default=1.0, help="seconds between requests")
    args = ap.parse_args(argv)
    terms = [t.strip() for t in args.terms.split(",") if t.strip()]
    fetch_wade(terms)
    end = time.monotonic() + args.minutes * 60
    for k, term in enumerate(terms):
        # give each remaining term an equal share of the time that's left
        share = (end - time.monotonic()) / (len(terms) - k)
        courses = sorted(set(courses_from_index(term)) | set(courses_from_catalog(term)))
        d = crawl_slow(term, courses, time.monotonic() + share, args.interval)
        print(d["_report"], flush=True)
    return 0


def apply_web_rows(conn: sqlite3.Connection, term: str) -> str:
    """Replace the mirror's sections with the parsed Course Explorer page for every course the slow job has read
    (fresher times, rooms, instructors and section notes; courses added after the mirror snapshot appear too)."""
    from .course_explorer import Course, Meeting, Section, assign_links, insert_sections, normalise_type
    from .timeparse import parse_days

    d = load_file(term)
    if not d["rows"]:
        return f"{term}: no section rows"
    n_courses = n_secs = n_new = 0
    for key, page in d["rows"].items():
        subj, _, num = key.partition(" ")
        if not page.get("sections"):
            continue
        existing = conn.execute("SELECT 1 FROM courses WHERE term=? AND subject=? AND number=?",
                                (term, subj, num)).fetchone()
        if existing and page.get("title"):
            conn.execute("UPDATE courses SET title=?, credit_hours=?, description=?, section_info_text=? "
                         "WHERE term=? AND subject=? AND number=?",
                         (page["title"], page.get("credits", ""), " ".join(filter(None, (page.get("description"),
                          page.get("info")))), page.get("info", ""), term, subj, num))
        elif not existing:
            c = Course(term=term, subject=subj, number=num, title=page.get("title") or key,
                       credit_hours=page.get("credits", ""),
                       description=" ".join(filter(None, (page.get("description"), page.get("info")))),
                       gened_text=", and ".join(page.get("geneds", [])), section_info_text=page.get("info", ""),
                       schedule_info_text="")
            conn.execute("INSERT OR REPLACE INTO courses VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                         (term, subj, num, c.title, c.credit_hours, c.description, " ".join(c.gened_codes),
                          c.gened_text, c.prereq_text, c.section_info_text, c.schedule_info_text))
            n_new += 1
        sections = []
        for row in page["sections"]:
            status = (d["sections"].get(row["crn"]) or [""])[0]
            sec = Section(term=term, crn=row["crn"], subject=subj, number=num, section_code=row.get("code", ""),
                          part_of_term=row.get("part") or "1", status_code="P" if status == "Pending" else "A",
                          enrollment_status=status, section_title=row.get("title", ""),
                          section_text=row.get("notes", ""))
            for m in row.get("meetings", []):
                try:
                    days = parse_days(m.get("days"))
                except ValueError:
                    days = 0
                sec.meetings.append(Meeting(type=normalise_type("", m.get("type_name", "")),
                                            type_name=m.get("type_name", ""), start=m.get("start"),
                                            end=m.get("end"), days=days, building=m.get("building", ""),
                                            room=m.get("room", ""), instructors=m.get("instructors", [])))
            sections.append(sec)
        assign_links(sections)
        conn.execute("DELETE FROM meetings WHERE term=? AND crn IN (SELECT crn FROM sections WHERE term=? AND "
                     "subject=? AND number=?)", (term, term, subj, num))
        conn.execute("DELETE FROM sections WHERE term=? AND subject=? AND number=?", (term, subj, num))
        n_secs += insert_sections(conn, term, sections)
        n_courses += 1
    conn.execute("UPDATE terms SET source='course-explorer-web' WHERE term=?", (term,))
    return f"{term}: {n_secs} sections from {n_courses} course pages ({n_new} courses not in the mirror)"


def apply_files(conn: sqlite3.Connection, terms: list[str]) -> str:
    """Load data/availability/{term}.json into the DB (used by the nightly site build)."""
    reports = []
    for term in terms:
        d = load_file(term)
        if not d["sections"]:
            reports.append(f"{term}: no availability file")
            continue
        conn.execute("DELETE FROM availability WHERE term=?", (term,))
        conn.executemany("INSERT INTO availability (term, crn, status, checked_at, since) VALUES (?,?,?,?,?)",
                         [(term, crn, v[0], v[1], v[2] if len(v) > 2 else "") for crn, v in d["sections"].items()])
        conn.execute("DELETE FROM seat_events WHERE term=?", (term,))
        conn.executemany("INSERT INTO seat_events VALUES (?,?,?,?,?,?,?,?)",
                         [(term, at, crn, *course.split(" ", 1), code, old, new)
                          for at, crn, course, code, old, new in d["events"]])
        n = conn.execute(
            "UPDATE sections SET enrollment_status = (SELECT status FROM availability a "
            "WHERE a.term = sections.term AND a.crn = sections.crn) "
            "WHERE term=? AND crn IN (SELECT crn FROM availability WHERE term=?)", (term, term)).rowcount
        total = conn.execute("SELECT COUNT(*) FROM sections WHERE term=?", (term,)).fetchone()[0]
        latest = max(v[1] for v in d["sections"].values())
        conn.execute("UPDATE terms SET checked_at=?, source=CASE WHEN source LIKE '%web availability%' THEN source "
                     "ELSE source || ' + web availability' END WHERE term=?", (latest, term))
        reports.append(f"{term}: {n} of {total} sections have a status")
    return "; ".join(reports)


def run(conn: sqlite3.Connection, terms: list[str], subjects: set[str] | None = None) -> str:
    """Fill sections.enrollment_status for `terms`. AVAILABILITY_MODE=file (the nightly build) reads the files the
    slow job maintains; `crawl` (default when no files exist) fetches the pages now, which is fine at small scale."""
    mode = os.environ.get("AVAILABILITY_MODE", "auto")
    if mode == "file" or (mode == "auto" and any(load_file(t)["sections"] for t in terms)):
        rows = "; ".join(apply_web_rows(conn, t) for t in terms)
        return f"{rows}; {apply_files(conn, terms)}"
    budget = float(os.environ.get("AVAILABILITY_BUDGET_SECONDS", "900"))
    reports = []
    for term in terms:
        year, season = term_parts(term)
        q = "SELECT DISTINCT subject, number FROM sections WHERE term=?"
        courses = [(r[0], r[1]) for r in conn.execute(q, (term,)) if not subjects or r[0] in subjects]
        if not courses:
            continue
        started = datetime.now(UTC).isoformat(timespec="seconds")
        try:
            statuses, failed, timed_out, reasons = asyncio.run(_fetch_all(courses, year, season, budget))
        except Exception as e:  # noqa: BLE001 - availability is optional; never fail the pipeline for it
            print(f"warn: availability for {term} failed: {type(e).__name__}: {e}", file=sys.stderr)
            reports.append(f"{term}: unavailable")
            continue
        n = 0
        for crn, status in statuses.items():
            n += conn.execute("UPDATE sections SET enrollment_status=? WHERE term=? AND crn=?",
                              (status, term, crn)).rowcount
        if n:
            conn.execute("UPDATE terms SET checked_at=?, source=source || ' + web availability' "
                         "WHERE term=? AND source NOT LIKE '%web availability%'", (started, term))
            conn.execute("UPDATE terms SET checked_at=? WHERE term=?", (started, term))
        detail = f", {failed} failed ({dict(reasons.most_common(3))})" if failed else ""
        budget_note = ", stopped at time budget" if timed_out else ""
        reports.append(f"{term}: {n} sections from {len(courses)} course pages{detail}{budget_note}")
    return "; ".join(reports)


if __name__ == "__main__":
    sys.exit(main())
