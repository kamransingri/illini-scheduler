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
- **D10.5 First successful refresh on GitHub** (run 41771969328): Fall 2026 came live from the Course Explorer API
  (12,835 sections). For Spring 2027, 3,054 of 4,516 cascade pages were still "being generated" (HTTP 202) even
  after the second pass, so that term fell back to the mirror (snapshot 2026-10-30), as designed. RMP worked: 20 min
  of lookups, exam profiles went from 66 to 530. The RMP cache is now saved even when later steps fail (separate
  restore/save steps), so lookups are never thrown away.
- **D10.6 RMP access and `tisuela/ratemyprof-api`.** Early in the build, this session's network policy blocked
  `www.ratemyprofessors.com` (proxy 403), so RMP could only run on GitHub Actions. The allowlist now includes it
  (the bare `ratemyprofessors.com` is still blocked but unused). The suggested library scrapes the legacy
  `/filter/professor/?...&sid=` endpoint, which now returns **404**; RMP moved to the GraphQL API our client already
  uses, so the library wasn't adopted. Two fixes came from verifying real data: a profile with 0 ratings is shown as
  "no ratings yet" (RMP reports it as 0.0, which read as a terrible score), and name searches return 20 results
  instead of 8 so common last names ("Thomas, D") don't push the right person off the list.

## After launch

- **D11.1 Seat availability.** The Course Explorer XML feed stopped carrying `enrollmentStatus`, so once Fall 2026
  came from the live API every section read "Not published". The public course page
  (`courses.illinois.edu/schedule/{year}/{season}/{SUBJ}/{NUM}`) still shows "Availability: Open / Closed /
  Open (Restricted) / CrossListOpen / Pending" per section, so `pipeline/availability.py` reads it for the current
  and next term: one page per course, ≤ 4 concurrent requests, retries, a 15-minute budget, about 3 minutes for both
  terms. It never fails the pipeline. "Checked at" is the time of that fetch. **Seat counts (capacity, seats left,
  waitlist) are only in Self-Service behind a NetID login and are never scraped**; the site links there.
- **D11.2 Throttling on GitHub.** The first deploy with availability read Fall 2026 for only 4,735 sections and
  Spring 2027 for none. Pages failed right after the Course Explorer API crawl had made thousands of
  "still generating" (HTTP 202) retries. The same requests work from elsewhere, so the runner was most likely
  throttled. Changes: the API crawl probes 60 pages first and skips straight to the mirror if more than 30% aren't
  ready; availability uses 2 concurrent requests, pauses all workers on 429/503 (honouring Retry-After), retries
  failures once after a 60 s cool-down, and logs the failure reasons. A section without a status in a term that has
  statuses shows "Unknown" (not "Not published").
- **D11.3 Separate, slow availability job.** Even with backoff, the nightly build got HTTP 202 for most Course
  Explorer pages (26,644 refusals for Fall, 34,412 for Spring) while the same pages loaded fine from elsewhere. So:
  `.github/workflows/availability.yml` runs daily at 04:17 UTC for up to 4.5 h, reading about one page per second,
  next term first, oldest-checked courses first. It cools down 15 s after a refusal and 5 min after 10 in a row,
  saves progress every 100 pages, and commits `data/availability/<term>.json` (CRN → status + time checked). The
  nightly site build reads those files (`AVAILABILITY_MODE=file`) and no longer calls the Course Explorer XML feed
  (`SOURCE=csv`): sections come from the mirror. Each section's badge shows when it was checked (on hover). The
  first files were seeded from the build session, which Course Explorer doesn't throttle.

## Next steps 1–3 (2026-11-05)

- **D12.1 Sections from the course pages.** The slow availability job now parses the whole Course Explorer course
  page (`parse_course_page`): title, credits, description, gen-eds and every section row with all its meetings
  (type, code, times, days, room/building, instructors), part of term and section notes / restrictions. The nightly
  build replaces the mirror's sections for every course the job has read (`apply_web_rows`) and adds courses that
  aren't in the mirror. The job also discovers courses from Course Explorer's subject index, falling back to the
  mirror's list if that index can't be read. Example of why it matters: CS 124's WWC section meets W 4:00 and
  M 5:00 per Course Explorer; the March mirror said M/R 4:30. The XML API crawler stays for local use only.
- **D12.2 Special sections from notes.** Only special-program wording ("is for students at…", "learning community",
  "reserved for", "only for students") marks a section special. Ordinary "Restricted to <majors>" doesn't; that
  shows as the Restricted status instead. Section notes appear under each section row.
- **D12.3 Seat-change history.** Each section keeps `[status, checked_at, since]`; a status change appends an
  event (kept 21 days). Course pages show a "Seat changes" timeline and "since <day>" on recently changed badges.
  Every course gets an RSS feed (`data/feeds/{SUBJ}/{NUM}.xml`) for watching seats in a feed reader or a
  Slack/Discord feed bot. A **Just opened** page lists the last week's openings, filterable by term and subject.
  A static site can't send email/push itself; RSS is the no-backend way to alert. Checks are about daily, so every
  surface says to confirm in Self-Service.
- **D12.4 Search.** Typo tolerance (edit distance ≤ 1 for 4–7 letters, ≤ 2 for 8+, adjacent swaps count as one)
  on title words and instructor last names; a small alias table ("calc 2" → MATH 231, "intro cs" → CS 124, ...),
  each checked against real titles. A code-like query whose "subject" doesn't exist ("calc 2") is not treated as a
  course code.
- **D12.5 CI hygiene.** Actions moved to their current majors (checkout/setup-python/setup-node v7, cache v6,
  upload-pages-artifact/deploy-pages v5), runners pinned to `ubuntu-24.04`, `next lint` replaced by the ESLint CLI,
  and the build runs Lighthouse on a course page (fails below performance 0.80 or accessibility 0.90).
- **D12.6 Lighthouse in CI uses the median of 3 runs.** The first gated build scored performance 0.76 on GitHub's
  runner; locally the same page scored 0.89 and 0.99 on back-to-back runs, with only total blocking time moving
  (shared-CPU noise). Thresholds are unchanged.
- **D12.7 The data-summary commit can't block a deploy.** A run failed because main moved while it ran and its push
  was rejected. The step now rebases and retries 3 times and is `continue-on-error`.
- **D12.8 Co-instructors.** Course Explorer separates co-instructors with `<br/>` inside one cell; the first parser
  joined them ("Choi, Y Lee, S Malvandi, A", 737 Spring courses affected), which the instructor count on the live
  site gave away (3,059 instead of ~3,300). The parser now reads text nodes; names already stored are repaired with
  a "Last, Initial" splitter when the build loads them (no re-crawl needed). Spring 2027 now has 3,307 instructor
  names from the pages, 3,215 of them also in the mirror.

## Redesign and degree planner (2026-11-16)

- **D13.1 RMP partial failures.** RMP answered one teacher search ("Cheslow") with an error from its own search backend
  and `teachers: null`. The client only treated a response with *no* data as a failure, so it cached this one for 7
  days and `search_teachers` crashed, which stopped `make data` (and would have stopped every run for a week). Now a
  response with `errors` is never cached and a null result is "no match this run"; the next run retries it. This is
  the only change to `pipeline/rmp.py`.
- **D13.2 Windows.** The RSS feeds are written as UTF-8 explicitly (the default locale encoding on Windows, cp1252,
  can't encode "→"). Everything else the pipeline writes is ASCII JSON.
- **D13.3 Visual direction** (DESIGN.md). Illinois brand web palette and fonts (Source Sans 3 + Montserrat, self-hosted
  through `next/font` at build time, so builds need network access the way `make data` already does). Each colour has
  one meaning: Industrial blue for every link and action, green/red only for above/below the course average, three
  seat colours. Tailwind's type and radius scales are reset so only five sizes and one radius exist.
- **D13.4 Course page around professors.** One row per professor teaching the selected term, on a column grid shared by
  every row: GPA in this course, difference from the course in the same terms, grade bar, RMP quality / difficulty /
  would-take-again with the number of ratings, the Teachers Ranked as Excellent badge, and lectures taught with how
  many are open. The row expands to that professor's sections, grades, tags, reviews, exam notes and RMP link. Only
  instructors of a lecture (primary) section are "professors"; people who only lead discussions or labs are listed
  behind "Discussion and lab instructors (n)" with the same row design (MATH 221 Fall 2026 had 2 lecturers and 17
  discussion instructors as 19 identical cards). Section rows name their professor as a button that opens and scrolls
  to that row. "Compare" shows the same professors as a sortable table.
- **D13.5 Reviews.** Each review shows the course it was written for and its date; reviews for this course come first,
  others are labelled "Written for CS 105" and listed after. Two show by default. The pipeline keeps the 3 most recent
  snippets per professor across all courses (D3.5), so often none are for this course; keeping more would mean
  changing the RMP client, which this work leaves alone (the cached responses already hold 20 ratings, so it would cost
  no extra requests). Listed under Next steps.
- **D13.6 Grades over time** is a table with one horizontal stacked bar per term (newest first) instead of an SVG
  column chart: the SVG's 9-unit labels rendered at about 5px on a 375px phone.
- **D13.7 Sources behind (i).** Every number keeps its source, term range and sample size, now in an `Info` popover that
  opens on hover, keyboard focus and tap (the old dotted-underline tooltip needed a mouse).
- **D13.8 Other pages** (Phase 3) use the same tokens and components with no change in behaviour. Any list of courses
  is a `CourseRow` (search results, gen-ed finder, later the degree checklist). Errors and warnings use an alert icon
  and the neutral panel, not red, because red only means "below the course average". The page grew from 64 to 72rem so
  a course row fits its columns beside the gen-ed filters; rows use container queries, so the same row stacks in the
  schedule builder's 22rem sidebar.
- **D13.9 Schedule builder colours.** Courses keep a colour each in the calendar and cart (categorical, from the brand's
  supporting colours: Industrial, Berry, Arches, Altgeld, Illini Blue, Storm; green and the seat-status hues are left
  out). The cart cards lost their tinted backgrounds; a coloured edge is enough to match the calendar. The lock menus
  dropped the padlock emoji.
- **D13.10 Degree data** lives in `data/degrees/<id>.yaml` (schema in `docs/DEGREE-DATA.md`): requirement groups
  with rules `all`, `n_of`, `hours` and `manual`; items can be a code, a sequence that counts as one ("RHET 101 +
  RHET 102") or a list of alternatives; `from` takes number ranges ("FIN 400-499") and gen-ed codes; `exclude`,
  `max_hours`, `min_from`, `not_with` and `exclusive` cover the catalog's caveats. The first file is the Finance + Data
  Science BS, 2026-2027 catalog, read 2026-11-16, with the campus gen-ed groups the page says apply. Schema errors stop
  `make data`; codes missing from the loaded Course Explorer terms are logged and exported as `unknown`.
- **D13.11 Double counting is data, with its quote.** Each program file lists the rules it rests on, checked in order:
  no course for two Cultural Studies categories, and a Cultural Studies course may count elsewhere
  (gened.illinois.edu/requirements); program courses may count as gen-eds ("Some Gen Ed requirements may be met by
  courses required and/or electives in the program", the program page). Any other pair (two program groups, or two
  non-Cultural-Studies gen-ed categories) is shown as "rules unclear" instead of guessed. "Four additional" 400-level
  Finance courses becomes `not_with: [finance-required]`, so FIN 411 can't count twice.
- **D13.12 Language requirement** is `manual`: high-school study and proficiency exams satisfy it, so a list of courses
  can't decide it. The checklist lets the student tick it.
- **D13.13 Test hygiene.** Python 3.13 warns about SQLite connections left open; ten existing tests never closed theirs
  and the warning surfaced once more tests ran. `pipeline/tests/conftest.py` closes every connection a test opens.
- **D13.14 My courses** (`web/lib/mycourses.ts`) works like the cart: localStorage plus the URL (`?p=<program>&m=STAT107,
  MATH220~c,CS124~p&x=language`; no suffix = completed, `~c` = AP or transfer credit, `~p` = in progress). A shared
  link shows a "Use this list / Back to my list" choice instead of overwriting a saved list. Nothing leaves the browser.
- **D13.15 How the checklist counts** (`web/lib/degree.ts`). Groups are filled in catalog order with completed courses
  before in-progress ones; AP and transfer credit count as completed. A course already used elsewhere counts again only
  when the program's rules allow that pair; when they say no or don't say, it isn't counted twice and the group explains
  why ("the catalog doesn't say whether it can count here too... ask your advisor"). A group met only through
  in-progress courses is "in progress". Variable-credit courses count at their minimum hours, with a note. Options for
  an open group are its missing listed courses, or its eligible list limited to courses offered in the loaded terms,
  ranked by the best-pick score with the course's best next-term professor. Options that would also fill another open
  requirement say so ("Also counts for ..."), or say the catalog is unclear, or that they count for only one.
- **D13.16 Prerequisites are never judged.** If a course's prerequisite text names a course that isn't in My courses (or
  names none), the row shows "Check prerequisites:" with the catalog text; it never says the student is or isn't
  eligible.
- **D13.17 Smaller fixes found on the way.** Bare dates ("2026-11-16") were shown a day early because they were read as
  UTC midnight and printed in Chicago time (this also shifted RMP review dates); badges wrap instead of overflowing a
  phone screen; the checklist waits for the saved list before drawing, so it doesn't shift (CLS 0).
- **D13.18 The best-pick score** (`web/lib/score.ts`, one function for every page). Six parts, each put on 0–1:
  - course GPA *g* (recent, *n* graded students), shrunk toward the subject's student-weighted recent GPA *m*:
    g' = (n·g + 200·m) / (n + 200); part = (g' − 2) / 2. A 23-student 4.0 in a 3.3 subject becomes 3.37.
  - the professor's GPA difference from the course in the same terms *d* (*n* students), shrunk toward 0 (the course
    average): d' = n·d / (n + 150); part = d' + 0.5. A professor with no grade history counts as the course average (0.5)
    rather than being left out, so a brand-new instructor isn't ranked on RMP alone.
  - RMP quality *q*, difficulty and would-take-again, each shrunk toward the UIUC mean over every rated instructor with
    k = 10 ratings: q' = (r·q + 10·mean) / (r + 10); parts = (q' − 1) / 4, (5 − difficulty') / 4, wta' / 100. Three
    ratings of 5.0 become 3.97 with the current mean (3.67).
  - open seats: share of the professor's (else the course's) lecture sections that are open.
  Score = 100 × Σ wᵢ·partᵢ / Σ wᵢ over the parts that have data; a part with no data (no RMP match, no grade data,
  status not published) is left out and named in the breakdown. Default weights: course GPA 2, professor vs course 2,
  quality 2, difficulty 1, would take again 1, open seats 1; each 0–3, set by the student ("Adjust the best pick
  score", saved in the browser). The means come from the data (`meta.score_priors`, D13 export), not constants. A
  course is scored with its best next-term professor; with no professor listed, with the course alone.
- **D13.19 Schedule builder.** Its GPA weight stays as it was: it ranks by the schedule's expected GPA, a number students
  read in the summary, and limited-data instructors are already skipped. Its RMP weight now uses the same shrinkage as
  the score (few ratings pulled toward the UIUC mean), because a professor with two 5.0 ratings beat one with 200 ratings
  of 4.6. All existing schedule tests pass unchanged; a regression test covers that case.
- **D13.20 Gen-ed finder** sorts by the best-pick score by default (`?sort=gpa` and the other sorts still work) and its
  "Best professor" column is the professor the score chose, as on the degree checklist.
- **D13.21 Final exams** (Phase 7). Course Explorer course pages load their final-exam table with htmx from
  `/ajax/finalexam/{year}/{season}/{SUBJ}/{NUM}`; without the `HX-Request: true` header the server redirects. The slow
  availability job reads it right after a course page that lists sections, with the same pacing and backoff as pages,
  and at most once a week per course (`FINALS_DAYS`), so the job's load barely grows. Rows go into the term file
  (`finals`), the `final_exams` table and each exported section (`fx`: date, start, end, type). "Conflict" rows are the
  official make-up slot, not the exam, so they never trigger a warning. The schedule builder warns when two courses'
  main finals overlap on the same day and points to the conflict exam; course pages show each section's final. Spring
  2027 finals aren't published yet, so for now only Fall 2026 has them. Fixtures are real saved responses
  (`fixtures/course-explorer-web/finalexam_2026-fa_*.html`).
- **D13.22 One rule, two copies, one fixture.** The lecture + linked-section bundle rule is implemented in Python (gen-ed
  time filters, `export.bundles`) and TypeScript (the schedule builder, `buildBundles`). Rather than generate one from
  the other, `fixtures/bundle-parity.json` holds shared cases (letter groups, any-with-any, standalone) that both test
  suites check, so a change to one copy fails the other's tests until both agree.

## After v0.2.0 (2026-11-16, owner's review of the live site)

- **D13.23 Gen-ed categories combine with AND.** Picking several gen-ed categories now shows only courses that count
  for every one of them (before: any of them), and an empty list with "No course counts for all of ..." when none does.
- **D13.24 Gen-ed results are a table** with row and column rules (course, every category it counts for with the
  picked ones ticked, score, recent GPA, best professor, RMP, open lectures, add). On a phone the table scrolls
  sideways inside its own box; the page doesn't.
- **D13.25 One typeface.** Montserrat (the geometric headline face) is gone; everything is Source Sans 3, the Illinois
  brand's main face, with heavier weights for headings. One font download instead of two.
- **D13.26 Footer** sits at the bottom of short pages (the body is a full-height column) and uses the header's Illini
  Blue band with the orange rule.
- **D13.27 RMP compound surnames.** CS 173's "Gonzalez, Daniel" is "Daniel Gonzalez Cedre" on RMP; the matcher wanted
  equal surnames, so he had no ratings. An RMP surname of several words now matches when its first word is ours (first
  name and department must still agree); the GPA dataset's 15-letter truncated surnames still match their full form.
- **D13.28 Every undergraduate program.** `pipeline/catalog_import.py` reads the catalog's undergraduate index and each
  program page (and the concentration pages of programs whose requirements live there), 1 request per second, cached
  in `data/raw/catalog`, and writes `data/degrees/<id>.yaml`: 171 programs. It turns only what the tables state into
  rules: required lists ("all"), "or" alternatives, "&" pairs, "Select N of the following", "N hours from". Comment
  rows split a table, so required courses stay required and only the courses after "Select one of the following" are
  a choice. Anything the catalog writes as prose (technical electives, focus areas, concentrations, free electives),
  and any list that follows such prose, becomes a `manual` group showing the catalog's own words and the courses it
  lists, with a checkbox: never a guessed rule. The campus gen-ed table on every page maps to the same gen-ed groups as
  the hand-checked file; the program-and-gen-ed double-counting rule is added only when the page carries that sentence.
  Generated files are marked `generated:` and the page says so; hand-checked files (no `generated:`) are never
  overwritten, and a program a hand-checked file covers is skipped. Course codes outside the loaded terms are logged.
- **D13.29 Degree data size.** Every course with a gen-ed code goes once into `degrees/gened-courses.json` (234 KB);
  each program file keeps only its own listed courses (10–145 KB), and the page fills gen-ed groups' options from the
  shared file. 173 files, 3 MB in all, instead of ~280 KB per program.

## v0.4.0 (2026-11-17, owner's requests)

- **D14.1 Search by CRN.** `pipeline/export.py` writes `crns.json`: every section of the next and current term as
  `{term: {crn: [subject, number, section code, type]}}`, next term first (25,010 sections, 1.1 MB, ~190 KB gzipped).
  It's a separate file because most searches never need it: the search box downloads it only when the query is 3 to 5
  digits (optionally "CRN 31152"). Five digits is an exact match; fewer list the sections that start with them. A hit
  opens the course page at `#crn-31152`, which switches to that section's term, expands the list if it's past the first
  40 rows, scrolls to it and highlights it. In the schedule builder, a CRN adds the course with that section locked (it
  replaces the course's other locks, so the pick is predictable), and "Add this section" buttons do the same.
- **D14.2 Live seat changes without a backend.** Course Explorer sends no cross-origin headers, so a browser can't ask
  it directly, and the site is static. `pipeline/live_seats.py` runs in GitHub Actions (`live-seats.yml`) every 10
  minutes, re-reads the busiest next-term courses for about 6 minutes and force-pushes `live.json` (events from the last
  48 hours plus the latest status of each section in them) and `state.json` (its memory) to a `live-seats` branch that
  always has exactly one commit, so the repo doesn't grow. The page polls `live.json` from raw.githubusercontent.com,
  which allows cross-origin reads and caches for 5 minutes, every 2 minutes while the tab is visible. A change is on
  the page about 5 to 15 minutes after it happens, instead of up to a day. No cache-busting query: every poll would then
  reach GitHub's origin.
- **D14.3 Which courses, and how politely.** "Busy" comes from the daily crawl's term file: recent seat changes (×3),
  closed sections (×2, up to 10), a bonus for any closed section, and size (sections / 4, up to 5). Courses with every
  section open and nothing changing are skipped. Of the top 400, the 60 busiest are re-read every run and the rest
  rotate, least recently re-read first; a run gets through about 240, so those come round every 15 to 20 minutes. One
  request at a time, 1.5 s apart, the project's User-Agent, and the run stops after 5 pushbacks in a row (HTTP 202, 429,
  503). It runs every 30 minutes instead of 10 between 04:00 and 09:00 UTC, while `availability.yml` reads every
  course, so the two jobs together stay under about 2 requests a second.
- **D14.4 One list from two sources.** The daily crawl and the live job can find the same change hours apart. The page
  merges both, walking oldest to newest and dropping an event that only repeats the status already known for that
  section, so the earlier detection wins and open → closed → open stays three events. Each row says when the change was
  found and the section's latest known status ("Still open (4 min ago)", "Now closed"). If `live.json` is missing or
  older than 45 minutes, the page says "Daily" and explains, rather than calling stale data live. "New" marks and the
  optional browser notification only cover changes that arrive while the page is open (no push backend; IDEAS.md 3).
- **D14.5 Gen-ed finder keeps to picking courses.** The time filters (no 8am, no Friday, online only) are gone: times
  and days belong to the schedule builder, which applies them to whole weeks. "Only courses with an open section" is on
  by default (`?nx=0` turns it off); old links with `e`, `nf` or `on` still open, without those filters. The pipeline
  still exports each course's section start times and days (`opts`) and the bundle rule keeps its parity test (D13.22).
- **D14.6 Gen-ed names that fit.** Long names ("Humanities: Lit & Arts") wrapped and stacked in the "Counts for"
  column. Category chips in the filters and the table now use short names under their group headings ("Lit & Arts"
  under "Humanities & the Arts"), one chip per category on its own line, with the full name in the tooltip and for
  screen readers.
- **D14.7 Navigation.** Five pages, two words each, in the order students use them: Course search, Gen-ed finder,
  Degree checklist, Just opened, Schedule builder (with the cart count). Hairline dividers between items, an icon per
  page, and the current page marked with a light fill, bold text and an orange bar that joins the header's orange rule
  (orange stays brand chrome, D13 colour rules). Below 1024px a Menu button opens the same list, one item per row.
  The footer lists the pages too.
- **D14.8 Logo.** The old favicon was a generic calendar glyph. The new mark is the "ili" of Illini drawn as three
  timetable columns: white day strokes, orange squares for the dots of the i's (classes dropped into a week). Flat
  Illini Blue, white and Illinois Orange; deliberately not the Block I, which is the University's trademark. The header
  shows the mark with "**Illini** Scheduler".
- **D14.9 Home page.** Search first (now with CRNs), then four numbers from the build (course pages, courses offered
  next term, gen-eds, professors teaching), the live "Just opened" panel (one row per course so a big course doesn't
  fill it, CRN to copy), the four other pages with the question each answers, where you left off (your saved courses),
  and a three-step "How it works". Ruled rows and one panel, no wall of cards (DESIGN Part 2).
- **D14.10 Schedule builder: must-haves and priorities.** The left column is three blocks: Your courses, Must-haves
  (never broken) and What matters to you (ranking). Must-haves gained a latest end time, any set of days off (replaces
  "No Friday"), a lunch break (45 free minutes between 11am and 2pm on every day with class) and "Open sections only"
  (sections you lock are kept). Priorities gained "Sections open right now" (default Low) and "Avoid classes after"
  (default Off), and both time-based ones take the time the student picks (8am to noon, 3pm to 9pm). Each slider shows
  Off / Low / Medium / High, and five presets set them in one click (Balanced, Best grades, Sleep in, Fewer days on
  campus, Can register now). The branch-and-bound bound stays optimistic for the new terms (late days and open sections
  use the same per-course best case as GPA); the lunch rule is checked on complete schedules only. On a phone the two
  rule blocks start folded with a one-line summary.
- **D14.11 Schedule builder: results.** After the first "Generate schedules", results follow every change (250 ms
  after the last one), since a full run takes well under a second. Each schedule shows six numbers (expected GPA,
  credits, days off, day span, gaps a week, open sections), seat status per section, the days off shaded in the
  calendar, and a table comparing the top schedules with the sections each one changes from the top pick (otherwise
  near-identical rows looked the same).
- **D14.12 Old links keep working.** Builder links from before v0.4.0 used `nf=1` and 6-digit weights; `nf=1` now means
  Friday off and a 6-digit weight string keeps the two new weights at their defaults. New parameters (`l`, `do`, `lu`,
  `oo`, `se`, `sl`) are written only when they differ from the defaults.

## v0.5.0 (2026-11-17, owner's requests)

- **D15.1 Searching for a program.** A select of 171 programs meant scrolling. The picker is now a combobox: type and
  the list filters; open it without typing and every program is there, grouped by college, the current one in the
  middle. A query matches when every word of it matches. Matches score, from highest: an acronym of the name or of
  one part of a joint name ("mcb", "me", "ds" in "Finance + Data Science"), the start of the name, the start of any
  other word, another ending of a long word ("accounting" finds Accountancy), and lastly the college ("gies", "las",
  "engineering" also lists Grainger programs). Ties go to the shorter name, so the plain major comes before its
  "+ X" programs. A short list of nicknames covers what students type and the catalog never says ("cs" means computer
  science, so it finds Statistics & Computer Science and not Crop Sciences; "polisci", "ischool").
  Everything runs on the 171-row index already in the page, so there's nothing extra to download.
- **D15.2 One version, changed only by the tool.** The version lives in `web/package.json`, its lock file and
  `pyproject.toml`; they were bumped by hand and could drift. `tools/release.py` (`make release V=...`) changes all of
  them and the changelog together, and CI fails when they disagree. pyproject keeps PEP 440 spelling (0.6.0b1) for
  pre-releases.
- **D15.3 Keep a Changelog.** CHANGELOG.md, written for people using the site, is the one record of what each version
  brought. The release notes, the docs index and the site footer point to it rather than keeping their own lists. Older
  versions were filled in from the tag messages.
- **D15.4 Tags are made on `main`, by a workflow.** Until v0.4.0 a tag was pushed from the feature branch before the
  pull request was merged, so a tag could point at something that never shipped. Now the version is bumped in the pull
  request and `release.yml` tags the commit that reached `main` and publishes the GitHub release, including the
  releases missing for v0.2.0-beta.1 to v0.4.0. It only does what's missing, so re-running it is safe.
- **D15.5 Branch names and cleanup.** `type/short-name` with seven types (CONTRIBUTING.md), checked in CI so the branch
  list stays readable. Merged branches are deleted by a workflow, because the setting that does it needs admin rights.
  A branch is only deleted if its tip is still the merged commit, so later work on it is never lost.
- **D15.6 Protection as files.** Branch and tag protection need an admin, so `.github/rulesets/` holds them as JSON for
  the owner to import. `main` changes only through pull requests with `test` and `versions` passing; `v*` tags can only
  be made by the release workflow. Both let GitHub Actions through, because the nightly data jobs commit to `main`.
- **D15.7 Merge commits.** Pull requests are merged with merge commits, as #1 to #5 were, so each branch's commits stay
  visible and a release tag sits on a commit that was actually deployed.
