# Progress

Newest first at the top: the current state, then the build log in the order it happened.

## Current state (v0.4.0, 2026-11-17)

- **Site:** 7,147 static pages (7,138 course pages). Course search by code, title, nickname, professor or CRN; course
  pages built around professors; gen-ed finder; degree checklist for 171 programs; Just opened, near real time;
  schedule builder with must-haves, priorities and presets.
- **Data:** nightly build at 09:00 UTC; every course's seats read daily (04:17 UTC); the busiest next-term courses
  re-read about every 10 minutes by `live-seats.yml` (starts once this release is on `main`).
- **Checks on the full build (Windows laptop, one Playwright worker):** pytest 189/189, Vitest 97/97, ruff, mypy,
  ESLint and tsc clean, Playwright 50/51 (the Windows-only lower-case URL test, which passes on GitHub's Linux runners).
- **Not done yet:** see [LIMITATIONS.md](LIMITATIONS.md) and [IDEAS.md](IDEAS.md).

## Original build summary (2026-11-04)

**Live URL:** https://kamransingri.github.io/illini-scheduler/ (deployed by run 41774876513 on 2026-11-04; nightly
refresh at 09:00 UTC). **Run locally:** `pip install -r requirements.txt && (cd web && npm ci) && make data && make build
&& make serve`, then open http://localhost:4173.

**What works** (all phases 0-8, Final QA and the deploy workflow are done):
- Data pipeline (`make data`, ~25 s): 14 terms of Course Explorer sections (Fall 2022 to Spring 2027), GPA by course
  and instructor with same-term grade disparity, one instructor identity across sources, offering patterns +
  Fall 2027 outlook, a change timeline, exam/grading profiles backed by quotes, and a Teachers-Ranked-Excellent join.
- Site (7,026 static course pages): search (codes in any spelling, titles, instructors), course pages
  (summary, sections with copy-CRN and live-seat links, instructor cards, grade chart, changes, student notes),
  gen-ed finder, schedule builder (exact branch-and-bound, about 0.5 s for a heavy 6-course cart, calendar, .ics,
  share links that keep rules, clash explanations).
- Verified: pytest 147, Vitest 47, Playwright 25, Lighthouse course page 99/100/100, data audit 10/10 courses
  matching raw sources, failure drills, and an independent reviewer that finished the student task with 0 blockers
  (round 2: 0 majors).

**Live data (first GitHub run):** Fall 2026 sections come live from the Course Explorer API (12,835 sections). Spring
2027 uses the 2026-10-30 mirror because Course Explorer was still generating most Spring pages (HTTP 202); later
runs retry. RMP works: about 20 minutes of lookups per run, coverage growing through the 7-day cache, and 530
exam/grading profiles (up from 66). On GitHub the pipeline ran CI 147 pytest + 47 Vitest, 25 Playwright tests against the build,
and 8 smoke tests against the live URL: all passed.

**Sections, seat status and seat history (2026-11-05):** current and next term sections come from the live Course
Explorer course pages (Fall 2026: 12,763 sections from 4,425 pages, 196 courses not in the mirror; Spring 2027:
11,778 from 4,497, 41 new). Status coverage: Fall 12,833 of 13,101, Spring 11,825 of 11,836. Seat changes are
recorded (174 in the first day), shown per course with an RSS "Watch seats" feed, and listed on the Just opened
page. The daily `availability.yml` job (04:17 UTC) keeps it current; the 09:00 build deploys it. Exact seats left,
capacity and waitlists exist only in Self-Service (NetID) and are linked, never scraped.

**Known issues:**
- RMP covers the instructors looked up so far (lecture instructors first). The rest show a search link and fill in
  over the next nightly runs.
- Spring 2027 seat status isn't published in the snapshot (taken before registration opened), so the site says
  "Not published" and links to live seats. Fall 2026 status is from 2026-03-25.
- .ics instruction dates are estimates (`web/lib/terms.ts`).
- STAT instructor-to-GPA match rate is 78.9% on lecture sections (target 80%): new instructors and real ambiguity.
- Search has no typo tolerance; near-duplicate schedules that differ only by a same-time section still appear
  separately; renumbered courses aren't linked.

## Next steps (backlog for the next session)

Done on 2026-11-05: sections from the course pages, seat-change history + RSS + Just opened, search typos/aliases,
CI hygiene (see DECISIONS.md D12). Remaining, ranked:

1. **Real fixtures.** Replace the HANDMADE XML/RMP fixtures with real saved responses (`python -m pipeline.fetch_fixtures`).
2. **Final-exam conflicts.** Course pages call `/ajax/finalexam/{year}/{season}/{SUBJ}/{NUM}`; parse it in the slow job and
   warn in the schedule builder when two finals overlap.
3. **Instructor matching.** Curate `data/name_overrides.csv` from `data/unmatched.csv` (STAT lecture match 78.9%).
4. **Official term dates** for the .ics export (`web/lib/terms.ts` holds estimates).
5. **Student notes intake.** GitHub issue form for `student-note` + a script that turns approved issues into YAML.
6. **Bigger features:** prerequisite graph / "what can I take next", degree checklist (CS + Stats), several named
   schedules, side-by-side comparison.
7. **Repo growth.** `data/availability/*.json` now holds full section rows (larger); if `.git` passes ~200 MB, move
   these files to a separate `data` branch.

## Needs a human

From the redesign and degree planner (2026-11-16):

1. **Degree rules an advisor should confirm.** The checklist counts a course twice only where a quoted rule allows it
   (DECISIONS D13.11); pairs the catalog is silent on (two program groups, two non-Cultural-Studies gen-eds) are shown
   as "rules unclear". A Gies advisor could say which of those are allowed, and the rules would go into
   `data/degrees/finance-data-science.yaml` with their source.
2. **RMP match for "Anderson, J" (MATH 221)** shows AFRO 310 / EPS 310 reviews from 2011–2018: probably the wrong person
   (`data/name_overrides.csv` or a stricter department check in `pipeline/rmp.py`).
3. **Repo "About" website link.** Setting it needs admin on the repo: gear icon next to About, tick "Use your GitHub
   Pages website".
4. **First final-exam run.** The next daily availability job is the first to read final exams; its log line should say
   "N final-exam lists". Spring 2027 finals appear once the registrar publishes them.

Earlier: done: the repo is public and pushed, Pages is on (Source: GitHub Actions), and the site is deployed.
These checks remain. This build session's network blocks `*.github.io`, `courses.illinois.edu` and Wade's
visualization site:

1. **Course Explorer spot check.** Compare 3 MATH 221 Fall 2026 sections (CRN, time, room) on
   https://kamransingri.github.io/illini-scheduler/course/MATH/221/ with
   https://courses.illinois.edu/schedule/2026/fall/MATH/221
2. **Wade's visualizations.** Compare the CS 124 / MATH 221 instructor order with
   https://waf.web.engr.illinois.edu/discovery/grade_disparity_between_sections_at_uiuc/ and the top 10 Hist & Phil
   gen-eds with http://waf.cs.illinois.edu/discovery/every_gen_ed_at_uiuc_by_gpa/ (expected differences:
   PROGRESS.md Phases 2 and 7).

## Phase log

### Phase 0 — preflight and scaffold

Tool versions: python 3.13.18, pip 24.0, node 22.23.4, npm 10.9.9, git 2.43.0, gh 2.89.0 (token valid only for
repo-scoped API calls), ruff 0.16.9, mypy 2.3.1, Playwright 1.63.0 + pre-installed Chromium.

Network check (2026-11-04):

| URL | Result |
| --- | --- |
| https://courses.illinois.edu/cisapp/explorer/schedule.xml | blocked (proxy 403) |
| https://raw.githubusercontent.com/wadefagen/datasets/main/README.md | 200 OK |
| https://www.ratemyprofessors.com/ | blocked (proxy 403) |

Fallback: see DECISIONS.md D0.2 and D0.3.

Phase 0 complete.

### Phase 1 — Course Explorer ingestion

Built `pipeline/course_explorer.py` (CSV mirror + XML API crawler with 4-way concurrency, retries, raw cache,
`--subjects`/`--all`/`--source`), `pipeline/timeparse.py`, `pipeline/db.py`, `pipeline/fetch.py`.

Acceptance:
- pytest parses all four reference courses (CSV real slices + HANDMADE XML) with warnings as errors: pass.
  CS 124 has lecture-type sections (OLC) with non-empty CRNs (D1.6).
- `--subjects CS,MATH,STAT,RHET`: 2,311 sections (1,209 Fall 2026 + 1,102 Spring 2027) > 200: pass.
- Full run, all subjects, 14 terms: 137,388 sections in 5 s, zero parse errors.
- Zero sections with start_time > end_time: pass.
- MATH 221 spot check (Fall 2026; MATH 221 is not offered in Spring 2027). Live page blocked, so compared
  with the upstream CSV rows (Needs a human #3):

| CRN | DB row | Upstream row |
| --- | --- | --- |
| 47023 | AL2 LEC TR 15:00-15:50 Gregory Hall 112 | AL2 LEC TR 03:00 PM-03:50 PM Gregory Hall 112 |
| 47029 | EDJ DIS WF 14:00-14:50 Gregory Hall 317 | EDJ DIS WF 02:00 PM-02:50 PM Gregory Hall 317 |
| 46998 | ADF DIS WF 11:00-11:50 Gregory Hall 215 | ADF DIS WF 11:00 AM-11:50 AM Gregory Hall 215 |

Linking for MATH 221 Fall 2026 matches the A/E pattern (AL1/AL2 with AD*/AM*, EL1/EL2 with ED*/EM*).

Phase 1 complete.

### Phase 2 — GPA and grade disparity

Built `pipeline/gpa.py` (course, course-term and instructor-course stats, recent-window GPA, same-term delta,
limited-data flag, gen-ed join) and `pipeline/names.py` (Phase 3's shared name parser, needed for instructor keys).
Full dataset: 4,397 courses and 15,708 instructor-course rows in about 4 s.

Acceptance:
- Unit test: GPA formula on a hand-made row equals exactly 2.8: pass. W excluded, W rate kept: pass.
- No course has avg_gpa outside 0 to 4 (range 1.918 to 3.987): pass.
- Instructor tables (Fall 2015 to Summer 2026, delta = same-term difference):
  - CS 124: one primary instructor in the dataset (Challen, Geoffrey W: 3.59, 8,653 students, Fall 2021 to Spring 2026), so delta = +0.00.
  - MATH 221 (top/bottom by delta): Davidson +0.21, Folwaczny +0.09, Anema +0.05, Murphy +0.04 ... Guzman -0.09,
    Srikant -0.11, Bradlow -0.11, Mortensen -0.13. The spread is narrow (±0.2), consistent with a coordinated
    course with common exams.
  - Comparison with Wade's grade-disparity page could not be done: `waf.web.engr.illinois.edu` is blocked here
    (Needs a human #4). Expected differences: that page covers Spring 2022 to Spring 2025 and compares against
    the all-terms course mean, while ours is Fall 2015 to Summer 2026 with a same-term baseline.
- RHET 105 has no rows in the window (FERPA small-section exclusion), so the UI shows "No grade data".

Phase 2 complete.

### Phase 3 — Instructor matching and RMP

Built `pipeline/names.py` (parser, keys, truncation-aware compatibility, matcher with tie-breaks and logging),
`pipeline/rmp.py` (GraphQL client: school search, teacher search, cache, rate limit, graceful failure),
`pipeline/instructors.py` (aliases, TRE badges, RMP join, match report), `data/name_overrides.csv`.

Acceptance:
- 31 unit tests for names.py (hyphenated, accents, truncated, two same-last-name instructors in one department,
  initials only, ambiguous logging, overrides, cross-listed): pass. 8 RMP client tests + 1 integration test
  (blocked RMP -> pipeline finishes, status "unavailable"): pass.
- Match rate, Spring 2027 instructors (next term):

| Subject | GPA match (all names) | GPA match (lecture/primary sections) | RMP |
| --- | --- | --- | --- |
| CS | 132/174 (75.9%) | 132/159 (83.0%) | unavailable (blocked) |
| MATH | 62/77 (80.5%) | 60/70 (85.7%) | unavailable (blocked) |
| STAT | 30/38 (78.9%) | 30/38 (78.9%) | unavailable (blocked) |

  The ≥ 80% target holds for CS and MATH on lecture instructors; STAT is at 78.9% (30/38). The 8 STAT misses are
  instructors with no GPA history (new) or real ambiguity ("Wang, S" = Shiyu or Shulei, neither taught STAT 578),
  which the rules say to log rather than guess. Known issue, see data/unmatched.csv (2,137 names, mostly TAs).
- RMP manual check of 5 matches: not possible (host blocked). Needs a human #5.
- TRE: 2,521 instructors with an "Excellent/Outstanding" badge since Fall 2020.

Phase 3 complete.

### Phase 4 — Offering history and course changes

Built `pipeline/offerings.py`: offerings per term (49,380 course-terms), pattern labels + Fall 2027 prediction
(8,612 courses), change timeline (7,746 changes: 2,181 description, 539 prerequisite, 211 gen-ed, 210 title,
205 credit hours, 2,709 delivery, 1,691 new-instructor rows).

Acceptance:
- Pattern labeler tests on synthetic histories (every term, fall only, spring only, odd/even years, irregular,
  summer only, none, almost every term, summer suffix) and predictor tests: pass.
- A real change: **CS 225** prerequisites gained CS 413 in Spring 2023 and MATH 314 in Fall 2025
  (confirmed by printing the stored prereq text per term; detector reports "Prerequisite changed: now lists
  MATH 314"). A fixture-based test does the same for STAT 107's Spring 2027 description change.
- A stable course: **MATH 221** has no catalog changes Fall 2024 to Spring 2027 (test asserts zero non-instructor changes)
  and is labelled "Fall only" (High for Fall 2027).

Phase 4 complete.

### Phase 5 — Exam and grading format

Built `pipeline/exam_format.py` (fixed schema, deterministic rules with negations, majority merge with agreement
counts and evidence) and `pipeline/notes.py` (YAML student notes loader; `data/notes/README.md` documents the format).

Acceptance:
- 35 crafted-text tests including negations ("no final", "final is optional", "not curved", "doesn't curve",
  "attendance is not mandatory", "no group projects", "don't need the textbook") and real-text false
  positives ("curve fitting", "take-home devices", "ALEKS placement score"): pass.
- Three real instructors' profiles with evidence (every non-unknown field is backed by a quote):
- **MILS 301** (`kuhn|j`):
  - n_midterms = 1 (1/1) — Course description: “…ngs, case studies, practical exercises, a mid-term exam, and a final exam.…”
  - has_final = yes (1/1) — Course description: “…actical exercises, a mid-term exam, and a final exam.…”
- **ECE 484** (`driggscampbell|katherin`):
  - textbook_required = no (1/1) — Course description: “thus, there is no required textbook.”
- **ARTS 392** (`bakker|conrad`):
  - attendance_required = yes (1/1) — Course description: “Attendance is required at visiting artists' and scholars' lectures and field trips.”
- Coverage is thin (66 profiles) because RMP, section notes and student notes were unavailable here (D5.3).
  When the nightly workflow runs with open network, RMP snippets feed the same extractor.

Phase 5 complete.

### Phase 6 — Course search and course page

Built the Next.js app shell (header/nav, footer disclaimer + sources), home search (`lib/search.ts`: codes in any
spacing, title words incl. "intro", instructors), the course page (`app/course/[subject]/[number]`) with summary,
sections (copy-CRN, live-seat links, Self-Service link, link-group hint, part-of-term), instructor cards (GPA,
delta vs course, grade bar, limited-data and Ranked-Excellent badges, RMP or "RMP unavailable" + search link, exam
profile), past instructors (grade disparity list), grade distribution chart, change timeline, and student notes.

Acceptance:
- Playwright: "cs124" → Enter lands on /course/CS/124/, page shows sections, ≥ 1 instructor card, the GPA chart,
  and no console errors: pass.
- Playwright at 375px: no horizontal scroll on CS 124, MATH 221, STAT 107, RHET 105: pass.
- Lighthouse (mobile emulation, CS 124): first run performance 85 / accessibility 97. Fixed layout shift (footer
  jump while details load), the `<dl>` structure and a missing favicon; re-run: **performance 99,
  accessibility 100, best practices 100**.
- Screenshots in `screenshots/` (CS 124, MATH 221, STAT 107; desktop + mobile), reviewed: nothing cut off or
  overlapping, no NaN/undefined. Fixed while reviewing: truncated change quotes now end with "…", and the
  "no grade data" text now explains why (one primary instructor per section in the GPA dataset).
- Vitest: 15 unit tests (search, format, cart encoding): pass.

Phase 6 complete.

### Phase 7 — Gen-ed finder

Built `/geneds/` (`components/GenedFinder.tsx`, `lib/geneds.ts`): code multi-select, double-dips, credit hours,
no 8am / no Friday / online only, next-term sections, 200+ student floor, min RMP (disabled with a note while RMP is
unavailable); sort by recent GPA, % A, RMP or sections; rows show categories, recent GPA with n, best instructor
next term by GPA (≥ 60 students), section count, and Add to schedule.

Acceptance:
- Vitest: 12 filter/sort tests: pass.
- Playwright: Humanities: Hist & Phil + "Has sections in Spring 2027", sort by GPA: every row has HP and GPAs are
  non-increasing: pass.
- Top 10 Humanities: Hist & Phil (HP) by recent GPA, offered Spring 2027:

| Course | Title | Recent GPA | Students |
| --- | --- | --- | --- |
| SPED 117 | The Culture of Disability | 3.86 | 3665 |
| HK 208 | Introduction to Medical Ethics | 3.85 | 3411 |
| CLCV 231 | Development of Ancient Cities | 3.84 | 1782 |
| ARTJ 302 | Intro to Japanese Animation | 3.82 | 106 |
| LAW 303 | Living the Law | 3.81 | 677 |
| ANSC 255 | Animal Ethics | 3.81 | 390 |
| EDUC 202 | Social Justice, School and Society | 3.77 | 722 |
| REL 110 | World Religions | 3.76 | 3211 |
| HIST 172 | US History Since 1877 | 3.75 | 23 |
| ECE 316 | Ethics and Engineering | 3.73 | 281 |

  Comparison with "Every Gen Ed at UIUC, by GPA" was not possible (`waf.cs.illinois.edu` blocked; Needs a human #4).
  Expected differences: that view averages over all terms in the dataset, while ours uses the last 8 fall/spring
  terms and lists only courses that have a page (offered Fall 2026/Spring 2027 or with recent GPA data).
- Screenshot reviewed (`screenshots/geneds-desktop.png`); fixed `&amp;` in titles found there.

Phase 7 complete.

### Phase 8 — Schedule builder

Built `/schedule/` (`components/ScheduleBuilder.tsx`, `components/WeekCalendar.tsx`, `lib/schedule.ts`,
`lib/ics.ts`, `lib/campus.ts`, `lib/terms.ts`): cart (search-to-add, from course pages and the gen-ed finder,
localStorage + URL), term switch, locked CRNs, blocked times, hard rules, weight sliders, top 50 schedules with
‹ › navigation, summary line ("Expected GPA 3.46, earliest 10:00am"), weekly calendar, section list with CRNs,
warnings (not offered, Closed/Restricted, > 18 credit hours), Copy all CRNs, Download .ics, Copy share link,
Self-Service link.

Acceptance:
- Unit tests: overlap on shared days conflicts; same times on different days don't; MWF vs TR never;
  10:00-10:50 + 10:50-11:40 is back-to-back, not a conflict; A/B half-terms; online: pass.
- Property test: 1,000 random carts (grouped, any-with-any and standalone courses, half-terms, online): every
  generated schedule is conflict-free and every bundle is a valid lecture + linked-section combination; plus 200
  carts checking no-8am / no-Friday / blocked times / locked CRN: pass.
- Performance: 6-course heavy cart ≈ 0.5 s in Node (exact) and < 2 s end to end in Chromium (Playwright): pass.
- .ics: parsed by ical.js in tests; every event recurs weekly in America/Chicago, 6-59 occurrences, lines folded to
  ≤ 75 octets: pass. (Google Calendar itself can't be driven from here; the file follows RFC 5545 with a VTIMEZONE,
  which Google accepts.)
- Playwright: add CS 124, RHET 105, STAT 107 through search, MATH 221 through the share link (not offered in
  Spring 2027, so search has no Add button and the builder warns), set "no 8am", generate, step through all 50
  schedules: no section starts before 9:00; .ics downloads: pass. Cart survives reload, URL is shareable, empty
  cart shows guidance: pass.
- Screenshots reviewed (`screenshots/schedule-*.png`). Fixed while reviewing: the Self-Service button text was
  invisible (unlayered `a {color: inherit}` overrode Tailwind utilities, so base styles now live in `@layer base`),
  and the search placeholder was cut off in the narrow column.

Phase 8 complete.

### Final QA

**Data audit** (10 random Spring 2027 courses, seed 2027). Each was recomputed independently from the raw upstream
files with pandas and compared with the JSON the site serves. Course Explorer itself was blocked, so "raw" =
the upstream course-catalog CSV for Spring 2027; GPA = Fall 2015+ rows of the GPA dataset:

| Course | Sections raw / site | CRN checked | Instructor raw / site | GPA raw / site (Fall 2015+) | Match |
| --- | --- | --- | --- | --- | --- |
| CEE 452 | 3 / 3 | 70861 | Schmidt, A / Schmidt, A | 3.51 / 3.51 | ✓ |
| PSYC 443 | 2 / 2 | 35232 | Huibregtse, M / Huibregtse, M | None / None | ✓ |
| BADM 310 | 2 / 2 | 57199 | Charles, D / Charles, D | 3.71 / 3.71 | ✓ |
| ACE 306 | 1 / 1 | 71848 | Endres, B / Endres, B | 3.25 / 3.25 | ✓ |
| IS 471 | 3 / 3 | 74988 | Hensley, M / Hensley, M | 3.86 / 3.86 | ✓ |
| MUS 569 | 1 / 1 | 53074 | MacLeod, R / MacLeod, R | None / None | ✓ |
| ECE 422 | 6 / 6 | 72180 | Bates, A / Bates, A | None / None | ✓ |
| MUS 240 | 1 / 1 | 35542 | Shungu, P / Shungu, P | 3.68 / 3.68 | ✓ |
| ECE 310 | 3 / 3 | 65517 | Moon, T / Moon, T | 3.0 / 3.0 | ✓ |
| LCTL 302 | 1 / 1 | 77387 | Blazek, K / Blazek, K | None / None | ✓ |

0 mismatches. ("None" GPA = no GPA rows since Fall 2015, typically small graduate or music sections.)

**Failure drills**
- RMP disabled/blocked: pipeline finishes with `rmp_status = unavailable`; instructor cards say "RMP unavailable in
  this build" with a search link; the gen-ed RMP filter is disabled with a note (Playwright + pytest).
- Course Explorer unreachable: `--source auto` falls back to the CSV mirror (that's how this build ran). A fully
  offline drill, `python -m pipeline.run --fixtures` with the proxy pointed at a dead port, builds the four
  reference courses from `fixtures/`; every page renders without NaN/undefined.
- Data files unreachable in the browser (course JSON, search index, gen-ed list): clear inline messages, the course
  summary stays visible (Playwright `failure.spec.ts`).
- Empty cart: guidance text, not a blank page. Unknown course URL: 404 page.

**Test suite**: pytest 146, Vitest 39, Playwright 17 (also passing under the `/illini-scheduler/` base path used by
GitHub Pages), ruff + mypy + ESLint + tsc clean. Lighthouse (mobile): course page 99/100/100
(perf/a11y/best practices), home 99/93→fixed, gen-eds 92/100/100, schedule 99/94→fixed (an `aria-controls` that
pointed at a not-yet-rendered list).

**Independent reviewer (sub-agent that only saw the running app).** Task: "Plan a Spring schedule as a Stats & CS
freshman: CS 124, MATH 231, STAT 200, one Humanities gen ed with the highest GPA, no 8am classes."
- Round 1: task completed, **0 blockers**, 6 majors, about 20 minor/polish items. Majors: (1) the gen-ed finder's top pick
  clashed with STAT 200 and the builder only said "no schedule"; (2) opening a share link overwrote your own list
  and dropped the rules; (3) stacked/invalid CRN locks silently produced schedules missing a course; (4) two
  different "course average" numbers on one page; (5) gen-ed filters lost on Back/reload; (6) special/restricted
  sections (CS 124 WWC, MATH 231 AD@) suggested without warning. All fixed (DECISIONS.md D9), plus most
  minors. Each fix has a Playwright test (`tests/e2e/review-fixes.spec.ts`).
- Round 2 (same reviewer, rebuilt site): **all 6 majors fixed, no new blockers or majors.** Its final plan:
  CS 124 AL1 + AYH, MATH 231 CL1 + CDZ, STAT 200 L1, CWL 207 A2: expected GPA 3.56, Fridays off, earliest
  11:00am, no 8am in any of the 15 schedules. Leftovers it noted were fixed (nav label, the discussion lock now
  lists only the locked lecture's group) or are known issues (below).

Final test counts: pytest 147, Vitest 47, Playwright 25 (all also pass under the `/illini-scheduler/` Pages base
path). Lighthouse (mobile): home 99/100/100, course page 99/100/100, schedule 99/100/100, gen-eds 86/100/100.
The gen-eds score was measured while the reviewer's browser was running in parallel; it was 92 when measured alone.

QA complete.

### Deploy

- `.github/workflows/pages.yml` is written (push to main, nightly 09:00 UTC, manual; Python + Node, `make data`,
  lint + tests, `make build` with `BASE_PATH=/<repo>`, Playwright against the build, commit refreshed data summaries
  only after tests pass, `upload-pages-artifact` + `deploy-pages`).
- **Not deployed from this session.** There is no GitHub remote, because this session can't create repositories
  (D0.2). So `gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow`, `gh workflow run pages.yml` and
  the live smoke tests couldn't run. Instead the Playwright suite ran against `make build` served locally, both at
  `/` and under `/illini-scheduler/` (the path Pages will use): 25/25 pass.

### Deploy (completed)

- Repo created by the owner (public, so Pages works on a free plan) and pushed from this session.
- Pages source set to GitHub Actions by the owner (this session's token can't change Pages settings).
- Three runs failed before the first deploy, each fixed and covered by a test: (1) one Course Explorer page that kept
  failing aborted the crawl → tolerate partial failures and fill from the mirror; (2) HTTP 202 "still generating"
  pages + a `KeyError` in the RMP loop for instructors outside the GPA window → capped backoff with a second pass,
  identity from the Course Explorer name; (3) two e2e tests (a race while course data loaded, and no root 404.html
  in the base-path test server). The RMP cache is also saved even when later steps fail.
- Run 41774876513: refresh ✓, lint/unit ✓, build ✓, 25/25 Playwright ✓, data summaries committed ✓, deploy ✓,
  **8/8 smoke tests against https://kamransingri.github.io/illini-scheduler/ ✓**.
- Docs-only commits (`*.md`, `screenshots/`) no longer trigger the 30-minute refresh.

### RMP verification (done)

Five random Spring 2027 lecture instructors that the pipeline matched (seed 20261104), each opened on RMP and
confirmed to be the same person at UIUC (school id 1112):

| Course | Course Explorer name | RMP match | RMP department | Rating (ratings) | Page check |
|---|---|---|---|---|---|
| ARTD 426 | Mukachirayil, S | [Savio Mukachirayil](https://www.ratemyprofessors.com/professor/2985112) | Design | 3.5 (2) | ✓ UIUC page, name matches |
| IS 534 | Song, Y | [Yoo-Seong Song](https://www.ratemyprofessors.com/professor/1861158) | Information Science | 5 (4) | ✓ UIUC page, name matches |
| THEA 591 | Morrissette, J | [J.W. Morrissette](https://www.ratemyprofessors.com/professor/1434220) | Theater | 4.9 (45) | ✓ UIUC page, name matches |
| CS 525 | Gupta, I | [Indranil Gupta](https://www.ratemyprofessors.com/professor/831224) | Computer Science | 3.5 (25) | ✓ UIUC page, name matches |
| BIOP 599 | Leckband, D | [Deborah Leckband](https://www.ratemyprofessors.com/professor/2912380) | Chemistry | no ratings yet | ✓ UIUC page, name matches |

5/5 correct. Leckband's zero-rating profile exposed a display bug (0.0 shown as a score), fixed in D10.6. Also
checked by hand: Challen (CS), Lewis (CS), Erickson (CS), Whittlesey (MATH), Findley (STAT) all match the right UIUC
profiles.

## Redesign and degree planner (branch `feature/redesign-degree-planner`, started 2026-11-16)

Running log so a later session can resume. Decisions are in DECISIONS.md D13, the design audit and direction in
DESIGN.md.

### Phase 0 — baseline (2026-11-16, Windows 11 laptop, Python 3.13.4, Node 25.2.1)

`make` isn't installed on this machine, so each Makefile target was run as its underlying command.

| Check | Result |
| --- | --- |
| `pip install -r requirements.txt`, `npm ci` | ok |
| `make data-quick` | **failed on main**: RMP answered one name ("Cheslow") with a GraphQL error and `teachers: null`; the client cached it and `search_teachers` crashed (TypeError), stopping the pipeline. Fixed (D13.1). With `AVAILABILITY_MODE` on its default, `--subjects` doesn't limit the live terms (the availability files load every subject), so "quick" still looks up ~3,400 instructors on RMP |
| `make data` (as CI: `SOURCE=csv`, `AVAILABILITY_MODE=file`, `RMP_BUDGET_SECONDS=300`) | ok after the fix: 7,138 course files, 848 gen-ed rows, RMP ok |
| `make test` | pytest 163/164 on main: `test_export_seat_history_and_feeds` failed on Windows only (RSS feeds written in the locale encoding, cp1252 can't encode "→"). Fixed: feeds are written as UTF-8. Vitest 52 passed, 2 skipped |
| `make lint` | ruff, mypy, ESLint, tsc clean |
| `make e2e` (against the baseline build) | 27/28. "lower-case course URL redirects" fails only on Windows: its case-insensitive file system serves `/course/cs/124/` as the real page, so the 404 redirect never runs. GitHub Pages and the Linux runner are case-sensitive |

Network check (2026-11-16, from this machine):

| URL | Result |
| --- | --- |
| https://catalog.illinois.edu/ | 200 |
| https://courses.illinois.edu/cisapp/explorer/schedule.xml | 200 |
| https://courses.illinois.edu/schedule/2027/spring/CS/124 | 200 |
| https://www.ratemyprofessors.com/ | 200 |
| https://raw.githubusercontent.com/wadefagen/datasets/main/README.md | 200 |
| https://brand.illinois.edu/ | 200 |

Baseline screenshots: `docs/screenshots/before/` (`node web/scripts/screenshots.mjs <dir>` with the build served on
:4173).

### Phase 1 — design audit and direction (done)

DESIGN.md: audit of every baseline page, the direction (brand palette from brand.illinois.edu, read 2026-11-16;
Source Sans 3 + Montserrat; five sizes; one radius; one meaning per colour) and the token/component reference.
Tokens in `web/app/globals.css` (`@theme`, Tailwind's type and radius scales reset); shared components in
`web/components/ui/` (Icon, Info, Stat, Badge, SeatStatus, Delta, SectionHeader, DataRow, Expandable). Legacy colour
names (`brand`, `good`, `bad`) are aliased in `globals.css` until Phase 3 restyles the remaining pages.

### Phase 2 — course page around professors (done, waiting for approval before Phase 3)

`web/components/course/` (ProfessorLedger, SectionsList, CompareTable, BestPick, ScoreBreakdown, CourseView),
`web/lib/sections.ts`, `rank.ts`, `score.ts`, `weights.ts`; `components/CourseDetail.tsx` removed; Grades over time is a
table. `pipeline/export.py` adds `meta.score_priors` (subject/campus GPA, RMP means) for the score.

Checks on the full build (7,146 pages): Vitest 68/68 (new: score shrinkage and missing-data cases, section groups,
TRE labels), pytest 166/166, ruff/mypy/ESLint/tsc clean, Playwright 32/33 (new `professors.spec.ts`: expanding a row,
clicking a section's professor, review labels, compare sort, 375px with a panel open; the one failure is the
Windows-only lower-case URL test from Phase 0). Lighthouse on `/course/CS/124/`, median of 3: performance 0.98,
accessibility 1.00, best practices 1.00. No horizontal scroll at 375px on CS 124, MATH 221, STAT 107.

Review screenshots were shared with the owner of this session for approval (Phase 3 step 1).

### Next steps added by this work

- RMP keeps only the 3 most recent snippets per professor across all courses, so a course page often has no review for
  that course. The cached RMP responses already hold 20 ratings: keeping up to ~8, this course's first, costs no extra
  requests but changes the RMP client (left alone in this work, D13.5).
- MATH 221 "Anderson, J" is matched to an RMP profile whose reviews are for AFRO 310 and EPS 310 (2011–2018): very
  likely a different person. Worth an entry in `data/name_overrides.csv` or a stricter department check in `rmp.py`.
- `CURRENT_TERM` / `NEXT_TERM` / `HISTORY_TERMS` are hard-coded in `pipeline/fetch.py`; they need a by-hand bump when
  Fall 2027 is published (usually around March 2027).

### Phase 3 — other pages (done)

Approved by the session owner on 2026-11-16 and pushed as `v0.2.0-beta.1` (CI on the branch: pass). Home, gen-ed
finder, search results, schedule builder and Just opened restyled with the tokens; `components/ui/CourseRow.tsx` is the
shared course row; `Metric` and the legacy colour aliases are gone. Checks: Playwright 32/33 (the Windows-only test),
Vitest 68/68, lint clean; Lighthouse (single run): home 0.98/1.00/1.00, gen-eds 0.87/1.00/1.00, schedule 0.97/1.00/1.00,
Just opened 0.88/1.00/1.00 (performance/accessibility/best practices); no sideways scroll at 375px on any of them.

### Phase 4 — degree requirement data (done)

`data/degrees/finance-data-science.yaml` from https://catalog.illinois.edu/undergraduate/bus/finance-data-science-bs/
(2026-2027, read 2026-11-16) plus the campus gen-ed rules from
https://catalog.illinois.edu/general-information/degree-general-education-requirements/ and
https://gened.illinois.edu/requirements/; schema in `docs/DEGREE-DATA.md`; loader and validator
`pipeline/degrees.py` (`python -m pipeline.degrees` checks the files); `export.py` writes `degrees/index.json` and
`degrees/<id>.json` (19 groups, 1,063 courses, 0 unknown codes, 282 KB). pytest 175/175 (9 new: real files valid,
every schema error reported, double-counting rules, alternatives and sequences, FIN 400-499 with exclusions and caps,
a course in two groups, unknown codes logged, export, latest-term catalog).

### Phase 5 — My courses and the degree checklist (done)

`/degree/` (`components/DegreeChecklist.tsx`, `lib/mycourses.ts`, `lib/degree.ts`), Degree link in the header. Manual
check (not committed): Finance + Data Science with STAT 107, CMN 101, ECON 102, ECON 103, BUS 101 completed and AP
credit for MATH 220/221/234 shows 3 of 19 done (calculus, QR, social and behavioral sciences), business core 4 of 14 and
data science fundamentals 1 of 3 partly done; ECON 102/103 count for both the business core and social sciences; MATH
221 and 234 count nowhere else (one calculus is required). Checks: Vitest 79/79 (11 new for the evaluator and the
URL format), Playwright 38/39 (6 new in `degree.spec.ts`; the one failure is the Windows-only test), Lighthouse
`/degree/` median of 3: 0.97 / 1.00 / 1.00, CLS 0.

### Phase 6 — best-pick score (done)

`web/lib/score.ts` (formula in DECISIONS D13.18) used for the course header, the professor sort, the gen-ed finder (new
score column and default sort) and the degree checklist, each with a breakdown popover; `WeightsControl` lets students
set the six weights (saved in the browser). The schedule builder's RMP weight shrinks few-rating professors like the
score (D13.19). Checks: Vitest 82/82 (score shrinkage, missing data, weights, saved weights, gen-ed score sort, schedule
regression), affected Playwright specs 19/19 on one worker.

### Phase 7 — final-exam conflicts (done)

`pipeline/availability.py` (`parse_final_exams`, weekly fetch in `crawl_slow`, load in `apply_files`), `final_exams`
table, `fx` on exported sections, `finalClashes` in `web/lib/schedule.ts` (shown with the builder's other warnings),
final times on course-page section rows. The next run of the daily availability workflow starts filling the files; no
workflow change was needed. Checks: pytest 178/178 (parser on two real responses, weekly fetch with the htmx header,
DB + export), Vitest 84/84 (overlap, different days, back-to-back, make-up slots).

### Finish (2026-11-16)

- Issue from the first look at the repo: the section-bundle rule exists in Python (`export.bundles`) and TypeScript
  (`buildBundles`); `fixtures/bundle-parity.json` is now checked by both test suites (DECISIONS D13.22).
- Keyboard: Playwright opens and closes a professor row with Enter, opens a source popover on focus and closes it with
  Escape, and adds a course on `/degree/` with Enter.
- Final checks on the full build (7,147 pages): pytest 179/179, Vitest 85/85, ruff/mypy/ESLint/tsc clean, Playwright
  40/41 on one worker (the failure is the Windows-only lower-case URL test, which passes on GitHub's Linux runners).
  Lighthouse, one run each: `/course/CS/124/` 0.98 / 1.00 / 1.00, `/degree/` 0.97 / 1.00 / 1.00 (colour contrast pass,
  CLS 0.001 and 0). Every page is exactly 375px wide at 375px (no sideways scroll).
- After screenshots: `docs/screenshots/after/` (the Phase 0 pages plus `/degree/` with an example course list).
- To keep a laptop quiet while working on this repo: iterate with `PAGES_LIMIT=5 npm run build`, run Playwright with
  `--workers=1`, and stop `serve` when done. A full build writes ~28,600 files; if the repo sits in a synced folder
  (OneDrive, Dropbox), pause syncing while building.

## After v0.2.0: the owner's review of the live site (2026-11-16)

- Deploy failure after PR #3: the `/degree/` keyboard test typed a course before the course list had loaded. The Add
  button is now disabled until it has, and the test waits for the checklist.
- Gen-ed finder: several categories now mean "counts for all of them" (D13.23), results are a ruled table with every
  column visible at desktop width and sideways scrolling inside its own box on a phone (D13.24). Found on the way: the
  table's screen-reader caption made the whole page 768px wide at 375px; the scroll boxes (gen-ed table and professor
  comparison) are now positioned so hidden text stays inside them.
- RMP: CS 173's Daniel Gonzalez is "Gonzalez Cedre" on RMP (2.9, 18 ratings); the matcher now accepts compound RMP
  surnames (D13.27). Checked with a live lookup; the deploy's RMP step picks him up on the next run.
- Fonts and footer: Source Sans 3 only (D13.25); Illini Blue footer pinned to the bottom (D13.26).
- Degree planner: all 171 undergraduate programs imported from the catalog (D13.28), grouped by college in the program
  menu, with a notice on imported programs and prose rules shown in the catalog's words with their course lists.
  Shared gen-ed course file keeps degree data at 3 MB (D13.29). 288 course codes in 71 programs aren't in the terms the
  site loads (old or rarely offered courses); `python -m pipeline.degrees` lists them.
- Checks: pytest 186/186 (5 importer tests on two saved catalog pages), Vitest 86/86, ruff/mypy/ESLint/tsc clean.
  Playwright on the full build, one worker: 41 passed, 2 failed (the Windows-only lower-case URL test, and a new
  degree test that counted options before they loaded, since fixed). After the last changes the affected specs
  (gen-ed, degree, schedule, professors: 21 tests) were rerun on a light build and all pass.

## Repo cleanup (2026-11-16)

- Docs moved into `docs/` (DECISIONS, DESIGN, PROGRESS, the degree data format as DEGREE-DATA.md, and the new
  LIMITATIONS and IDEAS), with an index in `docs/README.md` and links from the main README. References in code
  comments point at the new paths.
- Removed the early `screenshots/` folder (2026-11-04 pages, superseded by `docs/screenshots/before/`).
- Screenshots: `after/` retaken for v0.3.0 (one typeface, new footer, gen-ed table) and `degree` added to the
  script's default pages. The script now caps a shot at 4,000 px tall on desktop and 8,000 px on a phone, and every
  PNG is reduced to 256 colours: tracked screenshots went from about 27 MB to 4.4 MB. Git history still holds the old
  images; rewriting history to drop them would need a force push to main, so it wasn't done.

## v0.4.0 (2026-11-17)

The owner asked for: better docs; search by CRN; a better structured home page; a schedule builder where every filter
and "what matters to you" is properly customisable; a nav with two words per item and dividers; Reddit feedback in
the ideas doc; a logo that doesn't look generated; a real-time Just opened page; and gen-ed finder fixes (the "Counts
for" column, no schedule filters, open sections shown by default). Decisions: DECISIONS.md D14.1 to D14.12.

- **Search by CRN** (D14.1): `crns.json` (25,010 sections of Spring 2027 and Fall 2026), loaded only for digit
  queries. Course pages open on `#crn-…` with the section highlighted; in the builder a CRN adds the course with that
  section locked.
- **Just opened, near real time** (D14.2 to D14.4): `pipeline/live_seats.py` + `.github/workflows/live-seats.yml`, a
  single-commit `live-seats` branch, and `web/lib/live.ts` polling it every 2 minutes. Tried locally against Course
  Explorer with a 15-second budget: 8 busy courses re-read, 111 real status changes found (the local daily file was a
  day old). The page shows when each change was found, whether the section is still open, CRN copy, "Add this
  section", "Only my schedule's courses" and optional notifications; without the live file it says "Daily".
- **Navigation and logo** (D14.7, D14.8): Course search, Gen-ed finder, Degree checklist, Just opened, Schedule builder,
  with dividers, icons and the current page marked; a Menu button below 1024px. New mark and wordmark, new favicon.
- **Home page** (D14.9): search with CRNs, build numbers, the live Just opened panel, the four other pages with the
  question each answers, your saved courses and "How it works".
- **Gen-ed finder** (D14.5, D14.6): time filters removed, open sections on by default, short category chips one per
  line in "Counts for", the table fits its box at 1280px (measured: 846 of 846 px).
- **Schedule builder** (D14.10 to D14.12): Must-haves (start and end times, any days off, lunch break, open sections
  only, special sections, blocked times) and What matters to you (8 sliders labelled Off to High, custom "too early" and
  "too late" times, 5 presets); results update as you change things after the first run, with six numbers per schedule,
  seat status per section, days off shaded and a table comparing the top schedules. Old share links still open.
- **Docs:** README restructured around the pages; docs index with releases; LIMITATIONS, IDEAS (new section on Reddit
  feedback), DESIGN Part 4, DEGREE-DATA example; screenshots in `after/` retaken.
- **Tests added:** `pipeline/tests/test_live_seats.py` (busy-course choice and rotation, one event per change, stop on
  pushback, the published file), the CRN index in `test_export.py`, `web/tests/unit/crn.test.ts` (CRN search, merging
  live and daily events), new schedule tests (open-only, open weight, late weight, lunch break), prefs round trip with
  the new fields and old links, and `web/tests/e2e/v040.spec.ts` (CRN search to course page and into the builder, nav,
  live and daily states of Just opened, gen-ed defaults and chips, builder must-haves surviving reload).
- **Fixed on the way:** two e2e tests read the URL once instead of waiting for it to update (a race on slow runs), and
  the hand-checked degree file pointed at an old schema path.
