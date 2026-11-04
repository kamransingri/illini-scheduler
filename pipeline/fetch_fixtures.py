"""Save real Course Explorer XML for the reference courses (and RMP samples) into fixtures/.

Used by .github/workflows/fetch-data.yml on GitHub runners, which can reach hosts the build session couldn't.
Real files are written next to the HANDMADE ones as REAL_*.xml / REAL_*.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json

import httpx

from .config import FIXTURES, RAW, REFERENCE_COURSES, USER_AGENT
from .course_explorer import ApiCrawler, term_parts
from .fetch import CURRENT_TERM, NEXT_TERM
from .rmp import RmpClient, RmpUnavailable


async def _xml(subjects: set[str] | None) -> list[str]:
    crawler = ApiCrawler(cache_dir=RAW / "cis", refresh=True)
    out = []
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        for term in (CURRENT_TERM, NEXT_TERM):
            year, season = term_parts(term)
            out_dir = FIXTURES / "course-explorer"
            data = await crawler.get(client, f"schedule/{year}/{season}.xml")
            (out_dir / f"REAL_schedule_{year}_{season}.xml").write_bytes(data)
            for subj, num in REFERENCE_COURSES:
                if subjects and subj not in subjects:
                    continue
                try:
                    data = await crawler.get(client, f"schedule/{year}/{season}/{subj}/{num}.xml?mode=cascade")
                except FileNotFoundError:
                    continue  # not offered that term (e.g. MATH 221 in spring)
                p = out_dir / f"REAL_{term}_{subj}{num}_cascade.xml"
                p.write_bytes(data)
                out.append(str(p))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subjects", default="CS,MATH,STAT,RHET")
    args = ap.parse_args()
    subjects = None if args.subjects == "all" else {s.strip().upper() for s in args.subjects.split(",")}
    for p in asyncio.run(_xml(subjects)):
        print(p)
    client = RmpClient(RAW / "rmp")
    try:
        client.find_school()
        for name, subj in [("Challen, G", "CS"), ("Lewis, C", "CS")]:
            t = client.lookup(name, subj)
            if t:
                (FIXTURES / "rmp" / f"REAL_{t.last_name.lower()}.json").write_text(json.dumps(t.__dict__, indent=1))
    except RmpUnavailable as e:
        print(f"RMP unavailable: {e}")


if __name__ == "__main__":
    main()
