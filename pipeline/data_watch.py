"""Quarterly check of every data source (issue #71): how old each one is, what needs a look, and the review checklist.

Some data refreshes itself every night (Course Explorer, Wade's datasets, RMP); some changes only when someone edits a
file (AP and IB credit, degree requirements, term dates). Wade's GPA dataset gets a semester's grades some weeks or
months after it ends, and the site picks the new file up the next night on its own. This reads what students actually
see (the live site's data/meta.json), when Wade last changed each of his files (GitHub API, one request a file) and the
hand-kept files in this repo, and writes a table with a status per source. data-check.yml runs it on the 10th of
January, April, July and October and opens one issue; nothing is changed here.

    python -m pipeline.data_watch                       # print the table
    python -m pipeline.data_watch --issue F --title T   # also write the issue body (Markdown) and title
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx

from .config import ROOT, USER_AGENT
from .course_explorer import term_label

LIVE_SITE = "https://kamransingri.github.io/illini-scheduler/"
WADE_REPO = "wadefagen/datasets"
WADE_FILES = {
    "gpa": "gpa/uiuc-gpa-dataset.csv",
    "geneds": "geneds/gened-courses.csv",
    "tre": "teachers-ranked-as-excellent/uiuc-tre-dataset.csv",
}
SEASONS = ["sp", "su", "fa"]  # winter terms aren't in the GPA dataset's way: they're skipped

OK, WAITING, CHECK = "OK", "Waiting", "Check"


@dataclass
class Row:
    source: str
    refresh: str
    now: str
    status: str
    note: str = ""


def terms_behind(newest: str, current: str) -> int:
    """Spring, summer and fall terms after `newest` and before `current` ('2026-su', '2027-sp' -> 1: Fall 2026)."""
    def idx(t: str) -> int:
        y, s = t.split("-")
        return int(y) * 3 + SEASONS.index(s)
    return max(0, idx(current) - idx(newest) - 1)


def academic_year(today: date) -> str:
    """The academic year a date falls in: it starts in August ('2026-11-19' -> '2026-2027')."""
    y = today.year if today.month >= 8 else today.year - 1
    return f"{y}-{y + 1}"


def _day(iso: str | None) -> date | None:
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(UTC).date()


def _age(iso: str | None, today: date) -> int | None:
    d = _day(iso)
    return (today - d).days if d else None


def gpa_row(meta: dict[str, Any], upstream: str | None, today: date) -> Row:
    """Wade's GPA dataset. One semester behind is normal for a few months; two, or a file Wade changed that the live
    site doesn't have yet, needs a look."""
    gpa = meta.get("gpa") or {}
    newest = (gpa.get("window") or ["", ""])[1]
    snap = gpa.get("snapshot")
    refresh = "downloaded nightly; a new semester appears once Wade publishes it"
    if not newest:
        return Row("Wade's GPA dataset", refresh, "missing", CHECK, "the live site has no GPA window")
    now = f"through {term_label(newest)} (file changed {_day(snap)})"
    up, have = _day(upstream), _day(snap)
    if up and have and (up - have).days > 2:
        return Row("Wade's GPA dataset", refresh, now, CHECK,
                   f"Wade changed the file on {up}, but the live site still has the copy from {have}: "
                   "check the nightly job")
    behind = terms_behind(newest, meta["current_term"])
    if behind == 0:
        return Row("Wade's GPA dataset", refresh, now, OK)
    if behind == 1 and (_age(snap, today) or 0) < 270:
        return Row("Wade's GPA dataset", refresh, now, WAITING,
                   "one semester behind the current term: Wade adds a semester some weeks or months after it ends")
    return Row("Wade's GPA dataset", refresh, now, CHECK,
               f"{behind} semesters behind {term_label(meta['current_term'])}: has Wade published newer grades?")


def wade_file_row(name: str, refresh: str, changed: str | None, today: date, max_days: int) -> Row:
    """A Wade file judged only by when it last changed."""
    age = _age(changed, today)
    if age is None:
        return Row(name, refresh, "date unknown", CHECK, "couldn't read when the file last changed")
    status = OK if age <= max_days else CHECK
    note = "" if status == OK else f"unchanged for {age} days: has Wade stopped updating it?"
    return Row(name, refresh, f"file changed {_day(changed)}", status, note)


def build_row(meta: dict[str, Any], today: date) -> Row:
    age = _age(meta.get("built_at"), today)
    ok = age is not None and age <= 2
    return Row("Site build", "nightly at 09:00 UTC", f"built {_day(meta.get('built_at'))}", OK if ok else CHECK,
               "" if ok else "the nightly build hasn't deployed for days")


def course_explorer_row(meta: dict[str, Any], today: date) -> Row:
    checked = [(t, v.get("checked_at")) for t, v in (meta.get("terms") or {}).items()]
    oldest = min((c for _, c in checked if c), default=None)
    age = _age(oldest, today)
    ok = age is not None and age <= 3
    return Row("Course Explorer sections and seats", "nightly; busy courses every 10 minutes",
               f"{', '.join(term_label(t) for t, _ in checked)}, checked {_day(oldest)}", OK if ok else CHECK,
               "" if ok else "sections haven't been re-read for days")


def rmp_row(meta: dict[str, Any]) -> Row:
    rmp = meta.get("rmp_status", "")
    return Row("RateMyProfessors", "nightly, answers cached 7 days", rmp or "unknown", OK if rmp == "ok" else CHECK,
               "" if rmp == "ok" else "RMP couldn't be read in the last build")


def terms_row(meta: dict[str, Any]) -> Row:
    return Row("Current and next term", "by hand; term-watch.yml checks weekly (#33)",
               f"{term_label(meta['current_term'])}, {term_label(meta['next_term'])}", OK)


def yearly_row(name: str, refresh: str, years: list[str], today: date, extra: str = "") -> Row:
    """A table kept per academic year (AP, IB, the catalog). Next year's usually comes out in spring or summer."""
    if not years:
        return Row(name, refresh, "none", CHECK, "no file found")
    newest, ay = max(years), academic_year(today)
    now = f"{newest}{extra}"
    if newest < ay:
        return Row(name, refresh, now, CHECK, f"older than the current academic year ({ay})")
    if newest == ay and 4 <= today.month <= 7:
        return Row(name, refresh, now, WAITING, f"the {int(ay[:4]) + 1}-{int(ay[:4]) + 2} edition usually comes out in "
                   "spring or summer")
    return Row(name, refresh, now, OK)


def repo_rows(repo: Path, meta: dict[str, Any], today: date) -> list[Row]:
    """Hand-kept data in this repository."""
    data = repo / "data"
    ap = [p.stem for p in (data / "ap-credit").glob("*.yaml")]
    ib = [p.stem for p in (data / "ib-credit").glob("*.yaml")]
    years, hand = [], 0
    for p in (data / "degrees").glob("*.yaml"):
        text = p.read_text(encoding="utf-8")
        m = re.search(r"^catalog_year:\s*'?(\d{4}-\d{4})", text, re.M)
        if m:
            years.append(m.group(1))
        hand += not re.search(r"^generated:", text, re.M)
    rows = [
        yearly_row("AP credit", "by hand; citl-watch.yml checks CITL weekly", ap, today),
        yearly_row("IB credit", "by hand; citl-watch.yml checks CITL weekly", ib, today),
        yearly_row("Degree requirements", "by hand: catalog importer plus hand-checked majors (#17)",
                   sorted(set(years)), today, f" catalog, {len(years)} programs ({hand} checked by hand)"),
    ]
    if len(set(years)) > 1:
        rows[-1].status, rows[-1].note = CHECK, f"programs from more than one catalog: {', '.join(sorted(set(years)))}"
    rows.append(term_dates_row((repo / "web" / "lib" / "terms.ts").read_text(encoding="utf-8"), meta))
    return rows


def term_dates_row(terms_ts: str, meta: dict[str, Any]) -> Row:
    """The .ics term dates for the current and next term, and whether they're still estimated."""
    entry = re.compile(r'^  "(\d{4}-(?:sp|su|fa|wi))": \{(.*?)^  \},', re.M | re.S)
    dated = {m.group(1): m.group(2) for m in entry.finditer(terms_ts)}
    want = [meta["current_term"], meta["next_term"]]
    missing = [t for t in want if t not in dated]
    estimated = [t for t in want if t in dated and re.search(r"estimated:\s*true", dated[t])]
    note = ""
    if missing:
        note = f"no dates for {', '.join(term_label(t) for t in missing)}"
    elif estimated:
        note = f"{', '.join(term_label(t) for t in estimated)} dates are estimated: has the Registrar published them?"
    return Row("Term dates (web/lib/terms.ts)", "by hand from the Registrar's calendar (#28)",
               ", ".join(term_label(t) for t in want if t in dated) or "none",
               CHECK if missing else WAITING if estimated else OK, note)


def collect(client: Any, repo: Path, today: date, token: str | None = None) -> list[Row]:
    meta = client.get(f"{LIVE_SITE}data/meta.json").raise_for_status().json()
    changed = {k: last_change(client, rel, token) for k, rel in WADE_FILES.items()}
    return [
        build_row(meta, today),
        course_explorer_row(meta, today),
        gpa_row(meta, changed["gpa"], today),
        wade_file_row("Wade's gen-ed list", "downloaded nightly", changed["geneds"] or meta.get("geneds_snapshot"),
                      today, 270),
        wade_file_row("Wade's Teachers Ranked as Excellent list", "downloaded nightly", changed["tre"], today, 400),
        rmp_row(meta),
        terms_row(meta),
        *repo_rows(repo, meta, today),
    ]


def last_change(client: Any, rel: str, token: str | None = None) -> str | None:
    """When Wade last changed a file (its newest commit), or None if GitHub can't say. The token goes only to the
    GitHub API (a higher rate limit in Actions), never to the live site."""
    headers = {"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})}
    try:
        r = client.get(f"https://api.github.com/repos/{WADE_REPO}/commits", params={"path": rel, "per_page": 1},
                       headers=headers)
        r.raise_for_status()
        commits = r.json()
        return str(commits[0]["commit"]["committer"]["date"]) if commits else None
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        print(f"warn: couldn't read when {rel} last changed ({e})", file=sys.stderr)
        return None


def issue_title(today: date) -> str:
    return f"Data check: {today:%B %Y}"


CHECKLIST = [
    "Spot-check three courses against Course Explorer: sections, times, instructors (#34)",
    "If Wade added a semester: `python -m pipeline.names --report`, and the instructor match rate didn't drop",
    "Term dates for the next term in `web/lib/terms.ts`, from the Registrar's academic calendar (#28)",
    "AP and IB tables: is a newer year out on CITL's cutoff tool? (citl-watch.yml should have opened an issue)",
    "Degree requirements: a newer catalog year? Re-run `python -m pipeline.catalog_import` (hand-checked files are "
    "kept) and look over the hand-checked majors (#17)",
    "`data/renumbered.csv` (`python -m pipeline.renumbered --suggest`), `data/name_overrides.csv` and "
    "`data/watch.txt`: drop what's over, add what's new",
    "Close this issue with a line on what changed",
]


def issue_body(rows: list[Row], today: date) -> str:
    flagged = [r for r in rows if r.status != OK]
    lines = [
        f"Quarterly data check for {today:%B %Y}, by `python -m pipeline.data_watch` (data-check.yml, #71). It reads "
        f"the live site's [`data/meta.json`]({LIVE_SITE}data/meta.json), when Wade last changed each file, and the "
        "hand-kept files in the repo.",
        "",
        "| Source | How it's refreshed | Now | Status |",
        "|---|---|---|---|",
    ]
    lines += [f"| {r.source} | {r.refresh} | {r.now} | {'**Check**' if r.status == CHECK else r.status} |"
              for r in rows]
    if flagged:
        lines += ["", "### Needs a look", "", *[f"- **{r.source}** ({r.status.lower()}): {r.note}" for r in flagged]]
    else:
        lines += ["", "Nothing is flagged."]
    lines += ["", "### Every quarter", "", *[f"- [ ] {c}" for c in CHECKLIST]]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="How old is each data source the site uses?")
    ap.add_argument("--issue", help="write the issue body (Markdown) here")
    ap.add_argument("--title", help="write the issue title here")
    args = ap.parse_args(argv)
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    today = datetime.now(UTC).date()
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True) as client:
        rows = collect(client, ROOT, today, token)
    for r in rows:
        print(f"{r.status:8} {r.source}: {r.now}{f'  ({r.note})' if r.note else ''}")
    if args.issue:
        Path(args.issue).write_text(issue_body(rows, today), encoding="utf-8")
    if args.title:
        Path(args.title).write_text(issue_title(today), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
