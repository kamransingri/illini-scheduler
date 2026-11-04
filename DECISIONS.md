# Decisions

Every judgment call made during the autonomous build, newest phase last.

## Phase 0

- **D0.1 Public repo.** The doc says `gh repo create --public`. The owner first asked for a private repo, then
  switched to public so GitHub Pages works on a free plan (Pages on a private repo needs GitHub Pro/Team).
- **D0.2 No GitHub remote from this session.** The cloud session's GitHub token is scoped to repositories
  attached at session start; `POST /user/repos` is refused (403, "sessions are bound to their configured
  repositories") and attaching another repo was refused by the session's permission policy. Work happens in a
  local git repo at `/home/user/illini-scheduler`; "create the repo and push" is in Needs a human.
- **D0.3 Network.** `courses.illinois.edu` and `www.ratemyprofessors.com` are denied by this session's egress
  policy (proxy 403 on CONNECT). `raw.githubusercontent.com`, `github.com`, PyPI and npm work. With no remote,
  the GitHub Actions fetch fallback cannot run here, so:
  - **Course Explorer data comes from Wade Fagen-Ulmschneider's `course-catalog/` mirror** in
    `wadefagen/datasets` (a CSV per term, scraped from the same Course Explorer API: CRN, section, type,
    times, days, room, building, instructors, enrollment status, description, degree attributes). This is
    real data, not a stand-in. The direct XML crawler (`pipeline/course_explorer.py --source api`) is also
    implemented and will be used automatically where the network allows (GitHub Actions).
  - **RMP** cannot be reached; the client is implemented and cached, the pipeline records
    "RMP unavailable", and the UI links out to RMP search instead of showing numbers.
- **D0.4 Python 3.13** is what the container has (doc says 3.11+). CI pins 3.11 to prove the floor.
- **D0.5 Web toolchain pins.** Next 15.5 (App Router, static export), React 19.1, TypeScript 5.9,
  Tailwind 4.1, Vitest 3.2, ESLint 9 + eslint-config-next 15. Newer majors (TS 7, ESLint 10, Next 16) were
  skipped to avoid compatibility churn. `@playwright/test` is pinned to 1.63.0 to match the pre-installed
  Chromium (no browser re-install).
- **D0.6 Generated data is not committed.** `data/raw/`, `data/illini.db` and `web/public/data/` are
  rebuilt by `make data` (local and in the nightly workflow), keeping the repo small. Small, real samples for
  the four reference courses are committed under `fixtures/` so tests run offline.

## Phase 1 — Course Explorer ingestion

- **D1.1 Terms.** Current term = Fall 2026 (`2026-fa`); next published term = Spring 2027 (`2027-sp`). The pipeline
  loads 14 terms (Fall 2022 to Spring 2027, including summers) so Phase 4 has offering history.
- **D1.2 Fields stored** (from the Course Explorer schema, as exposed by the XML `mode=cascade` course document and
  by the CSV mirror's columns): term, CRN, subject, number, section number, status code, part of term, section
  status, enrollment status, section title, section credit hours, section text, section notes; per meeting: type
  code + name, start, end, days, room, building, instructors. Course level: label, description, credit hours,
  courseSectionInformation, sectionDegreeAttributes (gen-ed), classScheduleInformation. The XSD on the docs page
  could not be read (host blocked); the list comes from the CSV mirror's columns, which the mirror's scraper takes
  1:1 from that XML. `section_text` / `section_notes` are only present in API mode; the CSV mirror leaves them blank.
- **D1.3 Linked-section rule.** A section is `primary` unless all its meetings are secondary types
  (DIS, OD, LAB, LBD, OLB, Q, PR). If every section code starts with two letters and some first-letter group holds
  two or more components (e.g. `AL1` + `AD1..ADn`, `EL1` + `EDA..EDN`), sections link only within that group.
  Otherwise any primary pairs with any secondary of each needed type (`*`, e.g. STAT 107 `L1/L2` + `Y01..`).
  Courses with only one component (RHET 105: every LCD/ONL section is standalone) have one-section bundles. A CRN
  with several meetings (e.g. lecture + lab in one CRN) is one section with a `meetings` list.
- **D1.4 Extra `meetings` table.** The spec's `sections` row holds one time/place; multi-meeting CRNs (692 rows in
  Spring 2027) need all of them for conflict checks, so `sections` keeps the primary meeting and `meetings` has all.
- **D1.5 Type codes.** Course Explorer uses numbered variants (`S1`, `L2`, `E3`, `BD1`...). Types are normalised by
  their *name* (Lecture-Discussion -> LCD, Online -> ONL, ...).
- **D1.6 "At least one LEC" for CS 124** is read as "a lecture-type section": in both loaded terms CS 124's lectures
  are `OLC` (Online Lecture), so the test accepts LEC/LCD/OLC/OLD.
- **D1.7 Enrollment status freshness.** The CSV mirror's snapshot date is the upstream commit date of that term's
  file (Spring 2027: 2026-10-30, before registration opened, so status is blank; Fall 2026: 2026-03-25). The UI
  shows that date as "checked at" and always links to live seats.
- **D1.8 Mixed encodings.** The GPA and gen-ed CSVs mix UTF-8 lines with Windows-1252 lines; `pipeline/textio.py`
  decodes line by line.
- **D1.9 Handmade XML fixtures.** `fixtures/course-explorer/HANDMADE_*.xml` are generated from the real CSV slice
  in the documented XML layout so the XML parser is tested offline; a test asserts the XML and CSV parsers agree.

## Phase 2 — GPA and grade disparity

- **D2.1 Real columns** of `gpa/uiuc-gpa-dataset.csv`: Year, Term, YearTerm, Subject, Number, Course Title,
  Sched Type, A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, W, Students, Primary Instructor. 110,326 rows,
  terms 2005-fa to 2026-su (upstream updated 2026-10-29). `Students` = graded students (W not included).
  Gen-ed file is `geneds/gened-courses.csv` (not `uiuc-geneds-dataset.csv` as the plan said): Year, Term,
  TermYear, Course, Course Title, ACP, CS, HUM, NAT, QR, SBS; Spring 2027 only, 926 courses.
- **D2.2 Windows.** `avg_gpa` covers Fall 2015 onward (ten years; older grading would skew the averages).
  `recent_avg_gpa` covers the last 8 regular terms in the dataset (Fall 2022 to Spring 2026). Both ranges travel
  with every number to the UI.
- **D2.3 Grade disparity delta** = the instructor's GPA minus the course GPA *in the same terms*, weighted by the
  instructor's students. A plain "instructor avg minus all-time course avg" would penalise anyone who taught
  before grade inflation. Instructors with < 60 students are flagged `limited_data`.
- **D2.4 Percent buckets** (A/B/C/DF) are shares of graded students; W% is W / (graded + W).
- **D2.5 RHET 105 has no GPA data in the window.** Its sections hold at most 20 students, and FERPA exclusions drop
  those from the dataset after 2013. The UI says "No grade data" and doesn't borrow numbers from other courses.
- **D2.6 Instructor identity** for GPA rows is `names.instructor_key` ("last|first"); see Phase 3.

## Phase 3 — Instructor matching and Rate My Professors

- **D3.1 instructor_key** = `last|first` (letters only, accents stripped, suffixes dropped) when a first name is
  known, else `last|initial`. GPA-dataset identities always have first names, so Course Explorer names
  (`Last, F`) link to them through `InstructorMatcher`; unlinked names get a `last|initial` key of their own.
- **D3.2 Truncation.** The GPA dataset cuts last names at 15 characters ("Fagen-Ulmschnei", "de la Garza Val").
  A 15-character raw last name may prefix-match a longer one (letters only, at least 8 letters).
- **D3.3 Matching order.** (1) `data/name_overrides.csv`; (2) same subject, last name + compatible first
  name/initial; ties go to whoever taught that exact course most recently; still tied -> logged, not linked;
  (3) no candidate in the subject -> accept a *unique* global match (cross-listed courses are often recorded
  under one subject only, e.g. STAT/CS 107); several -> logged. Everything not linked goes to `data/unmatched.csv`.
- **D3.4 Match-rate denominator.** The GPA dataset only names the *primary* instructor of record, so TAs leading
  discussions/labs can never match. The report shows both "all names" and "names on primary (lecture) sections".
- **D3.5 RMP.** Implemented per spec (school id from RMP's own search, exact last name + compatible first name +
  plausible department, two-person initial collisions are not guessed, 2 concurrent / 0.5 s delay, 7-day cache,
  3 snippets ≤ 200 chars). The host is blocked here, so `meta.rmp_status = unavailable` and the UI links to RMP's
  search page. Tests use HANDMADE fixtures with invented placeholder values.
- **D3.6 Teachers Ranked as Excellent.** Instructor-role rows since Fall 2020 are joined on (last name, course
  number, compatible initial) among instructors who taught that number; only unique matches get a badge.

## Phase 4 — Offering history and course changes

- **D4.1 History window.** The last 8 regular terms *published* (Fall 2023 to Spring 2027) plus the last 3 summers.
  Course Explorer only publishes one term ahead, so the prediction targets the first unpublished term
  (**Fall 2027**). For Spring 2027 the UI uses the published schedule directly ("Offered in Spring 2027: yes/no").
- **D4.2 Labels.** Every fall and spring / Fall only / Spring only / Fall|Spring, odd|even years /
  Almost every fall and spring (7 of 8) / Irregular (k of the last 8) / Summer only / Not offered recently, with
  ", plus summers" when it ran in at least 2 of the last 3 summers.
- **D4.3 Prediction.** High = ran every time in that season in the window (or matches an odd/even-year pattern);
  Medium = at least half the time and at least once in the last 4 regular terms; otherwise Low. The reason string
  says which.
- **D4.4 Changes** compare consecutive *regular* offerings (summer listings often differ in format) over the whole
  window, so the UI can show a timeline. Text is compared after lower-casing and stripping punctuation/whitespace;
  long text gets a word-level diff. Delivery mode buckets primary sections by online share (≥ 90% online,
  ≤ 10% in-person, else hybrid) and needs a 30-point swing to count. "New instructor" is only computed for the
  latest offering against all earlier ones (more than 3 new names collapse into one line), because multi-section
  courses like RHET 105 rotate dozens of instructors every term.
- **D4.5 Prerequisite summaries** say "now lists CS 413", not "now requires", because most UIUC prerequisite
  lists are alternatives ("One of CS 173, CS 413, ...").
- **D4.6 Renumbering** isn't detected; there's no structured link between old and new numbers in the data. Known gap.

## Phase 5 — Exam and grading format

- **D5.1 Schema.** n_midterms, has_final (yes / no / optional), exam_mode (in-person / CBTF / online / take-home),
  curve (yes / no), attendance_required, homework_platform (list), group_projects, textbook_required. Each field
  stores value, agree, total and up to 4 evidence items (source, quote ≤ 120 chars).
- **D5.2 Rules.** Negative patterns ("no final", "not curved", "attendance is not mandatory") are checked
  before positive ones within a sentence. Rules are written to avoid domain false positives found in real
  descriptions: "curve fitting", "normal curve", "take-home devices", "computer-based testing" (as a topic) and
  "ALEKS placement score" don't count.
- **D5.3 Sources available in this build.** Course descriptions and section info (real). Section text/notes need
  the XML API, and RMP reviews need ratemyprofessors.com; both were blocked. No student notes have been
  submitted, so `data/notes/` ships with only a README (no invented notes). Result: 66 course/instructor profiles
  with at least one supported field. Everything else is "unknown", which the UI says plainly.
- **D5.4 Course-level evidence** (description) applies to every instructor of that course and is stored under the
  `*` key too, so the course page can show it when no instructor-specific evidence exists.
- **D5.5 Clipped names.** The GPA dataset cuts "Primary Instructor" at 25 characters ("Driggs-Campbell, Katherin").
  When a lone first name might be clipped, the display uses the initial.

## Phase 6 — Course search and course page

- **D6.1 Hybrid rendering.** 7,026 course pages are pre-rendered (`generateStaticParams`) with the header and the
  "Before you register" summary in the HTML. Sections, instructor cards, chart, changes and notes render
  client-side from `data/course/{SUBJ}/{NUM}.json`. Server-rendering everything would roughly double each page
  (HTML + RSC payload) for 7,000 pages. Full build: 34 s, 294 MB including 45 MB of JSON.
- **D6.2 Default term** on a course page = next term (Spring 2027) when the course has sections then, else the
  latest term it has (e.g. MATH 221 opens on Fall 2026 with "Not offered in Spring 2027").
- **D6.3 Seat status.** The Spring 2027 snapshot predates registration, so status reads "Not published" with the
  snapshot date and a "Check live seats" link per section (Course Explorer `?sectionId=CRN`). "% sections open"
  appears only when status is known; otherwise the summary shows the number of lecture sections listed.
- **D6.4 Mobile layout.** Sections render as a responsive grid that becomes stacked cards below 768px, so there is no
  horizontal scrolling at 375px (no wide `<table>`).
- **D6.5 Source on hover.** `<Metric>` shows source + term range + sample size in a tooltip on hover and keyboard
  focus (and as `title`).
- **D6.6 RMP link-out** uses RMP's generic search (`/search/professors?q=<name> University of Illinois`), so no
  school id is guessed or hard-coded.
- **D6.7 "Suggest a note"** opens a prefilled issue at `https://github.com/kamransingri/illini-scheduler/issues/new`
  (label `student-note`). It works once the repo exists (Needs a human #1).

## Phase 7 — Gen-ed finder

- **D7.1 Rows** = every course with a gen-ed code (UIUC gen-ed list for Spring 2027, merged with the codes parsed from
  Course Explorer "Degree Attributes") that has a page: 841 courses, including ones not offered in Spring 2027
  (shown "Not offered") so the "next term only" filter has a purpose.
- **D7.2 Category filter** selects gen-ed *codes* (HP, LA, NW, ...) grouped by category; a course matches if it
  has any selected code. "Double-dips" = 2+ categories.
- **D7.3 "Open next term"** uses published seat status when known; Spring 2027 status isn't published yet, so it
  becomes "Has sections in Spring 2027" and the label says so.
- **D7.4 Time filters** (no 8am, no Friday, online only) pass if *some* valid section bundle (lecture + linked
  sections) satisfies them; the bundle summaries are precomputed in the export.
- **D7.5 Small samples.** A "GPA from 200+ students" filter keeps tiny courses (n=23) from topping the GPA sort;
  every row shows n.
- **D7.6 HTML entities.** Upstream titles contain `&amp;` etc.; the pipeline now decodes them (`html.unescape`).

## Phase 8 — Schedule builder

- **D8.1 Bundles** reuse the Phase 1 link rule (one section per component inside a link group). Sections with
  status code `P` (pending) are skipped. Bundles with identical meeting times, parts of term and campus areas are
  merged (the best by GPA/RMP is shown, with "+N same-time options"), which shrinks the search a lot (RHET 105:
  106 sections become 24 bundles).
- **D8.2 Conflicts.** Overlap on a shared day = conflict; online/arranged never conflict; first-half (A) and
  second-half (B) sections never conflict with each other. Back-to-back = gap ≤ 10 minutes (UIUC's passing
  period); it counts as a "rushed walk" only when the two buildings are in different coarse campus areas
  (`lib/campus.ts`: Engineering, Main Quad, South, East; unknown buildings never count).
- **D8.3 Search.** Exact branch-and-bound: courses with the fewest bundles first, best bundles first, and a
  pairwise conflict/walk table precomputed once. Bounds: days used, early days and rushed walks only grow;
  GPA/RMP take each remaining course's best bundle; compactness counts as perfect. A heavy 6-course cart (PHYS 211,
  RHET 105, CHEM 102, MATH 231, CS 124, ECON 102: 3.1 M combinations) is solved exactly in about 0.5 s. A 1.5 s
  budget is the safety net (the UI says when it stopped early).
- **D8.4 Rules vs preferences.** "No classes before", "No Friday" and blocked times are hard filters (the
  acceptance test needs *no* 8am at all); the six weights (GPA, RMP, before-10am days, days off, gaps, walks) are
  0-3 sliders. Expected GPA = credit-weighted instructor GPA for that course (limited-data instructors skipped),
  falling back to the course GPA.
- **D8.5 .ics** uses America/Chicago with a VTIMEZONE, weekly RRULE with UNTIL in UTC, half-term sections clipped
  to their half, and the break week removed with EXDATE. Instruction dates are **estimates**
  (`web/lib/terms.ts`; the academic calendar page was blocked) and the UI says so.
- **D8.6 Cart** lives in localStorage and in the URL (`?c=CS124,MATH231!12345&t=2027-sp`; `!CRN` = locked).
  A URL with `c` replaces the stored cart so shared links open exactly.

## Final QA — fixes from the independent reviewer

- **D9.1 Impossible schedules explain themselves.** When nothing fits, the builder lists course pairs that can
  never coexist ("GER 261 (TR 11:00am–12:20pm) always overlaps STAT 200 ..."). When one course can't fit, it says
  why (invalid locked pair, only special sections left, or which rules exclude it), and the schedules are labelled
  "(without X)" instead of looking complete.
- **D9.2 Share links don't overwrite your list.** If you already have a saved list, a shared link is shown with
  "Use this list / Back to my list". Links now carry the rules (`e`, `nf`, `b`, `w`, `sp`) and the open schedule
  (`i`), and a link with rules regenerates automatically. Rules are also remembered in localStorage.
- **D9.3 Special sections.** Sections with a symbol in the code (`AD@`) or a lecture whose letter group lacks the
  discussion/lab every other group has (CS 124 `WWC`, `CSP`/online-program sections) are flagged "special" on course
  pages and skipped by the builder unless "Include special sections" is on or the CRN is locked (48 sections in Spring
  2027: 41 lecture-without-discussion, 7 symbol codes).
- **D9.4 Locks** are one select per component (Lecture / Discussion / Lab), so "any section" clears a lock and two
  lectures can't both be locked.
- **D9.5 One GPA basis per number.** Instructor cards show the instructor's all-time GPA (the same basis as the ±
  delta, which compares with the course *in the same terms*), with recent GPA in parentheses. The course figure
  in that section is labelled "All-time course average" with its term range. The summary box keeps the
  recent average and says so.
- **D9.6 Gen-ed finder** keeps filters in the URL (Back, reload and links preserve them), defaults to "Only GPA from
  200+ students" so one-term n=42 courses don't top the list, shows % A, and adds Composition I.
- **D9.7 Smaller fixes:** Enter in the builder's search adds the course; lower-case course URLs redirect; "cs-124"
  parses; "biggest recent change" only looks at the last two terms; "New instructor" wording says "no record of
  teaching it Fall 2022 to Fall 2026"; full last names from Course Explorer replace the GPA dataset's clipped ones;
  the RMP weight is disabled while RMP is unavailable; cart count in the nav; compact mobile nav and calendar labels.
- **D9.8 Not changed:** typo-tolerant search ("calclus") and "calc 2" synonyms, and collapsing near-duplicate
  schedules that differ only by a same-time discussion (they're listed under "Same-time alternatives").
  Known issues.

## Deploy

- **D10.1 Partial Course Explorer failures.** The first GitHub run died on one course page (TAM 416) that kept
  failing. The crawler now tolerates up to 10% failed course pages, fills just those courses from the CSV mirror,
  and falls back to the mirror for the whole term beyond that.
- **D10.2 RMP time budget.** About 3,400 instructors teach next term; at 2 concurrent / 0.5 s that's longer than a
  CI job should run. Each run looks up instructors with the most lecture sections first for up to
  `RMP_BUDGET_SECONDS` (20 min), then uses cached answers only; the 7-day cache (restored by actions/cache) lets
  coverage grow nightly. Coverage is recorded in `meta.rmp_coverage`.
- **D10.3 HTTP 202 from Course Explorer** means "page still being generated": the second GitHub run got it for
  1,180 of 4,450 Fall 2026 cascade pages. The crawler now waits with a capped backoff (up to 8 tries) and makes a
  second pass over failed pages after 30 s before falling back to the mirror.
- **D10.4 RMP loop crash** (`KeyError`) for instructors matched to GPA rows older than the stats window: they now
  get an identity from their Course Explorer name. Regression test added. This only appeared with real RMP access.
