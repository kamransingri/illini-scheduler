# Illini Scheduler

An unofficial course planner for University of Illinois Urbana-Champaign students. For any course it puts what you
check before registering on one page (professors side by side by GPA and ratings, sections, seats, when it's offered),
then builds a conflict-free week from your courses and hands you the CRNs.

**Live site:** https://kamransingri.github.io/illini-scheduler/ (rebuilt nightly at 09:00 UTC; seats in busy courses
re-checked about every 10 minutes).

> **Disclaimer.** Unofficial and not affiliated with the University of Illinois. Data comes from public sources and
> can be out of date. Always confirm sections, seats and restrictions in Self-Service before registering.

```bash
pip install -r requirements.txt && (cd web && npm ci)
make data      # ~25 s: download sources, build data/illini.db, export web/public/data
make build     # ~35 s: static export of ~7,100 course pages to web/out
make serve     # http://localhost:4173
```

## The pages

| Page | What it answers |
| --- | --- |
| **Course search** (`/`) | Find a course by code in any spelling (`cs124`, `CS 124`), title, nickname (`calc 2`), professor or **CRN** (a CRN opens the course page on that exact section). The home page also shows what just opened and where you left off. |
| **Course page** (`/course/CS/124/`) | One row per professor teaching the term: GPA in this course and how far above or below the course average they grade, grade distribution, RMP quality / difficulty / would-take-again with rating counts, Teachers Ranked as Excellent, lectures taught and how many are open. A row opens to that professor's sections, reviews, tags and exam notes; "Compare" shows a sortable table. Then sections (CRN to copy, times, rooms, seat status, final exam, links to live seats and Self-Service), the offering pattern and next-term prediction, course GPA over time and what changed. |
| **Gen-ed finder** (`/geneds/`) | Courses that count for every gen-ed category you pick, ranked by the best pick score (or GPA, % A, RMP, open lectures). Only courses with an open section show unless you turn that off. Marks which courses fit the start time, end time and days off set in the schedule builder, and can hide the rest. |
| **Degree checklist** (`/degree/`) | Your finished, transfer and in-progress courses checked against any of the 171 undergraduate programs in the 2026-2027 catalog (find yours by typing part of its name, an acronym such as CS or MCB, or its college); each requirement shows as done, in progress, partly done or open, with the best options for what's left. Add your AP and IB exams and scores and it fills in the courses they're expected to give, from CITL's tables for the year you started. Kept in your browser and the link, never on a server. |
| **Summer courses** (`/summer/`) | Classes you can take over the summer, filtered by gen-ed, session (Session I, Session II, full summer...), online or on campus, and whether they ran every recent summer. Until Course Explorer publishes the coming summer (around March), it shows last summer's classes and says so. |
| **Just opened** (`/opened/`) | Sections that just went from closed to open, newest first, updated while the page is open: when it was found, whether it's still open, the CRN to copy, a button that adds that exact section to your schedule, and an optional browser notification. |
| **Schedule builder** (`/schedule/`) | Every conflict-free combination of your courses (lecture plus its linked discussion or lab), ranked by what you care about. **Must-haves** are never broken: earliest start, latest end, days off, a lunch break, open sections only, special sections, blocked times. **What matters to you** ranks the rest: expected GPA, professor ratings, open sections, days off, gaps, early or late classes (you pick the times) and rushed walks, from Off to High, with one-click presets. Weekly calendar, a table comparing the top schedules, CRN copy, `.ics` download, share links and final-exam clash warnings. |

**Best pick score.** One score per professor and course from course GPA, the professor's GPA difference, RMP and open
seats, with small samples pulled toward an average and a breakdown behind every score. Students set the weights.
Formula: [docs/DECISIONS.md](docs/DECISIONS.md) D13.18.

## Data sources

| Source | Used for | Coverage in this build |
| --- | --- | --- |
| [Course Explorer API](https://courses.illinois.edu/cisdocs/explorer) (public XML) and course pages | Sections, meeting times, instructors, descriptions, gen-ed attributes, seat status, final exams | History from Wade Fagen-Ulmschneider's mirror ([wadefagen/datasets `course-catalog/`](https://github.com/wadefagen/datasets/tree/main/course-catalog)), Fall 2022 to Spring 2027 (14 terms). The current and next term are read from the live course pages by the availability jobs |
| [UIUC GPA dataset](https://github.com/wadefagen/datasets/tree/main/gpa) | Course and instructor GPA, grade distributions | Fall 2015 to Summer 2026. "Recent" = Fall 2022 to Spring 2026 |
| [Gen-ed list](https://github.com/wadefagen/datasets/tree/main/geneds) | Gen-ed categories | Spring 2027 |
| [Teachers Ranked as Excellent](https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent) | Instructor badges | Fall 2020 to Summer 2025, instructors only |
| [Grade disparity view](https://waf.web.engr.illinois.edu/discovery/grade_disparity_between_sections_at_uiuc/) | Design reference for the instructor comparison | Recomputed from the GPA dataset |
| Rate My Professors (unofficial GraphQL) | Ratings, tags, snippets | Optional; cached 7 days; the site works without it |
| Student notes (`data/notes/*.yaml`) | Exam and grading notes | Added by a maintainer, each with a source (students review courses on Rate My Professors) |
| [Academic Catalog](https://catalog.illinois.edu/) | Degree requirements (`data/degrees/*.yaml`) | All 171 undergraduate programs, 2026-2027 |
| [CITL AP credit tables](https://citl.illinois.edu/current-cutoff-scores) | Courses each AP score gives (`data/ap-credit/*.yaml`) | Students entering 2024-2025 to 2026-2027, copied by hand |
| [CITL IB credit table](https://citl.illinois.edu/current-cutoff-scores) | Courses each IB score and level gives (`data/ib-credit/*.yaml`) | Students entering 2026-2027, checked by hand |

Self-Service (Banner) needs a NetID and is never scraped: the site only links to it and copies CRNs. Seat counts and
waitlists live only there, so the site knows open / restricted / closed, not how many seats are left.

## How it works

```
Course Explorer ─┐                                                                  ┌─> GitHub Pages (static site)
Wade's datasets ─┼─> Python pipeline ─> data/illini.db ─> web/public/data/*.json ─> Next.js static export
Rate My Prof.  ──┘    (pipeline/)          (SQLite)          (pipeline/export.py)
Course Explorer ───> pipeline/live_seats.py every ~10 min ─> live.json on the `live-seats` branch ─> "Just opened"
```

- `pipeline/` (Python 3.11+, pandas, httpx, lxml): `course_explorer.py` (ingest + linked sections), `gpa.py`,
  `names.py` (one instructor identity across sources), `rmp.py`, `instructors.py`, `offerings.py` (patterns +
  changes), `exam_format.py`, `availability.py` (daily seat status, section rows and final exams from the Course
  Explorer pages), `live_seats.py` (re-checks the busiest courses between builds), `degrees.py` and
  `catalog_import.py` (degree requirements), `export.py`. `python -m pipeline.run --help` lists the options
  (`--subjects CS,STAT`, `--source api|csv|auto`, `--no-rmp`, `--fixtures` for a fully offline build).
- `web/` (Next.js 15 App Router, TypeScript, Tailwind 4): every course page is pre-rendered; details load from the
  per-course JSON. The schedule generator (`web/lib/schedule.ts`) is an exact branch-and-bound search that runs in the
  browser. Design tokens and shared components: [docs/DESIGN.md](docs/DESIGN.md).
- Search by CRN loads `data/crns.json` (every section of the current and next term) only once someone types digits.
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
| `PAGES_LIMIT=50 make build` | Quick build with only 50 course pages (plus the reference courses) |
| `make e2e` | Playwright against the static build (`npx playwright test --workers=1` on a laptop) |
| `python -m pipeline.availability --minutes 30` | The daily seat crawl, by hand |
| `python -m pipeline.live_seats --state s.json --out out/ --minutes 2` | One round of the live seat check, by hand (reads the watch list, `data/watch.txt`) |
| `python -m pipeline.degrees` | Validate `data/degrees/*.yaml` and list course codes the loaded data doesn't know |
| `python -m pipeline.catalog_import` | Import every undergraduate program's requirements from the Academic Catalog |
| `python -m pipeline.ap_credit` | Validate `data/ap-credit/*.yaml` and `data/ib-credit/*.yaml` (CITL's AP and IB credit tables) and list credited codes the loaded data doesn't know |
| `python -m pipeline.summer` | What the Summer courses page would show from the loaded data |
| `python -m pipeline.names --report [--subjects CS,MATH,STAT]` | How many of next term's instructors link to their grade history, per subject, and the lecture names that don't |
| `python -m pipeline.renumbered [--suggest]` | Check `data/renumbered.csv` (old course number → new), or list candidate links from Course Explorer text to review |
| `make version` | Check that the version files agree and CHANGELOG.md covers the version |
| `make release V=minor` | Next version (`major`, `minor`, `patch` or `0.6.0-beta.1`) in every version file, and Unreleased in CHANGELOG.md becomes that version |

## How refresh works

| Workflow | When | What |
| --- | --- | --- |
| `pages.yml` | Every push to `main`, nightly 09:00 UTC, manual | `make data`, lint, type checks, unit tests, static build with the right `BASE_PATH`, Playwright against the build, then deploys `web/out`. Commits the refreshed data summaries only if everything passed |
| `availability.yml` | Daily 04:17 UTC | Reads every course page of the next and current term (~1 request per second, oldest first) for seat status, section rows and final exams; commits `data/availability/*.json` for the nightly build |
| `live-seats.yml` | Every 10 minutes (every 30 overnight) | Re-reads the busiest next-term courses and those on `data/watch.txt` for ~6 minutes and force-pushes `live.json` to the single-commit `live-seats` branch; the Just opened page and the home page poll it |
| `term-watch.yml` | Mondays | Checks whether Course Explorer has published a term after `NEXT_TERM` (`python -m pipeline.term_watch`) and opens one issue with the rollover checklist (#33) |
| `ci.yml` | Every push and pull request | Lint and unit tests (`test`); version files, changelog and branch name (`versions`) |
| `release.yml` | A new version reaching `main` | Tags that commit `vX.Y.Z` and publishes the GitHub release from CHANGELOG.md |
| `branch-cleanup.yml` | A pull request merged, manual | Deletes the merged branch; a manual run deletes older merged branches |
| `fetch-data.yml` | Manual | Fallback that refreshes `fixtures/` from the live sources |

## Degree requirement data

Each program is one YAML file in `data/degrees/`, copied from its Academic Catalog page for one catalog year, imported
by `python -m pipeline.catalog_import` (rules from the catalog's tables; anything written in prose stays a `manual`
requirement in the catalog's own words). To check a program by hand, edit its file and delete its `generated:` line:
the importer never overwrites a file without one. Format and workflow: [docs/DEGREE-DATA.md](docs/DEGREE-DATA.md).

AP credit is one file per entering year in `data/ap-credit/`, copied by hand from CITL's table, with every correction to
the page noted in the file; IB credit is the same in `data/ib-credit/`. Format, sources and the corrections: [docs/AP-CREDIT.md](docs/AP-CREDIT.md).

## Branches, versions and releases

Work happens on `type/short-name` branches (`feature/`, `fix/`, `docs/`, `chore/`, `data/`, `hotfix/`, `release/`)
merged into `main` through pull requests; `main` is what's live. One version for the whole repo, changed only with
`make release`; merging a new version tags it and publishes its release notes from [CHANGELOG.md](CHANGELOG.md).
Details: [CONTRIBUTING.md](CONTRIBUTING.md).

## More docs

Everything else is in [`docs/`](docs/README.md): what the site can't do yet, every judgment call, the design system,
the degree and AP credit data formats and before/after screenshots. What we'd like to build next (student reviews,
Reddit feedback, seat alerts, better degree planning) is tracked in [GitHub issues](https://github.com/kamransingri/illini-scheduler/issues).
