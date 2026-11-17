"""Near-real-time seat changes for the "Just opened" page.

The daily crawl (availability.py) reads every course page once a day; seats in popular courses change faster than
that. This job runs every ~10 minutes (.github/workflows/live-seats.yml), re-reads only the busiest courses of the
next term, and publishes what changed to a small file on the `live-seats` branch:

    live.json   what the page polls (from raw.githubusercontent.com, which allows cross-origin reads):
                {"updated", "window_hours", "checked": {term: courses re-read in the window},
                 "events": [SeatEvent...] newest first, "seen": {term: {crn: [status, checked_at]}}}
    state.json  this job's memory between runs: last status per CRN and when each course was last re-read

"Busiest" = recent seat changes, closed sections and size, from the daily crawl's term file (data/availability/).
Course Explorer has no cross-origin headers, so the browser can't ask it directly; this is the closest a static site
gets to live. Polite: one request at a time, ~1.5 s apart, a User-Agent naming the project, and it stops early when
Course Explorer pushes back.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .availability import WEB_BASE, load_file, parse_availability
from .config import USER_AGENT
from .course_explorer import term_parts

WINDOW_HOURS = 48  # how long events stay in live.json
HOT_EVENT_DAYS = 3  # recent changes that make a course "busy"


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _is_open(status: str) -> bool:
    return "open" in (status or "").lower()


def load_state(path: Path) -> dict:
    d = json.loads(path.read_text()) if path.exists() else {}
    d.setdefault("terms", {})
    return d


def term_state(state: dict, term: str) -> dict:
    t = state["terms"].setdefault(term, {})
    for k in ("sections", "courses"):
        t.setdefault(k, {})
    t.setdefault("events", [])
    return t


def hot_courses(daily: dict, live: dict, now: str, limit: int, always: int = 60) -> list[str]:
    """Courses worth re-reading often: the `always` busiest every run, then the rest of the top `limit`, least
    recently re-read first (a run gets through ~240 courses, so those come round every 15-20 minutes).

    daily: the daily crawl's term file (rows, sections, events); live: this job's term state."""
    cutoff = (datetime.fromisoformat(now) - timedelta(days=HOT_EVENT_DAYS)).isoformat(timespec="seconds")
    recent: Counter[str] = Counter(e[2] for e in daily.get("events", []) if e[0] >= cutoff)
    recent.update(e["s"] + " " + e["n"] for e in live.get("events", []) if e["at"] >= cutoff)
    scored: list[tuple[float, str]] = []
    for course, page in daily.get("rows", {}).items():
        crns = [s["crn"] for s in page.get("sections", [])]
        statuses = [(daily["sections"].get(c) or [""])[0] for c in crns]
        if not any(statuses):
            continue
        closed = sum(1 for s in statuses if s and not _is_open(s))
        if not closed and not recent[course]:
            continue  # everything open and nothing moving: the daily crawl is enough
        score = 3 * recent[course] + 2 * min(closed, 10) + min(len(crns), 20) / 4 + (5 if closed else 0)
        scored.append((score, course))
    scored.sort(key=lambda x: (-x[0], x[1]))
    top = [c for _, c in scored[:limit]]
    return top[:always] + sorted(top[always:], key=lambda c: live["courses"].get(c, ""))


def baseline(daily: dict, live: dict, crn: str) -> tuple[str, str] | None:
    """The newest status known for a CRN, from this job or the daily crawl: (status, checked_at)."""
    a = live["sections"].get(crn)
    b = daily.get("sections", {}).get(crn)
    cands = [(x[0], x[1]) for x in (a, b) if x]
    return max(cands, key=lambda x: x[1]) if cands else None


def check(term: str, courses: list[str], daily: dict, live: dict, titles: dict[str, str], deadline: float,
          interval: float = 1.5, client: Any = None, sleep: Any = time.sleep) -> str:
    """Re-read `courses` until `deadline` (time.monotonic()); record status changes as events in `live`."""
    import httpx

    year, season = term_parts(term)
    own = client is None
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20, follow_redirects=True)
    reasons: Counter[str] = Counter()
    ok = streak = changes = 0
    try:
        for course in courses:
            if time.monotonic() > deadline:
                break
            subj, _, num = course.partition(" ")
            try:
                r = http.get(f"{WEB_BASE}/{year}/{season}/{subj}/{num}")
                code = r.status_code
            except httpx.TransportError as e:
                r, code = None, 0
                reasons[type(e).__name__] += 1
            now = _now()
            if code == 200 and r is not None:
                ok += 1
                streak = 0
                codes = {s["crn"]: s.get("code", "") for s in daily.get("rows", {}).get(course, {}).get("sections", [])}
                for crn, status in parse_availability(r.content).items():
                    prev = baseline(daily, live, crn)
                    if prev and prev[0] != status:
                        live["events"].append({"term": term, "at": now, "crn": crn, "s": subj, "n": num,
                                               "code": codes.get(crn, ""), "old": prev[0], "new": status,
                                               "t": titles.get(course, "")})
                        changes += 1
                    live["sections"][crn] = [status, now]
                live["courses"][course] = now
            elif code == 404:
                live["courses"][course] = now
            else:
                if code:
                    reasons[f"HTTP {code}"] += 1
                streak += 1
                if streak >= 5:  # being pushed back: stop and let the next run try
                    reasons["stopped early"] += 1
                    break
                sleep(15)
            sleep(interval)
    finally:
        if own:
            http.close()
    return f"{term}: {ok} of {len(courses)} busy courses re-read, {changes} changes, issues {dict(reasons)}"


def prune(state: dict, now: str) -> None:
    cutoff = (datetime.fromisoformat(now) - timedelta(hours=WINDOW_HOURS)).isoformat(timespec="seconds")
    for t in state["terms"].values():
        t["events"] = [e for e in t["events"] if e["at"] >= cutoff][-3000:]
        t["courses"] = {c: at for c, at in t["courses"].items() if at >= cutoff}
        keep = {e["crn"] for e in t["events"]}
        t["sections"] = {crn: v for crn, v in t["sections"].items() if v[1] >= cutoff or crn in keep}


def public_view(state: dict, now: str) -> dict:
    """The small file the page polls: recent events plus the latest status of every CRN in them."""
    events = sorted((e for t in state["terms"].values() for e in t["events"]), key=lambda e: e["at"], reverse=True)
    seen = {term: {e["crn"]: t["sections"][e["crn"]] for e in t["events"] if e["crn"] in t["sections"]}
            for term, t in state["terms"].items()}
    return {"updated": now, "window_hours": WINDOW_HOURS,
            "checked": {term: len(t["courses"]) for term, t in state["terms"].items()},
            "events": events, "seen": seen}


def main(argv: list[str] | None = None) -> int:
    from .fetch import NEXT_TERM

    ap = argparse.ArgumentParser(description="Re-read the busiest courses and publish seat changes")
    ap.add_argument("--terms", default=NEXT_TERM)
    ap.add_argument("--state", type=Path, required=True, help="state.json from the previous run (may not exist)")
    ap.add_argument("--out", type=Path, required=True, help="directory to write live.json and state.json to")
    ap.add_argument("--minutes", type=float, default=6)
    ap.add_argument("--interval", type=float, default=1.5)
    ap.add_argument("--limit", type=int, default=400, help="busy courses considered per run")
    args = ap.parse_args(argv)
    state = load_state(args.state)
    end = time.monotonic() + args.minutes * 60
    terms = [t.strip() for t in args.terms.split(",") if t.strip()]
    for k, term in enumerate(terms):
        daily = load_file(term)
        if not daily["rows"]:
            print(f"{term}: no daily availability file, skipped", flush=True)
            continue
        live = term_state(state, term)
        titles = {c: p.get("title", "") for c, p in daily["rows"].items()}
        courses = hot_courses(daily, live, _now(), args.limit)
        share = (end - time.monotonic()) / (len(terms) - k)
        print(check(term, courses, daily, live, titles, time.monotonic() + share, args.interval), flush=True)
    now = _now()
    prune(state, now)
    state["updated"] = now
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "state.json").write_text(json.dumps(state, separators=(",", ":")))
    (args.out / "live.json").write_text(json.dumps(public_view(state, now), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
