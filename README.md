# Illini Scheduler

**Live site:** https://kamransingri.github.io/illini-scheduler/ (rebuilt nightly at 09:00 UTC).
**Run it locally:**

```bash
pip install -r requirements.txt && (cd web && npm ci)
make data      # ~25 s: download sources, build data/illini.db, export web/public/data
make build     # ~35 s: static export of ~7,000 pages to web/out
make serve     # http://localhost:4173
```

An unofficial planner for University of Illinois Urbana-Champaign students. For any course and term it answers what
students check before registering, on one page:

- **Professors first**: one row per professor teaching the term, on columns that line up: GPA in this course and how
  far above or below the course average they grade in the same terms, grade distribution, RMP quality / difficulty /
  would-take-again with the number of ratings, Teachers Ranked as Excellent badge, lectures taught and how many are
  open. A row opens to that professor's sections, reviews (labelled with the course they were written for), tags and
  exam notes. "Compare" shows them as a sortable table.
- **Best pick score**: one score per professor and course from course GPA, the professor's GPA difference, RMP and
  open seats, with small samples pulled toward an average and a breakdown behind every score. Students set the
  weights. Formula: DECISIONS.md D13.18.
- **Sections**: grouped by what you register for together; CRN (click to copy), type, days/times, location, the
  professor (opens their row), seat status with the time it was checked, final-exam time, a "Check live seats" link
  and a "Register in Self-Service" link.
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
- **Gen-ed finder** (`/geneds/`): filter by category, time and seats, ranked by the best pick score or by GPA.
- **Degree checklist** (`/degree/`): enter finished courses, AP or transfer credit and courses in progress (kept in
  your browser and the link, never on a server); see each requirement of a program as done, in progress, partly done
  or open, and the best options for each open one. Double counting follows the catalog's own rules, quoted; where the
  catalog doesn't say, the page says so. First program: Finance + Data Science, BS (2026-2027 catalog).
- **Schedule builder** (`/schedule/`): cart, every conflict-free combination (lecture + linked discussion/lab),
  ranked by your preferences, weekly calendar, CRN export, `.ics` download, share links, and a warning when two
  final exams overlap.

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
| [Academic Catalog](https://catalog.illinois.edu/) | Degree requirements (`data/degrees/*.yaml`) | Finance + Data Science, BS, 2026-2027, read 2026-11-16 |
| Course Explorer final-exam schedule | Final-exam times per section | Read weekly by the availability job once a term's finals are published |

Self-Service (Banner) needs a NetID and is never scraped: the app only links to it and copies CRNs.

## How it works

```
Course Explorer ─┐
Wade's datasets ─┼─> Python pipeline ─> data/illini.db ─> web/public/data/*.json ─> Next.js static export ─> GitHub Pages
Rate My Prof.  ──┘    (pipeline/)          (SQLite)          (pipeline/export.py)     (web/)
```

- `pipeline/` (Python 3.11+, pandas, httpx, lxml): `course_explorer.py` (ingest + linked sections),
  `gpa.py`, `names.py` (one instructor identity across sources), `rmp.py`, `instructors.py`, `offerings.py`
  (patterns + changes), `exam_format.py`, `availability.py` (seat status, section rows and final exams from the
  Course Explorer pages), `degrees.py` (degree requirements), `export.py`. `python -m pipeline.run --help` lists the options
  (`--subjects CS,STAT`, `--source api|csv|auto`, `--no-rmp`, `--fixtures` for a fully offline build).
- `web/` (Next.js 15 App Router, TypeScript, Tailwind 4): every course page is pre-rendered; details load from the
  per-course JSON. Design tokens and shared components are described in `DESIGN.md` (`web/components/ui/`). The schedule generator (`web/lib/schedule.ts`) is an exact branch-and-bound search that runs in
  the browser.
- Unmatched instructor names are logged to `data/unmatched.csv`; fix the worst ones in `data/name_overrides.csv`.

## Commands

| Command | What it does |
| --- | --- |
| `make data` | Full pipeline (all subjects, 14 terms) |
| `make data-quick` | Only CS, MATH, STAT, RHET |
| `python -m pipeline.degrees` | Validate `data/degrees/*.yaml` and list course codes the loaded data doesn't know |
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

## Degree requirement data

Each program is one YAML file in `data/degrees/`, copied from its Academic Catalog page for one catalog year: the
program's source URL and the date it was read, then requirement groups in catalog order. A group is `all` of a list,
`n_of` a list, at least some credit `hours` from a list, a number range (`FIN 400-499`) or gen-ed codes
(`gened:HP`), or `manual` (ticked by the student). Items can be alternatives (`[STAT 107, CS 107]`) or a sequence that
counts as one (`RHET 101 + RHET 102`); `exclude`, `max_hours`, `min_from`, `not_with` and `exclusive` cover the
catalog's caveats, and `double_counting` lists the quoted rules for when a course may count twice. The full schema is
in `data/degrees/README.md`.

To add a program: copy its catalog tables into a new `data/degrees/<id>.yaml` (never from memory), add the gen-ed groups
and double-counting rules the page says apply, run `python -m pipeline.degrees` to validate it, then `make data`. It
appears in the program menu on `/degree/`.

See `DECISIONS.md` for every judgment call (D13 for the redesign and degree planner), `DESIGN.md` for the design, and
`PROGRESS.md` for what was verified and how.
