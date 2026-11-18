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

[Unreleased]: https://github.com/kamransingri/illini-scheduler/compare/v0.12.1...HEAD
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
