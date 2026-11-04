"""Section availability (Open / Closed / Open (Restricted)) from the public Course Explorer web pages.

The Course Explorer XML feed no longer includes enrollment status, but each course's public page
(https://courses.illinois.edu/schedule/{year}/{season}/{SUBJ}/{NUM}) lists "Availability:" per section.
Seat *counts* are only in Self-Service (NetID login) and are never scraped (DECISIONS.md D11.1).

Polite: at most 4 concurrent requests, retries with backoff, a User-Agent naming the project, and a time budget
(AVAILABILITY_BUDGET_SECONDS, default 15 min) after which the run keeps whatever it has.
"""

from __future__ import annotations

import asyncio
import os
import re
import sqlite3
import sys
import time
from datetime import UTC, datetime

from lxml import html as lhtml

from .config import RAW, USER_AGENT
from .course_explorer import term_parts

WEB_BASE = "https://courses.illinois.edu/schedule"
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


async def _fetch_all(courses: list[tuple[str, str]], year: int, season: str, budget: float,
                     concurrency: int = 4) -> tuple[dict[str, str], int, bool]:
    import httpx

    sem = asyncio.Semaphore(concurrency)
    t0 = time.monotonic()
    statuses: dict[str, str] = {}
    failed = 0
    timed_out = False
    cache_dir = RAW / "cis-web" / f"{year}-{season}"
    cache_dir.mkdir(parents=True, exist_ok=True)

    async def one(client: httpx.AsyncClient, subj: str, num: str) -> None:
        nonlocal failed, timed_out
        if time.monotonic() - t0 > budget:
            timed_out = True
            return
        delay = 2.0
        for attempt in range(4):
            async with sem:
                try:
                    r = await client.get(f"{WEB_BASE}/{year}/{season}/{subj}/{num}")
                    if r.status_code == 200:
                        (cache_dir / f"{subj}{num}.html").write_bytes(r.content)
                        statuses.update(parse_availability(r.content))
                        return
                    if r.status_code == 404:
                        return
                except httpx.TransportError:
                    pass
            if attempt < 3:
                await asyncio.sleep(delay)
                delay *= 2
        failed += 1

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True) as client:
        await asyncio.gather(*(one(client, s, n) for s, n in courses))
    return statuses, failed, timed_out


def run(conn: sqlite3.Connection, terms: list[str], subjects: set[str] | None = None) -> str:
    """Fill sections.enrollment_status for `terms` from the web pages; record when it was checked."""
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
            statuses, failed, timed_out = asyncio.run(_fetch_all(courses, year, season, budget))
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
        reports.append(f"{term}: {n} sections from {len(courses)} course pages"
                       f"{f', {failed} failed' if failed else ''}{', stopped at time budget' if timed_out else ''}")
    return "; ".join(reports)
