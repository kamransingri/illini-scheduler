# Progress

## Needs a human

1. **Create the private GitHub repo and push.** This session could not create repos (token is bound to
   pre-attached repos). Run, from the project root:
   `gh repo create illini-scheduler --private --source . --push`
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
