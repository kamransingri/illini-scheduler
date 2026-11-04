# Progress

## Final summary

**Live URL:** none yet; the repo still needs to be created and pushed (Needs a human #1, below). **Run locally:**
`pip install -r requirements.txt && (cd web && npm ci) && make data && make build && make serve`, then open
http://localhost:4173.

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

**Known issues:**
- RMP data is not included: the host was blocked here. The client is built and tested, and the site says
  "RMP unavailable" with search links. It fills in once the nightly workflow runs on GitHub.
- Spring 2027 seat status isn't published in the snapshot (taken before registration opened), so the site says
  "Not published" and links to live seats. Fall 2026 status is from 2026-03-25.
- Exam/grading profiles are thin (66), because section notes, RMP reviews and student notes were unavailable.
- .ics instruction dates are estimates (`web/lib/terms.ts`).
- STAT instructor-to-GPA match rate is 78.9% on lecture sections (target 80%): new instructors and real ambiguity.
- Search has no typo tolerance; near-duplicate schedules that differ only by a same-time section still appear
  separately; renumbered courses aren't linked.

## Needs a human

1. **Create the private GitHub repo and push.** This session could not create repos (token is bound to
   pre-attached repos). From the project root:
   `gh repo create illini-scheduler --private --source . --push`
   Then enable Pages with the Actions source: `gh api -X POST repos/<owner>/illini-scheduler/pages -f build_type=workflow`
   (or Settings → Pages → Source: GitHub Actions), and run `gh workflow run pages.yml`.
   **Note:** GitHub Pages on a *private* repository needs a paid plan (GitHub Pro/Team). On a free plan, either make
   the repo public or keep it private and run the site locally (`make build && make serve`).
2. **Network access for live sources (optional).** This session's network blocked `courses.illinois.edu`
   and `www.ratemyprofessors.com`. Once pushed, GitHub Actions has open internet and the nightly workflow
   fetches both.
3. **Spot-check against the live Course Explorer page.** `courses.illinois.edu` was blocked here, so the MATH 221
   spot check (Phase 1) compared the DB to the raw upstream CSV instead of the live web page.
4. **Compare against Wade's visualizations.** `waf.web.engr.illinois.edu` / `waf.cs.illinois.edu` were blocked,
   so the Phase 2 (grade disparity) and Phase 7 (gen-ed by GPA) comparisons with those pages are still to do.
5. **RMP verification.** `www.ratemyprofessors.com` was blocked, so no RMP data was fetched and the 5 manual match
   checks were not possible. Once the nightly workflow runs on GitHub, open 5 random instructors' RMP links and
   confirm they are the right person.

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
