"""Weekly check for a Course Explorer term after NEXT_TERM, so the term rollover isn't missed (issue #33).

The current and next term are set by hand in pipeline/fetch.py. Course Explorer publishes the next fall around March and
the next spring around October; until someone bumps the terms, the site keeps showing the old pair. This reads the two
newest calendar years from Course Explorer's schedule index and, for each term after NEXT_TERM, the term's own page.
The index lists terms months before they're published (in November 2026 it already had Summer and Fall 2027, whose
pages were 404), so a term counts only once its page lists subjects. At most five small requests. When there is one,
it writes an issue body with the rollover checklist; term-watch.yml opens the issue, and nothing is changed here.

    python -m pipeline.term_watch               # exit 0: nothing newer; exit 10: a newer term is listed
    python -m pipeline.term_watch --issue F     also write the issue body (Markdown) to F when there is one
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

import httpx

from .config import CIS_BASE, USER_AGENT
from .course_explorer import SEASON_CODE, parse_index_xml, term_label, term_parts, term_sort_key

CHANGED = 10


def get(client: Any, url: str, tries: int = 3, wait: float = 20) -> bytes | None:
    """GET with a few patient retries: Course Explorer answers HTTP 202 while it builds a page (D10.3). None = 404."""
    for i in range(tries):
        r = client.get(url)
        if r.status_code == 200:
            return bytes(r.content)
        if r.status_code == 404:
            return None
        if i < tries - 1:
            time.sleep(wait)
    raise RuntimeError(f"{url}: HTTP {r.status_code} after {tries} tries")


def _need(data: bytes | None, url: str) -> bytes:
    if data is None:
        raise RuntimeError(f"{url}: HTTP 404")
    return data


def listed_terms(client: Any, years: int = 2, wait: float = 20) -> list[str]:
    """Terms in Course Explorer's newest `years` calendar years, oldest first ("2027-sp", "2027-su", "2027-fa")."""
    url = f"{CIS_BASE}/schedule.xml"
    index = parse_index_xml(_need(get(client, url, wait=wait), url), "calendarYear")
    newest = sorted({int(label) for _, label in index if label.strip().isdigit()})[-years:]
    terms: set[str] = set()
    for year in newest:
        url = f"{CIS_BASE}/schedule/{year}.xml"
        for _, label in parse_index_xml(_need(get(client, url, wait=wait), url), "term"):
            season = label.split()[0].lower()
            if season in SEASON_CODE:
                terms.add(f"{year}-{SEASON_CODE[season]}")
    return sorted(terms, key=term_sort_key)


def newer_than(terms: list[str], next_term: str) -> list[str]:
    return [t for t in terms if term_sort_key(t) > term_sort_key(next_term)]


def is_published(client: Any, term: str, wait: float = 20) -> bool:
    """The term's own page exists and lists at least one subject."""
    year, season = term_parts(term)
    data = get(client, f"{CIS_BASE}/schedule/{year}/{season}.xml", wait=wait)
    return bool(data and parse_index_xml(data, "subject"))


def new_terms(client: Any, next_term: str, wait: float = 20) -> tuple[list[str], list[str]]:
    """(published terms after `next_term`, terms the index lists after it)."""
    listed = newer_than(listed_terms(client, wait=wait), next_term)
    return [t for t in listed if is_published(client, t, wait)], listed


def issue_title(new: list[str]) -> str:
    return f"Course Explorer lists a new term: {term_label(new[-1])}"


def issue_body(new: list[str], current_term: str, next_term: str) -> str:
    regular = [t for t in new if t.endswith(("-fa", "-sp"))]
    lines = [
        f"Course Explorer now lists **{', '.join(term_label(t) for t in new)}**, after the site's next term "
        f"({term_label(next_term)}). Found by `python -m pipeline.term_watch` (term-watch.yml); see #33.",
        "",
    ]
    if regular:
        nxt = regular[0]
        lines += [
            f"Rollover to current = {term_label(next_term)}, next = {term_label(nxt)} (now {term_label(current_term)} "
            f"and {term_label(next_term)}):",
            "",
            f"- [ ] `pipeline/fetch.py`: `CURRENT_TERM = \"{next_term}\"`, `NEXT_TERM = \"{nxt}\"`, add `\"{nxt}\"` "
            "to `HISTORY_TERMS` (and drop the oldest regular term so the window stays 8)",
            f"- [ ] `web/lib/terms.ts`: the Registrar's academic calendar for {term_label(nxt)} (#28)",
            "- [ ] The GPA dataset: pull the new release if Wade has published one",
            "- [ ] AP credit: the table for students entering next year, if CITL has published it (#23)",
            "- [ ] Degree data: the new catalog year, re-running `python -m pipeline.catalog_import` (hand-checked "
            "files are kept)",
            "- [ ] `data/watch.txt` and `data/renumbered.csv`: drop entries for terms that are over; check the new "
            "catalog for renumbered courses (`python -m pipeline.renumbered --suggest`)",
            "- [ ] Release it: `python -m tools.release bump minor`",
        ]
    else:
        lines += [
            "Only a summer or winter term is new, so there's nothing to roll over yet: the regular rollover comes "
            "with the next fall or spring term, and this check opens another issue then.",
        ]
        summers = [t for t in new if t.endswith("-su")]
        lines += [""] if summers or any(t.endswith("-wi") for t in new) else []
        lines += [f"- [ ] `pipeline/fetch.py`: add `\"{t}\"` to `HISTORY_TERMS`, so the site's summer classes show "
                  f"{term_label(t)} instead of last summer (#35)" for t in summers]
    winters = [t for t in new if t.endswith("-wi")]
    lines += [f"- [ ] `pipeline/fetch.py`: add `\"{t}\"` to `HISTORY_TERMS` and `NOT_YET_PUBLISHED_OK`, so course "
              f"pages show {term_label(t)} once Wade's dataset has it" for t in winters]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    from .fetch import CURRENT_TERM, NEXT_TERM

    ap = argparse.ArgumentParser(description="Is there a Course Explorer term after NEXT_TERM?")
    ap.add_argument("--issue", help="write an issue body (Markdown) here when there is")
    ap.add_argument("--title", help="write the issue title here when there is")
    args = ap.parse_args(argv)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20, follow_redirects=True) as client:
        new, listed = new_terms(client, NEXT_TERM)
    print(f"The site's next term is {NEXT_TERM}. Listed after it: {', '.join(listed) or 'none'}; "
          f"published: {', '.join(new) or 'none'}.")
    if not new:
        print("Nothing to roll over.")
        return 0
    print(f"Newer: {', '.join(new)}")
    if args.issue:
        with open(args.issue, "w", encoding="utf-8") as f:
            f.write(issue_body(new, CURRENT_TERM, NEXT_TERM))
    if args.title:
        with open(args.title, "w", encoding="utf-8") as f:
            f.write(issue_title(new))
    return CHANGED


if __name__ == "__main__":
    sys.exit(main())
