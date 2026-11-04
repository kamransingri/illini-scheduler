# Illini Scheduler

**Live site:** `https://<owner>.github.io/illini-scheduler/` once the public repo is pushed and Pages is enabled (see PROGRESS.md "Needs a human").
**Run it locally:**

```bash
pip install -r requirements.txt && (cd web && npm ci)
make data      # ~25 s: download sources, build data/illini.db, export web/public/data
make build     # ~35 s: static export of ~7,000 pages to web/out
make serve     # http://localhost:4173
```

An unofficial planner for University of Illinois Urbana-Champaign students. For any course and term it answers what
students check before registering, on one page:

- **Sections**: CRN (click to copy), type, days/times, location, instructor, seat status with the time it was
  checked, a "Check live seats" link per section and a "Register in Self-Service" link.
- **When it's offered**: pattern over the last 8 fall/spring terms + summers ("Fall only", "Spring, odd years"...) and
  a High / Medium / Low prediction for the next unpublished term, with the reason.
- **Course GPA**: recent and all-time average, A/B/C/D-F/W distribution, and a per-term chart.
- **Instructor GPA**: per instructor for that course, and how far above or below the course average they grade
  in the same terms (grade disparity), with "limited data" flags and Teachers Ranked as Excellent badges.
- **Rate My Professors**: quality, difficulty, would-take-again, top tags and short snippets when available,
  always with a link to RMP.
- **What changed**: description, credit hours, prerequisites, gen-ed codes, delivery mode and new instructors,
  term by term.
- **Exam and grading format** per instructor (midterms, final, CBTF, curve, attendance, homework platform,
  projects, textbook), only where a source quote supports it.
- **Gen-ed finder** (`/geneds/`): filter by category and time, sort by GPA.
- **Schedule builder** (`/schedule/`): cart, every conflict-free combination (lecture + linked discussion/lab),
  ranked by your preferences, weekly calendar, CRN export, `.ics` download and share links.

> **Disclaimer.** Unofficial and not affiliated with the University of Illinois. Data comes from public sources and
> can be out of date. Always confirm sections, seats and restrictions in Self-Service before registering.

## Data sources

| Source | Used for | Coverage in this build |
| --- | --- | --- |
| [Course Explorer API](https://courses.illinois.edu/cisdocs/explorer) (public XML) | Sections, meeting times, instructors, status, descriptions, gen-ed attributes | Fetched directly when reachable. Otherwise it comes from Wade Fagen-Ulmschneider's mirror of the same API, [wadefagen/datasets `course-catalog/`](https://github.com/wadefagen/datasets/tree/main/course-catalog): Fall 2022 to Spring 2027 (14 terms, summers included). Spring 2027 snapshot: 2026-10-30; Fall 2026: 2026-03-25 |
| [UIUC GPA dataset](https://github.com/wadefagen/datasets/tree/main/gpa) | Course and instructor GPA, grade distributions | Fall 2015 to Summer 2026 used (dataset runs 2005 to Summer 2026). "Recent" = Fall 2022 to Spring 2026 |
| [Gen-ed list](https://github.com/wadefagen/datasets/tree/main/geneds) | Gen-ed categories | Spring 2027 |
| [Teachers Ranked as Excellent](https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent) | Instructor badges | Fall 2020 to Summer 2025, instructors only |
| [Grade disparity view](https://waf.web.engr.illinois.edu/discovery/grade_disparity_between_sections_at_uiuc/) | Design reference for the instructor comparison | — (recomputed from the GPA dataset) |
| Rate My Professors (unofficial GraphQL) | Ratings, tags, snippets | Optional; cached 7 days; the site works without it |
| Student notes (`data/notes/*.yaml`) | Exam/grading notes | Curated from "Suggest a note" GitHub issues |

Self-Service (Banner) needs a NetID and is never scraped: the app only links to it and copies CRNs.

## How it works

```
Course Explorer ─┐
Wade's datasets ─┼─> Python pipeline ─> data/illini.db ─> web/public/data/*.json ─> Next.js static export ─> GitHub Pages
Rate My Prof.  ──┘    (pipeline/)          (SQLite)          (pipeline/export.py)     (web/)
```

- `pipeline/` (Python 3.11+, pandas, httpx, lxml): `course_explorer.py` (ingest + linked sections),
  `gpa.py`, `names.py` (one instructor identity across sources), `rmp.py`, `instructors.py`, `offerings.py`
  (patterns + changes), `exam_format.py`, `export.py`. `python -m pipeline.run --help` lists the options
  (`--subjects CS,STAT`, `--source api|csv|auto`, `--no-rmp`, `--fixtures` for a fully offline build).
- `web/` (Next.js 15 App Router, TypeScript, Tailwind 4): every course page is pre-rendered; details load from the
  per-course JSON. The schedule generator (`web/lib/schedule.ts`) is an exact branch-and-bound search that runs in
  the browser.
- Unmatched instructor names are logged to `data/unmatched.csv`; fix the worst ones in `data/name_overrides.csv`.

## Commands

| Command | What it does |
| --- | --- |
| `make data` | Full pipeline (all subjects, 14 terms) |
| `make data-quick` | Only CS, MATH, STAT, RHET |
| `make test` | pytest (pipeline) + Vitest (web logic) |
| `make lint` | ruff, mypy, ESLint, tsc |
| `make dev` | Next.js dev server on :3000 |
| `make build` / `make serve` | Static export to `web/out`, served on :4173 |
| `make e2e` | Playwright against the static build |
| `PAGES_LIMIT=50 make build` | Quick build with only 50 course pages (plus the reference courses) |

## How refresh works

`.github/workflows/pages.yml` runs on every push to `main`, nightly at 09:00 UTC and on manual trigger. It sets up
Python and Node, runs `make data` (GitHub runners can reach Course Explorer and RMP), lint, type checks and all
tests, builds with the right `BASE_PATH`, runs Playwright against the build, commits the refreshed data summaries
(`data/unmatched.csv`, `data/snapshot/meta.json`) only if everything passed, and deploys `web/out` with
`actions/deploy-pages`. `.github/workflows/ci.yml` runs lint + unit tests on every push.
`.github/workflows/fetch-data.yml` is a manual fallback for refreshing fixtures from the live sources.

See `DECISIONS.md` for every judgment call and `PROGRESS.md` for what was verified and how.
