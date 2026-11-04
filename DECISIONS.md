# Decisions

Every judgment call made during the autonomous build, newest phase last.

## Phase 0

- **D0.1 Private repo, not public.** The build doc says `gh repo create --public`, but the owner asked for a
  *private* repository. Private wins. Note: GitHub Pages on a private repo needs a paid plan (Pro/Team);
  see PROGRESS.md "Needs a human".
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
