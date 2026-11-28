# Illini Scheduler

An unofficial course planner for University of Illinois Urbana-Champaign students. For any course it puts what you
check before registering on one page (professors side by side by GPA and ratings, sections, seats, when it's offered),
checks your degree progress, and builds a conflict-free week from your courses with the CRNs ready to paste into
Self-Service.

**Live site:** https://kamransingri.github.io/illini-scheduler/

Rebuilt every night at 09:00 UTC. Seats in the busiest courses are re-checked about every 10 minutes. What changed in
each version: [CHANGELOG.md](CHANGELOG.md), or "What's new" at the bottom of every page.

> **Disclaimer.** Unofficial and not affiliated with the University of Illinois. Data comes from public sources and
> can be out of date. Always confirm sections, seats and restrictions in Self-Service before registering.

- [What it does](#what-it-does)
- [Using the data from code or an AI app](#using-the-data-from-code-or-an-ai-app)
- [Run it locally](#run-it-locally)
- [How it works](#how-it-works)
- [Data sources](#data-sources)
- [Commands](#commands)
- [Automation](#automation)
- [Contributing](#contributing)
- [Docs](#docs)
- [Licence](#licence)

## What it does

The header has four tabs: **Course search**, **Gen-ed finder**, **Degree checklist** and **Schedule builder**. Press
`/` on any page to search.

| Page | What it answers |
| --- | --- |
| **Course search** (`/`) | Find a course by code in any spelling (`cs124`, `CS 124`), title, nickname (`calc 2`), professor or **CRN** (a CRN opens the course page on that exact section). Courses that run in summer or the coming winter session are marked, and summer and winter classes with no page here open Course Explorer. The home page also shows often-searched courses, the most-taken gen-ed courses and what just opened. |
| **Course page** (`/course/CS/124/`) | One row per professor teaching the term: GPA in this course and how far above or below the course average they grade, grade distribution, Rate My Professors quality, difficulty and would-take-again with rating counts, Teachers Ranked as Excellent, lectures taught and how many are open. A row opens to that professor's sections, reviews, tags and exam notes; "Compare" shows a sortable table. Then sections (CRN to copy, times, rooms, seat status, final exam, links to live seats and Self-Service), the offering pattern and next-term prediction, whether it runs in summer or winter session, course GPA over time and what changed. |
| **Gen-ed finder** (`/geneds/`) | Courses that count for every gen-ed category you pick, ranked by the best pick score (or GPA, % A, RMP, open lectures), across a row of terms, with a **Double-dips only** switch. Open sections only, your schedule-builder times, credit hours, minimum RMP and the score weights sit under **More filters**. Its **Summer** view lists the newest summer's classes by gen-ed, session, online or on campus, and how many recent summers they ran; its **Winter** view does the same for the coming winter session, which is one session. |
| **Degree checklist** (`/degree/`) | Your finished, transfer and in-progress courses checked against any of 317 undergraduate majors and concentrations, 127 minors and 22 LAS certificates from the 2026-2027 catalog. Each requirement shows as done, in progress, partly done or open, with the best options for what's left and a **Professor** column you can step through. Pick a track where a program has them; minors your major can't take are greyed out. Paste your transcript or DARS audit to fill in your courses. Add AP, IB, SAT and ACT scores for the credit CITL's tables give. Prerequisites are checked against your courses, **You can take next** lists what you're ready for, and a four-year plan warns about prerequisites that won't be done in time. Kept in your browser and the share link, never on a server. |
| **Schedule builder** (`/schedule/`) | Every conflict-free combination of your courses (lecture plus its linked discussion or lab), ranked by what you care about. **Must-haves** are never broken: earliest start, latest end, days off, a lunch break, open sections only, sections you can register for, blocked times, no rushed walks. Lock a section and the rest is built around it. **What matters to you** ranks the rest (expected GPA, ratings, open sections, gaps, early or late classes, walking time) with one-click presets. Weekly calendar, finals week with clash warnings, CRN copy, `.ics` download and share links. **Getting there** says when to leave and which MTD bus to take from where you live, with a map of each day. **Plans** keep up to 10 named schedules to compare. |
| **Just opened** (`/opened/`) | Sections that just went from closed to open, newest first, updated while the page is open: the CRN to copy, a button that adds that exact section to your schedule, a watch list and an optional browser notification. Linked from the home page, course pages, the schedule builder and the footer. |

Other pages: **Use it from your AI app** (`/ai/`), **Data sources** (`/data-sources/`), **What's new** (`/versions/`),
**Privacy** (`/privacy/`) and **Terms** (`/terms/`).

**Best pick score.** One score per professor and course from course GPA, the professor's GPA difference, RMP and open
seats, with small samples pulled toward an average and a breakdown behind every score. Students set the weights.
Formula: [docs/DECISIONS.md](docs/DECISIONS.md) D13.18.

## Using the data from code or an AI app

The data behind the site is public and free to reuse with credit to its sources
([docs/API.md](docs/API.md#where-the-data-comes-from)).

| Way in | What it is | Docs |
| --- | --- | --- |
| JSON files | Every file the site loads, at `https://kamransingri.github.io/illini-scheduler/data/`: search index, one file per course, gen-eds, degrees, credit tables, buildings, bus times, seat events | [docs/API.md](docs/API.md) |
| MCP server | Five tools (`term_info`, `search_courses`, `get_course`, `find_geneds`, `build_schedules`) for Claude Desktop, Claude Code and other MCP apps, started with `npx` from each release | [mcp/README.md](mcp/README.md) |
| HTTP API | The same answers at `/v1/` with an OpenAPI description and no key, plus the MCP server over HTTP at `/mcp`. Built and tested; live once the Supabase project is set up (#247) | [docs/API.md](docs/API.md#http-api), [docs/BACKEND.md](docs/BACKEND.md) |
| `llms.txt` | Points AI tools to the docs and the data | [web/public/llms.txt](web/public/llms.txt) |

## Run it locally

You need Python 3.11 or newer, Node.js 20 or newer (CI uses 22), `make` and git. On Windows, run the commands from
Git Bash or WSL.

```bash
git clone https://github.com/kamransingri/illini-scheduler
cd illini-scheduler
pip install -r requirements.txt && (cd web && npm ci) && (cd mcp && npm ci)
make data      # ~25 s: download sources, build data/illini.db, export web/public/data
make build     # ~35 s: static export of ~7,100 course pages to web/out
make serve     # http://localhost:4173
```

Faster ways to try a change:

- `make dev` runs the Next.js dev server on http://localhost:3000 against the last `make data` export.
- `make data-quick` loads only CS, MATH, STAT and RHET. `PAGES_LIMIT=50 make build` renders 50 course pages plus the
  reference courses.
- `python -m pipeline.run --fixtures` builds entirely offline from the saved data in `fixtures/`.
- `python -m pipeline.run --help` lists the other options (`--subjects CS,STAT`, `--source api|csv|auto`, `--no-rmp`,
  `--export-only`).

A full build writes about 28,600 files: pause OneDrive or Dropbox syncing first if the clone is in a synced folder.

## How it works

```
Course Explorer ─┐                                                                  ┌─> GitHub Pages (static site)
Wade's datasets ─┼─> Python pipeline ─> data/illini.db ─> web/public/data/*.json ─> ├─> MCP server (mcp/)
RMP, OSM, MTD  ──┘    (pipeline/)          (SQLite)          (pipeline/export.py)   └─> HTTP API (api/, Supabase)
Course Explorer ───> pipeline/live_seats.py every ~10 min ─> live.json on the `live-seats` branch ─> Just opened
```

- **`pipeline/`** (Python 3.11+, pandas, httpx, lxml): `course_explorer.py` (ingest and linked sections), `gpa.py`,
  `names.py` (one instructor identity across sources), `rmp.py`, `instructors.py`, `offerings.py` (patterns and
  changes), `exam_format.py`, `availability.py` (daily seat status, section rows and final exams from the Course
  Explorer pages), `live_seats.py` (re-checks the busiest courses between builds), `buildings.py` and `transit.py`
  (OpenStreetMap and MTD), `degrees.py` and `catalog_import.py` (degree requirements), `ap_credit.py`, and
  `export.py`. `run.py` runs them in order.
- **`web/`** (Next.js 15 App Router, TypeScript, Tailwind 4): every course page is pre-rendered; details load from the
  per-course JSON. The schedule generator (`web/lib/schedule.ts`) is an exact branch-and-bound search that runs in the
  browser. Design tokens and shared components: [docs/DESIGN.md](docs/DESIGN.md).
- **`mcp/`** and **`api/`** answer from the same JSON with the site's own search and ranking code from `web/lib`, so all
  three agree. The API needs no database: it reads the JSON from GitHub Pages.
- Search by CRN loads `data/crns.json` (every section of the current and next term) only once someone types digits.
- Unmatched instructor names are logged to `data/unmatched.csv`; fix the worst ones in `data/name_overrides.csv`.

| Folder | What's there |
| --- | --- |
| `pipeline/` | The data pipeline and its tests (`pipeline/tests/`) |
| `web/` | The site: `app/` pages, `components/`, `lib/` logic, `tests/unit/` Vitest and `tests/e2e/` Playwright |
| `mcp/` | The MCP server ([mcp/README.md](mcp/README.md)) |
| `api/`, `supabase/` | The HTTP API as a Supabase Edge Function ([docs/BACKEND.md](docs/BACKEND.md)) |
| `data/` | Hand-kept data: degree programs, AP, IB and test credit, notes, building names, name overrides, renumbered courses, the seat watch list |
| `fixtures/` | Real data saved from each source, for offline tests ([fixtures/README.md](fixtures/README.md)) |
| `tools/` | Release, quick-test and API-docs tooling |
| `docs/` | Everything else ([docs/README.md](docs/README.md)) |

## Data sources

| Source | Used for | Coverage in this build |
| --- | --- | --- |
| [Course Explorer API](https://courses.illinois.edu/cisdocs/explorer) (public XML) and course pages | Sections, meeting times, instructors, descriptions, gen-ed attributes, seat status, final exams | History from Wade Fagen-Ulmschneider's mirror ([wadefagen/datasets `course-catalog/`](https://github.com/wadefagen/datasets/tree/main/course-catalog)), Fall 2022 to Spring 2027 (17 terms with Winter 2024 to 2026). The coming winter (Winter 2027) is read from the Course Explorer API, and the current and next term are read from the live course pages by the availability jobs |
| [UIUC GPA dataset](https://github.com/wadefagen/datasets/tree/main/gpa) | Course and instructor GPA, grade distributions | Fall 2015 to Summer 2026. "Recent" = Fall 2022 to Spring 2026 |
| [Gen-ed list](https://github.com/wadefagen/datasets/tree/main/geneds) | Gen-ed categories | Spring 2027 |
| [Teachers Ranked as Excellent](https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent) | Instructor badges | Fall 2020 to Summer 2025, instructors only |
| [Grade disparity view](https://waf.web.engr.illinois.edu/discovery/grade_disparity_between_sections_at_uiuc/) | Design reference for the instructor comparison | Recomputed from the GPA dataset |
| Rate My Professors (unofficial GraphQL) | Ratings, tags, snippets | Optional; cached 7 days; the site works without it |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (Overpass API) | Where each building is | Cached 7 days; 97% of next term's in-person meetings; names that don't match go through `data/buildings.csv`. © OpenStreetMap contributors, ODbL |
| [MTD GTFS feed](https://developer.mtd.org/) | Bus stops, routes and a normal week's times near campus (Getting there) | Downloaded weekly; one term at a time. Data provided by Champaign-Urbana Mass Transit District |
| [OpenFreeMap](https://openfreemap.org/) | Map tiles for the map of each day (Getting there) | Loaded in the browser only when a map is opened; free, no key. OpenFreeMap © OpenMapTiles, data from OpenStreetMap |
| Student notes (`data/notes/*.yaml`) | Exam and grading notes | Added by a maintainer, each with a source |
| [Academic Catalog](https://catalog.illinois.edu/) | Degree requirements (`data/degrees/*.yaml`) | 317 majors and concentrations and 127 minors, 2026-2027; 7 majors checked by hand |
| LAS certificate pages | Undergraduate certificates (`data/degrees/*.yaml`, `type: certificate`) | The 22 LAS certificates, as a link and one box to tick |
| [CITL credit tables](https://citl.illinois.edu/current-cutoff-scores) | Courses each AP, IB, SAT or ACT score gives (`data/ap-credit/`, `data/ib-credit/`, `data/test-credit/`) | AP: students entering 2024-2025 to 2026-2027. IB: 2026-2027. SAT and ACT: 2025-2026 and 2026-2027. Copied by hand, watched weekly |

Students see a short version of this table on the site's `/data-sources/` page.

Self-Service (Banner) needs a NetID and is never scraped: the site only links to it and copies CRNs. Seat counts and
waitlists live only there, so the site knows open, restricted or closed, not how many seats are left. What else the
site can't do: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Commands

| Command | What it does |
| --- | --- |
| `make data` | Full pipeline (all subjects, 18 terms) |
| `make data-quick` | Only CS, MATH, STAT, RHET |
| `make export` | Export `web/public/data` again from `data/illini.db`, without fetching |
| `make test` | pytest (pipeline and tools) and Vitest (web and the MCP server) |
| `make test-quick` | Only the unit tests for what changed since `origin/main` (`python -m tools.quick_test` without make) |
| `make test-api` | The HTTP API in `api/`: type-check and Vitest |
| `make lint` | ruff, mypy, ESLint, tsc |
| `make dev` | Next.js dev server on :3000 |
| `make build` / `make serve` | Static export to `web/out`, served on :4173 |
| `PAGES_LIMIT=50 make build` | Quick build with only 50 course pages (plus the reference courses) |
| `make e2e` | Playwright against the static build (`npx playwright test --workers=1` on a laptop) |
| `make clean` | Delete `data/illini.db`, `web/out`, `web/.next` and `web/public/data` |
| `make availability-files` | Fetch the daily crawl's `data/availability/*.json` from the `availability` branch (`make data` does this first) |
| `make version` | Check that the version files agree and CHANGELOG.md covers the version |
| `make release V=minor` | Next version (`minor`, `patch` or `0.18.0-beta.1`; no `major` until 1.0) in every version file, and Unreleased in CHANGELOG.md becomes that version |
| `python -m pipeline.availability --minutes 30` | The daily seat crawl, by hand |
| `python -m pipeline.live_seats --state s.json --out out/ --minutes 2` | One round of the live seat check, by hand (reads the watch list, `data/watch.txt`) |
| `python -m pipeline.degrees` | Validate `data/degrees/*.yaml` and list course codes the loaded data doesn't know |
| `python -m pipeline.catalog_import` | Import every undergraduate program's requirements from the Academic Catalog |
| `python -m pipeline.ap_credit` | Validate the AP, IB and test credit files and list credited codes the loaded data doesn't know |
| `python -m pipeline.citl_watch [--update]` | Compare CITL's credit tables with the saved snapshots (what `citl-watch.yml` runs) |
| `python -m pipeline.summer` | What the summer and winter classes (`summer.json`, `winter.json`) would show from the loaded data |
| `python -m pipeline.names --report [--subjects CS,MATH,STAT]` | How many of next term's instructors link to their grade history, per subject, and the lecture names that don't |
| `python -m pipeline.renumbered [--suggest]` | Check `data/renumbered.csv` (old course number to new), or list candidate links from Course Explorer text to review |
| `python -m pipeline.reddit collect\|extract\|aggregate\|sample\|agreement\|status` | The r/UIUC signal (#14), not switched on yet: needs Reddit API access ([docs/REDDIT.md](docs/REDDIT.md)) |
| `python -m tools.api_docs` | Check that docs/API.md documents every exported field |

## Automation

| Workflow | When | What |
| --- | --- | --- |
| `pages.yml` | Every push to `main` that changes more than Markdown, nightly 09:00 UTC, manual | Builds and tests the site and deploys `web/out` to GitHub Pages. The nightly run (or `[refresh data]` in a commit message or pull request title) refreshes every source first and commits the refreshed data summaries if everything passed; a plain push reuses the last refresh's database and goes live in a few minutes |
| `ci.yml` | Every push and pull request | Lint and unit tests (`test`); version files, changelog and branch name (`versions`); on pull requests that touch a page, Playwright against this branch's build (`e2e`) |
| `availability.yml` | Daily 04:17 UTC | Reads every course page of the next and current term (~1 request per second, oldest first) for seat status, section rows and final exams; force-pushes `data/availability/*.json` to the one-commit `availability` branch |
| `live-seats.yml` | Every 10 minutes (every 30 overnight) | Re-reads the busiest next-term courses and those on `data/watch.txt` and force-pushes `live.json` to the one-commit `live-seats` branch; Just opened and the home page poll it |
| `api.yml` | Pull requests and pushes to `main` that touch `api/`, `supabase/`, `mcp/src/` or `web/lib/`, manual | Tests and bundles the HTTP API; on `main`, deploys it to Supabase once the project is set up |
| `release.yml` | A new version reaching `main` | Tags that commit `vX.Y.Z`, publishes the GitHub release from CHANGELOG.md and attaches the MCP server package |
| `term-watch.yml` | Mondays | Checks whether Course Explorer has published a term after `NEXT_TERM` and opens one issue with the rollover checklist (#33) |
| `citl-watch.yml` | Mondays | Compares CITL's AP, IB, SAT and ACT tables with the saved snapshots and opens an issue with the diff when a row changes |
| `data-check.yml` | The 10th of January, April, July and October, manual | How old each data source is on the live site; opens one "Data check" issue with what needs a look (#71) |
| `reddit.yml` | Sundays, manual | The r/UIUC signal; collects nothing until the Reddit secrets are set ([docs/REDDIT.md](docs/REDDIT.md)) |
| `branch-cleanup.yml` | A pull request merged, manual | Deletes the merged branch; a manual run deletes older merged branches |
| `commands.yml` | A `/no-checks-main` or `/no-checks-pr` comment on a pull request, from one of the five contributors in the locked `.github/pr-command-users.txt` | Merges and deploys without waiting for checks, or skips `test` and `e2e` on the pull request (CONTRIBUTING.md) |
| `fetch-data.yml` | Manual | Refreshes `fixtures/` from the live sources |

## Contributing

Work happens on `type/short-name` branches (`feature/`, `fix/`, `docs/`, `chore/`, `data/`, `hotfix/`, `release/`)
merged into `main` through pull requests with the checks passing and one approving review; `main` is what's live. One
version for the whole repository, changed only with `make release`; merging a new version tags it and publishes its
release notes from [CHANGELOG.md](CHANGELOG.md).

- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits, pull requests, versions and releases.
- [docs/ISSUES-AND-PRS.md](docs/ISSUES-AND-PRS.md): how to write an issue or a pull request.
- [docs/AI-USE.md](docs/AI-USE.md) and [AGENTS.md](AGENTS.md): AI coding tools are welcome; these are the rules they
  and their users follow.
- [GitHub issues](https://github.com/kamransingri/illini-scheduler/issues): what we'd like to build next (student
  reviews, Reddit feedback, seat alerts with the site closed, accounts), labelled by area. `good first issue` is a
  good place to start.

## Docs

| Doc | What's in it |
| --- | --- |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What the site can't do yet, or does only approximately |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every judgment call, numbered, with the reasons |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system, navigation and how much each page may hold |
| [docs/API.md](docs/API.md) | Every public JSON file and field, and the HTTP API |
| [docs/DEGREE-DATA.md](docs/DEGREE-DATA.md), [docs/AP-CREDIT.md](docs/AP-CREDIT.md) | The degree and credit data formats |
| [docs/BACKEND.md](docs/BACKEND.md), [docs/PUSH.md](docs/PUSH.md) | The HTTP API on Supabase, and seat alerts with the site closed |
| [docs/README.md](docs/README.md) | The full index |

## Licence

The code, including the MCP server's npm package, is under the [MIT licence](LICENSE). The data keeps its sources'
terms: [docs/API.md](docs/API.md#where-the-data-comes-from) says what you may reuse and how to credit it.
