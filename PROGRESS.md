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
