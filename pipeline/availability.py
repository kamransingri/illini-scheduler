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
from datetime import UTC, datetime
from typing import Any

from lxml import html as lhtml

from .config import DATA, RAW, USER_AGENT
from .course_explorer import term_parts

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

def load_file(term: str) -> dict:
    p = AVAIL_DIR / f"{term}.json"
    if p.exists():
        d = json.loads(p.read_text())
        d.setdefault("sections", {})
        d.setdefault("courses", {})
        return d
    return {"term": term, "sections": {}, "courses": {}}


def save_file(term: str, d: dict) -> None:
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
                for crn, status in parse_availability(r.content).items():
                    d["sections"][crn] = [status, now]
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
        d = crawl_slow(term, courses_from_catalog(term), time.monotonic() + share, args.interval)
        print(d["_report"], flush=True)
    return 0


def apply_files(conn: sqlite3.Connection, terms: list[str]) -> str:
    """Load data/availability/{term}.json into the DB (used by the nightly site build)."""
    reports = []
    for term in terms:
        d = load_file(term)
        if not d["sections"]:
            reports.append(f"{term}: no availability file")
            continue
        conn.execute("DELETE FROM availability WHERE term=?", (term,))
        conn.executemany("INSERT INTO availability VALUES (?,?,?,?)",
                         [(term, crn, st, at) for crn, (st, at) in d["sections"].items()])
        n = conn.execute(
            "UPDATE sections SET enrollment_status = (SELECT status FROM availability a "
            "WHERE a.term = sections.term AND a.crn = sections.crn) "
            "WHERE term=? AND crn IN (SELECT crn FROM availability WHERE term=?)", (term, term)).rowcount
        total = conn.execute("SELECT COUNT(*) FROM sections WHERE term=?", (term,)).fetchone()[0]
        latest = max(at for _st, at in d["sections"].values())
        conn.execute("UPDATE terms SET checked_at=?, source=CASE WHEN source LIKE '%web availability%' THEN source "
                     "ELSE source || ' + web availability' END WHERE term=?", (latest, term))
        reports.append(f"{term}: {n} of {total} sections have a status")
    return "; ".join(reports)


def run(conn: sqlite3.Connection, terms: list[str], subjects: set[str] | None = None) -> str:
    """Fill sections.enrollment_status for `terms`. AVAILABILITY_MODE=file (the nightly build) reads the files the
    slow job maintains; `crawl` (default when no files exist) fetches the pages now, which is fine at small scale."""
    mode = os.environ.get("AVAILABILITY_MODE", "auto")
    if mode == "file" or (mode == "auto" and any(load_file(t)["sections"] for t in terms)):
        return apply_files(conn, terms)
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
