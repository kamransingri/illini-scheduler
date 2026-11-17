# Changelog

Every release of the site and the data pipeline, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/);
CONTRIBUTING.md says what counts as a major, minor or patch change. Add a line under **Unreleased** in the same pull
request as the change. `make release V=minor` (or `patch`) turns Unreleased into the next version, and the release
workflow tags it and publishes the GitHub release once it reaches `main`. Before 0.2.0-beta.1 the version was 0.1.0:
the first build, phases 0 to 12, recorded in docs/PROGRESS.md.

## [Unreleased]

### Fixed

- Calendar export (.ics): dates now come from the Registrar's Fall 2026 and Spring 2027 academic calendars, with the
  source and read date in every event. Labor Day (September 7, 2026) is now skipped; before, Monday classes showed up
  on it. The builder names the breaks it skips.

### Added

- Degree checklist: minors. Pick an optional minor under your major and its requirements get their own checklist below
  the major's, filled from the same course list, with the same ranked course options. All 127 minors in the 2026-2027
  catalog are imported (`python -m pipeline.catalog_import --only minors`). The minor is saved with your list and
  carried in the share link (`mn=`).
- Degree checklist: a college filter under the major and minor boxes ("Gies Business (6)", "LAS (52)"…) narrows the
  list to one college, and typing then searches only that college.

### Changed

- Degree checklist: the program box is now labelled Major, and it opens empty with a "Type a major" hint, so you can
  type straight away instead of scrolling the full list.
- Catalog importer: a "Select two of the following:" header row becomes a "choose 2" rule instead of a tick box, and
  requirement files can say `type: minor`.

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

[Unreleased]: https://github.com/kamransingri/illini-scheduler/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kamransingri/illini-scheduler/compare/v0.2.0-beta.1...v0.2.0
[0.2.0-beta.1]: https://github.com/kamransingri/illini-scheduler/releases/tag/v0.2.0-beta.1
