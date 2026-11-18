"""Save real Course Explorer and RMP responses into fixtures/ for the tests (fixtures/README.md says what and when).

    python -m pipeline.fetch_fixtures

Course Explorer: the next term's schedule index and, for each reference course, its cascade XML from the next term,
or from this term when it isn't offered next (MATH 221 is fall only). RMP: the school search and the teacher searches
for "Challen" and "Lewis" (CS 124's instructors; "Lewis" also returns Lewises in other departments), as RMP sent them.
Also run by .github/workflows/fetch-data.yml on GitHub's runners.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import httpx

from .config import FIXTURES, RAW, REFERENCE_COURSES, USER_AGENT
from .course_explorer import ApiCrawler, term_parts
from .fetch import CURRENT_TERM, NEXT_TERM
from .rmp import SCHOOL_NAME, SCHOOL_QUERY, TEACHER_QUERY, RmpClient

RMP_SEARCHES = ("Challen", "Lewis")


async def _course_explorer() -> list[str]:
    crawler = ApiCrawler(cache_dir=RAW / "cis", refresh=True)
    out_dir = FIXTURES / "course-explorer"
    written = []
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        year, season = term_parts(NEXT_TERM)
        p = out_dir / f"schedule_{year}_{season}.xml"
        p.write_bytes(await crawler.get(client, f"schedule/{year}/{season}.xml"))
        written.append(p.name)
        for subj, num in REFERENCE_COURSES:
            for term in (NEXT_TERM, CURRENT_TERM):
                year, season = term_parts(term)
                try:
                    data = await crawler.get(client, f"schedule/{year}/{season}/{subj}/{num}.xml?mode=cascade")
                except FileNotFoundError:
                    continue  # not offered that term
                p = out_dir / f"{term}_{subj}{num}_cascade.xml"
                p.write_bytes(data)
                written.append(p.name)
                break
    return written


def _rmp() -> list[str]:
    client = RmpClient(RAW / "rmp")
    out_dir = FIXTURES / "rmp"
    school = client._post(SCHOOL_QUERY, {"query": {"text": SCHOOL_NAME}})
    (out_dir / "school_search.json").write_text(json.dumps(school, indent=1) + "\n", encoding="utf-8")
    written = ["school_search.json"]
    school_id = client.find_school()
    for text in RMP_SEARCHES:
        data = client._post(TEACHER_QUERY, {"query": {"text": text, "schoolID": school_id}})
        name = f"teacher_search_{text.lower()}.json"
        (out_dir / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(name)
    return written


def main() -> None:
    for name in asyncio.run(_course_explorer()) + _rmp():
        print(name)
    print(f"fetched {datetime.now(UTC).date().isoformat()}: note the date in fixtures/README.md")


if __name__ == "__main__":
    main()
