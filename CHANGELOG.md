# Changelog

Every release of the site and the data pipeline, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/);
CONTRIBUTING.md says what counts as a major, minor or patch change. Add a line under **Unreleased** in the same pull
request as the change. `make release V=minor` (or `patch`) turns Unreleased into the next version, and the release
workflow tags it and publishes the GitHub release once it reaches `main`. Before 0.2.0-beta.1 the version was 0.1.0:
the first build, phases 0 to 12 (its build log, docs/PROGRESS.md, was removed after 0.6.0 and is in git
history).

## [Unreleased]

### Added

- Schedule builder: Getting there (#96). Pick the hall or building you live in (or use where you are now) and each day
  of a schedule says when to leave and whether to walk or take an MTD bus, with the stop, route and time, then the
  trip home. Between classes that are too far apart to walk in time, it shows the bus that makes it, or how late
  you'd be. Times come from MTD's published timetable and are estimates; where you live stays in your browser.
- Schedule builder: a map of each day (#95). In Getting there, "Show Monday's map" puts that day's classes on a campus
  map, numbered in class order with where you live, and lists the same stops with the walk to each and any tight
  ones. The map loads only when you open it.
- Getting there: drop a pin on the map for where you live (#96), if your place isn't in the list. It's saved in your
  browser only, rounded to about 100 m.
- Prerequisites are checked against My courses (#21). Each course option in the degree checklist says "Prerequisites
  met", "met if you take CS 225 at the same time", "not met: needs CS 173 or MATH 213" or "can't tell", next to the
  catalog's sentence. A new **You can take next** list shows the courses on your major's open requirements whose
  prerequisites you meet and that run next term, best picks first. The four-year plan warns when a planned course's
  prerequisites won't be done by that term.

- Paste your transcript or DARS audit into the degree checklist (#20). Copy Self-Service's Academic History or a DARS
  audit and paste it under My courses: the courses are read in your browser (nothing is sent or saved), shown as
  "adds 13, updates 1 (3 in progress)" with a box to leave any out, and applied to My courses. Withdrawn, failed or
  audited attempts are listed instead of added, lines it can't read are shown, and test credit on the transcript
  replaces the AP/IB estimate.
- A data sources page (#191), linked from the footer: where course, grade, gen-ed and rating data comes from, who
  publishes it and how often the site reads it. It quotes the University's FERPA exclusion from the GPA dataset, and
  a course's "Sections of 20 or fewer students are withheld" note links to it.
- Just opened says what each section is and who teaches it (#162): "Lecture with Geoffrey Challen" or
  "Discussion/Recitation" under the course name.
- Professor ratings from Rate My Professors show as three meters on course pages (#197): quality, difficulty
  (marked "lower is easier") and would take again, each with its number, instead of one line of small grey text.
- Paste your AP or IB scores in the degree checklist (#199, #200) instead of adding each exam by hand. Copy your
  College Board score page or IB results page into the box, check what was found (exams not recognised and ones
  that would replace an exam you entered are listed), then apply. Retakes keep the highest score. The text never
  leaves your browser.
- A privacy page (#142), linked from the footer: what the site keeps in your browser (every storage key, listed by
  what it holds), the little that leaves it (share links, and seat alerts once they're on), and a button that deletes
  everything the site saved in this browser. No accounts, analytics, ads or trackers.
- Terms of use (#143) and an AI use policy (#144), linked from the footer next to Privacy. The terms say the site is
  unofficial (check before you register), comes with no warranty, and how to reuse its data with credit to the
  sources. The AI use policy says how AI tools are used to build the site, that it never sends what you enter to an AI
  service, and how AI tools may read its data.
- Seat alerts with the site closed, on the site's side (#90). **Alert me** on a watched section asks once for
  notification permission, subscribes this browser and sends the alert server only the push address and the
  section's term and CRN; **Stop all alerts** or no longer watching a section undoes it. iPhones are told to add the
  site to the Home Screen first. The buttons appear once the alert server (#91) runs; until then Just opened works
  as before. docs/PUSH.md has the server's side.
- The site can be added to a phone's Home Screen and opens there as an app of its own.
- A four-year plan in the degree checklist (#114). Pick your expected graduation term and add the courses you still
  need to each term ahead (summers if you want them). Each term shows its hours, and each requirement says the term
  your plan finishes it in, or that it doesn't. My courses count as already done. The plan is saved in this browser
  and in the share link; older links open as before.
- Move courses around the four-year plan (#115): drag a course from a requirement's course options into a term, or
  from one term to another. Each planned course also has a **Move to** menu that works with the keyboard and screen
  readers, and on phones, where terms stack in one column.
- Warnings in the four-year plan (#116): a course placed in a term it doesn't usually run in ("Usually runs in fall
  only, not in Spring 2028", from the last four years of offerings), and a term over the 18-hour limit or under 12
  hours (not full-time), as in the schedule builder. Moving the course clears its warning.
- Minors whose catalog page asks for coursework distinct from the major say how much you have (#112). 30 minors
  ask for six hours (usually advanced, or two advanced courses for Animal Sciences) that don't also count toward the
  major, and almost all toward another minor too. Their checklist shows the rule in the catalog's words, which of your courses count, which don't
  because your major uses them, and flags a minor that leans on courses your major already uses.
- The source note on a course's GPA names and links Wade Fagen-Ulmschneider's GPA dataset and says what released the
  terms shown: FOIA requests before Spring 2025, Urbana Senate item EP.25.072 from Spring 2025 (#193). docs/API.md and
  llms.txt say the same, and a source note's links can be reached with the keyboard.
- The schedule builder works out walking time between back-to-back classes from building locations (#94). Each
  schedule lists the walks that take longer than the gap before the next class ("14 min walk, 10 min gap"), and a
  new must-have, **No rushed walks between classes**, skips schedules that have one.
- Getting there names your best bus (#216): the MTD line from a stop near where you live that reaches the most of
  your classes without a transfer, where to get off for each, the classes close enough to walk, and the next two
  lines. The line can be shown on the map.
- Classes on the schedule builder's week calendar lock and unlock with a click or Enter (#138), and "Lock this
  schedule" and "Unlock all" sit next to Copy all CRNs. On a phone, a tap opens the class's details with a Lock button.
- Time locks (#139): when two sections meet at the same time, "Keep 11am MWF, any section" keeps the course at that
  time in every schedule, whichever section it is, instead of locking one CRN. Share links carry it (`CS124@21-660`)
  and older links still open.

### Fixed

- Moving a course in the four-year plan right after the page opens works, instead of saying the course isn't in the
  course data until that data has loaded.

## [0.15.0] - 2026-11-20

### Added

- Up to three minors in the degree checklist (#111). Each one gets its own checklist and tick boxes under the major,
  and the share link carries all of them (`mn=` takes a list). A course that counts toward two of your minors is
  pointed out, since the catalog doesn't give a rule for that. Links and saved lists with one minor open as before.
- The MCP server comes with every release (#101). Claude Code, Claude Desktop and other MCP apps start it with
  `npx -y` and a link to the latest release, with no copy of the repository or build step. A new page, **Use it
  from your AI app** (linked in the footer), has the setup, and mcp/README.md the full guide. The server has the
  site's version, and CI installs the package into an empty folder and calls every tool before each merge.

## [0.14.1] - 2026-11-19

### Changed

- "New plan" in the schedule builder starts blank: no courses and the default must-haves and priorities. Duplicate
  still copies a plan with everything in it.
- A link with the same courses as one of your plans but other must-haves or priorities no longer opens as a new plan.
  The builder opens your plan with the link's rules, doesn't save them, and asks whether to use them in your plan,
  save them as a new plan, or keep yours.

## [0.14.0] - 2026-11-19

### Changed

- Opening a shared schedule link never replaces your own courses: it opens as a new plan, or as your own plan when
  it's one of yours.
- Summer classes are part of the site instead of a separate tab (#121, #122, #123, #124). The gen-ed finder has a
  Summer view with the old page's filters (gen-ed, session, online or on campus, ran every summer). Course pages say
  when a course runs in summer, and the search marks summer courses and finds summer classes that have no page here.
  Old /summer/ links open the same classes in the gen-ed finder. The header has five tabs, with their icons from
  1024px up.
- A simpler home page: the search, often-searched courses and Just opened, which now has a blue outline instead of
  a grey fill. The page grid, build numbers and "How it works" are gone; every page is in the header.

### Added

- Named schedules in the schedule builder (#26, #117, #118, #119). Keep up to 10 plans, like "Plan A" and "Plan B if
  CS 225 fills", each with its own courses, locks, must-haves, share link and .ics file. Create, duplicate, rename
  and delete them (with Undo) above the builder; your current courses and must-haves become Plan A. **Compare plans**
  puts each plan's best schedule side by side with the same numbers as the top-schedules table and says what's
  different ("CS 225 at 2pm TR, Fridays off"); open any plan from there.
- The MCP server builds schedules (#100). `build_schedules` takes a list of courses, locked CRNs, must-haves (earliest
  start, latest end, days off, lunch break, blocked times, open sections only) and what matters to you, and returns
  the top schedules with their CRNs, the way the site ranks them, or why nothing fits. Each schedule comes with a link
  that opens it in the schedule builder.
- An MCP server for your own AI app (#99). Add `mcp/` to Claude Desktop, Claude Code or another MCP client and ask
  about UIUC courses. It can search courses, show a course's sections with CRNs, seats, restrictions and professors'
  GPAs and ratings, find gen-eds ranked the way the site ranks them, and give the term dates. Answers come from the
  site's data and say when it was built. Setup: mcp/README.md.
- The data as an API for scripts and AI tools (#98). `llms.txt` at the site root says what the site covers and where
  the data files are. `docs/API.md` explains every file and field, its units and how often it's refreshed.
  `meta.json` has a `format_version` that goes up when a field is renamed or removed. A test fails when an exported
  field isn't in API.md.
- Restriction check (#78, #79, #80, #81). A new "About you" panel in the schedule builder takes your level and class
  standing; your major and minor come from the degree checklist. Each section's "Restricted to ..." and "Not intended
  for ..." sentences are checked against it. The builder skips sections that clearly leave you out (the new must-have
  "Only sections I can register for", on by default; sections you lock are kept). A locked one gets a warning in
  Course Explorer's words, and every restricted section is marked "Not for you", "May be restricted" or "Restricted:
  you qualify", on course pages too. A course where every lecture leaves you out says so in the cart. About you stays
  in your browser and isn't put in share links.
- Schedule builder: a backup for every section of your schedule, for when a section fills during registration (#74,
  #75, #76, #77). Each section shows the best other section of that course that still fits the rest of your week and
  your must-haves, with its CRN, seat status and why it's the backup ("same time, same professor"); more are a click
  away. "Use this instead" swaps it in (as a lock, so it goes into the share link) and keeps the rest of the schedule.
  While the page is open, a chosen section the live seat feed sees close is flagged with its backup. When nothing
  fits, it says why: closed, clashes with another course, or which must-have it breaks.
- Schedule builder: a Finals week view and exam-conflict check (#83, #84, #85). Each schedule's finals are shown by
  day. The builder warns when finals overlap or when three or more start within 24 hours, which the Student Code
  counts as an exam conflict. The warning names the course expected to offer the conflict exam and says to contact
  the instructors by the last day of class. The comparison table has a Finals column, and the .ics can include the
  finals.
- Schedule builder: credit-hour warnings with a link to the Registrar's limits (#82). Over 18 hours in fall or spring
  (9 in summer, one class in winter) says your college office has to approve an overload; a schedule under 12 hours
  says it isn't full-time, which can matter for financial aid, scholarships, insurance and visas. Variable-credit
  courses count as a range ("15–18"), and the cart shows a running total.

## [0.13.1] - 2026-11-19

### Added

- A quarterly data check (#71). On the 10th of January, April, July and October, `data-check.yml` runs
  `python -m pipeline.data_watch` and opens one issue. The issue has a table of how old each source is on the live
  site, flags what needs a look, and lists the review checklist. Flagged: Wade's GPA data two semesters behind, a file
  Wade changed that the site doesn't have, term dates still estimated, or an AP, IB or catalog year older than the
  current one. Its first run flagged Wade's Teachers Ranked as Excellent list, unchanged since October 2025.

## [0.13.0] - 2026-11-19

### Added

- Schedule builder: each section of a schedule has a Lock button. A locked section stays in every schedule and the
  other courses are built around it, and the schedule on screen stays open (#67). When a lock is why nothing fits, the
  builder names the locked section and offers to unlock it; a locked section that breaks a must-have is named with the
  rule it breaks ("starts at 10:00am, before 10:30am").
- Schedule builder: the lunch break can be changed, 30 to 90 minutes anywhere from 10:00am to 3:30pm (#56).

- Degree checklist: every concentration with requirements of its own is a program you can pick, 120 in all, such as
  "Psychology: Cognitive Neuroscience, BSLAS". Psychology's main page only names its concentrations, so its course
  requirements were missing before.

### Changed

- Degree checklist: Computer Science, Psychology, Economics, Mechanical Engineering, Finance and Accountancy were
  checked by hand against the catalog (#17). CS counts technical electives (18 hours), the team-project course and the
  science elective, and its eight focus areas are one requirement instead of eight tick boxes. Economics counts its
  required courses, 11 hours of advanced ECON and its math. Finance counts its 400-level FIN hours. Mechanical
  Engineering counts its MechSE electives.
- Catalog importer: "(choose one)" in a heading, "one course chosen from", advisory comments, rules above a named
  list, and headings with hours but no list are read correctly. 59 programs have fewer tick boxes and more counted
  rules.
- Degree checklist: a course approved for Advanced Composition or Quantitative Reasoning II now also counts for its
  other gen-ed category, as the campus gen-ed policy allows. HIST 140 fills Advanced Composition, Humanities and
  Western cultures, where Humanities used to say "rules unclear" (#18). In Finance, BS, FIN 221 from the business core
  no longer also counts as the "one additional" Finance course.

## [0.12.1] - 2026-11-18

### Fixed

- Course pages: more professors show their grade history and ratings. A course listed under two subjects (MATH 464
  is STAT 410) or meeting with another (CS 498 and NPRE 498) now finds its professor from either, and a name is
  matched using every course it teaches, not only the first. Lecture instructors matched: CS 86%, MATH 91%, STAT 87%,
  up from 83%, 86% and 79% (#12).
- Two professors who share a Course Explorer name in one subject, such as "Li, H" in History, are no longer shown as
  one person.

## [0.12.0] - 2026-11-18

### Added

- Degree checklist: **IB credit**. Add IB exams with their level (Higher or Standard) and score, next to AP exams, and
  the checklist fills in the courses CITL's 2026-2027 table gives, merged with AP credit. Six slips in CITL's table are
  corrected and noted. The weekly CITL check now watches the IB rows too. For dual and transfer credit the checklist
  points to Transferology (#25).
- **Summer courses** page: classes you can take over the summer, with filters for gen-ed, session, online or on
  campus, and classes that ran every recent summer. Until Summer 2027 is published it shows Summer 2026's 656 classes
  and says so (#35).

## [0.11.0] - 2026-11-18

### Added

- Schedule builder: a **Best professor** priority (Medium by default). Each lecture is scored with the course page's
  best-pick score, so schedules prefer the lecture taught by the course's best professor, and of two sections at the
  same time the better professor's is the one picked. Results label the lecture's professor score and "Best pick".
  A "Best professors" starting point turns it to High (#49).

### Fixed

- Degree checklist: course lists the catalog presents as a choice are no longer counted as all required. 23 lists in
  12 programs were affected, among them Political Science's concentration course lists, Speech and Hearing Science's
  "(Select one)" requirements and the Fine & Applied Arts online options. They now show the courses with the catalog's
  heading and a checkbox.

## [0.10.0] - 2026-11-18

### Added

- Renumbered courses carry their history (#29). 33 renumberings are linked, among them the 2026-2027 French, German,
  Italian, Spanish and Scandinavian sequences (FR 103 → FR 203, SPAN 200 → SPAN 210, …), SOCW 300 → SOCW 296 and the
  actuarial courses that moved from MATH to ASRM. The new course page says "Formerly …" with the source, and includes
  the old number's grades, offering pattern and changes, marked "as …". The old URL opens the new page, and searching
  the old number finds it.

## [0.9.0] - 2026-11-18

### Added

- Watch a section (#15). Course pages have a Watch button on every section row for the current and next term, and so
  does the schedule builder's "Sections to watch". Just opened lists the sections you watch at the top with their
  latest status and when they were checked, "Only sections I watch" shows only their changes (so "Notify me" covers
  only them), and "Copy link to this list" shares the list. Your list stays in your browser.
- The live seat check re-reads the courses on a watch list kept in the repo (`data/watch.txt`) on every run, even when
  they're quiet.

### Changed

- Just opened's live status line says how many courses were re-checked, instead of "watched".

## [0.8.0] - 2026-11-18

### Added

- Schedule builder: "Sections to watch" (#27). When a schedule needs sections that were Closed at the last check, it
  lists them with their CRNs and links to Self-Service for waitlists and to Just opened, which now starts filtered to
  your schedule's courses from that link (`/opened/?mine=1`).
- A Versions page (`/versions/`) lists every version and what changed in it, from CHANGELOG.md. The footer names the
  site's version and date and links the three before it and the full list.
- Gen-ed finder: it uses the start time, end time and days off you set in the schedule builder (#30). Each course is
  marked "Fits your times" or says why not ("Outside your times", "Only special sections", "No open section"), and
  "Only courses that fit them" hides the rest. Once you've added courses, "Plan them in the schedule builder" opens
  the builder with them and your must-haves.

### Changed

- Course pages: "Took this course?" sends students to rate their professor on Rate My Professors, choosing the course,
  instead of the "Suggest a note" link that needed a GitHub account.

### Fixed

- Calendar export (.ics): dates now come from the Registrar's Fall 2026 and Spring 2027 academic calendars, with the
  source and read date in every event. Labor Day (September 7, 2026) is now skipped; before, Monday classes showed up
  on it. The builder names the breaks it skips.
- Rate My Professors on course pages: professors who teach this term but not next, and past instructors, are now
  looked up too. MATH 221's Kim Whittlesey (104 ratings) showed "No RMP match" because she isn't teaching in Spring
  2027. Course pages now show RMP for past instructors as well.
- Rate My Professors matching: nicknames ("Bob" for Robert), a middle name RMP lists first and one-letter spelling
  differences now match when the reviews or department back it up; every subject a professor teaches counts, not just
  the first; reviews for a professor's own courses settle which of several same-named people it is.
- A profile only shows on courses it fits: MATH 221's "J. Anderson" was showing the reviews of an Education
  professor with the same name in Course Explorer.
- Course pages show up to 6 RMP reviews per professor, the ones written for that course first (it was 3, from any
  course).

## [0.7.0] - 2026-11-17

### Added

- Degree checklist: minors. Pick an optional minor under your major and its requirements get their own checklist below
  the major's, filled from the same course list, with the same ranked course options. All 127 minors in the 2026-2027
  catalog are imported (`python -m pipeline.catalog_import --only minors`). The minor is saved with your list and
  carried in the share link (`mn=`).
- Degree checklist: a college filter under the major and minor boxes ("Gies Business (6)", "LAS (52)"…) narrows the
  list to one college, and typing then searches only that college.
- Course pages: a "Rate them on RMP" link next to each matched professor's Rate My Professors page, and "Be the first
  to rate" on professors RMP knows but nobody has rated yet. Both open RMP's own rating form; the site posts nothing.
- Degree checklist: completed courses in My courses link to that course's professors, so you can rate yours.
- Degree checklist: CITL's general notes for the AP table you picked, word for word, under your expected AP credit.

### Changed

- Degree checklist: the program box is now labelled Major, and it opens empty with a "Type a major" hint, so you can
  type straight away instead of scrolling the full list.
- Catalog importer: a "Select two of the following:" header row becomes a "choose 2" rule instead of a tick box, and
  requirement files can say `type: minor`.
- The backlog is now GitHub issues (#9 to #34), labelled by area (`degree-planner`, `seats`, `rmp`, `needs-backend`,
  `needs-human`…); docs/IDEAS.md and docs/PROGRESS.md were removed (both are in git history). `.gitignore` also covers
  virtualenvs, logs, editor folders and OS files.

## [0.6.0] - 2026-11-17

### Added

- Degree checklist: add your AP exams and scores and the checklist fills in the courses they're expected to give,
  from CITL's AP credit table for the year you started at Illinois (2024-2025, 2025-2026 or 2026-2027). Calculus BC
  asks for the AB subscore and Music Theory for the aural subscore when the score depends on it; Calculus uses the
  Grainger rows for engineering programs. Each exam shows CITL's placement message word for word, and any course can be
  unticked if you'd rather take it than accept the credit. AP courses count at CITL's hours and carry an "AP credit"
  tag; the scores (not the courses) are kept in your browser and the share link.
- Degree checklist: the hours in My courses (with AP credit and in-progress hours) next to the program's minimum.

## [0.5.0] - 2026-11-17

### Added

- Degree checklist: the program picker is now a search box. Type part of the name ("finance"), an acronym ("CS",
  "MCB", "ME"), a nickname ("polisci") or the college ("Gies", "LAS"), or open it to browse all 171 programs grouped by
  college. Arrow keys and Enter pick; Escape puts your program back. The picked program's college and catalog year show
  under it.
- The site footer shows the version and links to its release notes.
- This changelog, CONTRIBUTING.md (branches, commits, versions and releases) and a pull request template.
- `tools/release.py` with `make release V=…`: moves every version file (web/package.json, its lock file,
  pyproject.toml) to the next version together and turns Unreleased into that version's section.
- Release workflow: when a new version reaches `main`, it tags that commit `vX.Y.Z` and publishes a GitHub release with
  the changelog section. Versions tagged before this (0.2.0-beta.1 to 0.4.0) get their release on its first run.
- CI checks that the version files agree, the changelog covers the version, a version only goes up and isn't tagged
  yet, and branch names follow the convention.
- The branch of a merged pull request is deleted automatically; a manual run of the same workflow deletes older merged
  branches.
- `.github/rulesets/` holds two rulesets for the repository owner to import: `main` only changes through pull requests
  with CI passing (the nightly data jobs can still push), and `v*` tags can only be made by the release workflow and
  never moved or deleted.

### Changed

- Version tags are made by the release workflow on `main`, no longer by hand on a feature branch.
- docs/README.md points here for releases instead of keeping its own table.

## [0.4.0] - 2026-11-17

### Added

- Search by CRN in every search box. A CRN opens the course page scrolled to that section; in the schedule builder it
  adds the course with that section locked.
- Just opened in near real time: the busiest next-term courses are re-checked about every 10 minutes (every 30
  overnight) by a new workflow, and the page updates itself, with an optional browser notification.
- Schedule builder must-haves (earliest start, latest end, days off, lunch break, open sections only) and priorities
  with your own "too early" and "too late" times, five presets and results that follow every change. A table compares
  the top schedules.
- Docs: the Reddit feedback idea, decisions D14, new screenshots.

### Changed

- New logo, a navigation bar with two-word items and dividers, and a home page in sections.
- Gen-ed finder: one chip per category in "Counts for", no time filters, open sections shown by default.

## [0.3.0] - 2026-11-16

### Added

- All 171 undergraduate programs imported from the 2026-2027 Academic Catalog, grouped by college on the degree
  checklist. Rules the catalog writes in prose are shown in its own words (DECISIONS D13.28).

### Changed

- Gen-ed finder: picked categories combine with AND, and results are a ruled table.
- One typeface (Source Sans 3) and an Illini Blue footer.

### Fixed

- Rate My Professors matches compound surnames (CS 173's Daniel Gonzalez Cedre).
- The degree checklist's keyboard test no longer races the data load in CI.

## [0.2.0] - 2026-11-16

### Added

- Degree requirement data (Finance + Data Science, BS, 2026-2027 catalog) and the degree checklist.
- Best pick score, with weights each student can set (DECISIONS D13.18).
- Final-exam times from Course Explorer, and clash warnings in the schedule builder.

### Changed

- The course page is built around professors, on an Illinois brand design system (docs/DESIGN.md).
- Home, search, gen-ed finder, schedule builder and Just opened restyled to match.

## [0.2.0-beta.1] - 2026-11-16

### Added

- Illinois brand tokens, fonts and shared UI components (docs/DESIGN.md).
- Professor rows on the course page: GPA, difference from the course, grades, RMP and open lectures. Each row opens to
  that professor's sections, reviews and exam notes, and Compare shows them side by side.
- Sections grouped by what you register for together.

### Fixed

- A partial Rate My Professors error no longer stops `make data`.
- RSS feeds are written as UTF-8.

[Unreleased]: https://github.com/kamransingri/illini-scheduler/compare/v0.15.0...HEAD
[0.15.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/kamransingri/illini-scheduler/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/kamransingri/illini-scheduler/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/kamransingri/illini-scheduler/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.2.0-beta.1...v0.2.0
[0.2.0-beta.1]: https://github.com/kamransingri/illini-scheduler/releases/tag/v0.2.0-beta.1
