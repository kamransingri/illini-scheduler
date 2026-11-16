# Limitations

What Illini Scheduler can't do, or does only approximately, as of v0.3.0 (2026-11-16). Each item says where the gap
comes from. For future plans, see [IDEAS.md](IDEAS.md).

## The site itself

- **Unofficial.** It isn't affiliated with the University of Illinois. Confirm sections, seats and restrictions in
  Self-Service before registering.
- **Static, no backend.** The site is a set of files on GitHub Pages. There are no accounts. Your courses, degree
  progress and schedule live in your browser's storage (and in the share link), so they don't sync between devices
  and are lost if you clear site data.
- **Updated once a day.** The site rebuilds nightly at 09:00 UTC, and seat status is fetched daily at 04:17 UTC.
  Anything that changes in between shows up the next day.

## Course and seat data

- **Open or closed only.** The site knows whether a section is open, not how many seats are left, the capacity or the
  waitlist. Those exist only in Self-Service, which needs a NetID; the site links to it and never scrapes it.
- **Snapshots.** The nightly build reads Course Explorer through Wade Fagen-Ulmschneider's mirror, because the live
  feed refuses bursts of requests from GitHub (DECISIONS D11.3). The mirror can lag the live site.
- **Final exams** appear only after Course Explorer publishes them, and are refreshed weekly.
- **Calendar export (.ics)** uses estimated instruction start and end dates (`web/lib/terms.ts`), not the official
  calendar.
- **Renumbered courses aren't linked.** The data has no link between an old number and its new one (D4.6), so a
  course's history stops at the renumbering.

## GPA data

- **Through Summer 2026.** "Recent" GPA means Fall 2022 to Spring 2026. A new professor or new course has no grade
  history.
- **Name matching.** Course Explorer and the GPA dataset write names differently ("Gonzalez, D"). When a match is
  ambiguous the site leaves it unmatched rather than guess: 3,863 names are logged in `data/unmatched.csv`, mostly
  TAs. When last measured, about 80% of lecture instructors were matched (CS 83%, MATH 86%, STAT 79%; PROGRESS.md).

## Rate My Professors

- **No official API.** The pipeline uses the same queries the RMP website uses, rate limited and cached for 7 days. If
  RMP changes them, ratings stop updating until the pipeline is fixed.
- **Coverage.** About 1,230 instructors have a match so far. New lookups are capped at 20 minutes per nightly run, so
  coverage grows over several nights. Instructors without a match show a search link.
- **Matching is by name and department.** Some professors will be missed, as Daniel Gonzalez (listed on RMP as
  "Gonzalez Cedre") was until v0.3.0.
- **RMP ratings are self-selected.** The people who rate are not a random sample, which is why the best pick score
  pulls ratings with few reviews toward an average.

## Best pick score

- It's a heuristic built from course GPA, the professor's GPA difference, RMP and open seats, with small samples
  pulled toward an average (D13.18). It doesn't predict your grade. You can change the weights.

## Degree planner

- **Not an official degree audit.** Use DARS and your advisor for that.
- **Imported automatically.** 170 of the 171 programs were read by `pipeline/catalog_import.py` from the 2026-2027
  catalog and haven't been checked by hand. Only Finance + Data Science, BS was checked line by line.
- **Prose rules aren't checked.** Requirements the catalog states in words (technical electives, focus areas,
  concentrations) show the catalog's wording and a checkbox you tick yourself.
- **Missing courses.** 288 course codes in 71 programs aren't offered in the terms the site loads (old or rarely
  taught courses). They show greyed out, without a link.
- **Scope.** Undergraduate majors and their concentrations in the 2026-2027 catalog only. No minors, certificates,
  graduate programs or earlier catalog years.
- **You enter your courses by hand.** There's no transcript or DARS import, because those sit behind a NetID.
- **Prerequisites** are shown as catalog text, not checked against your courses.
- **Double counting** is allowed only where the catalog or the gen-ed rules say so in quotable words. Anything else
  shows as "rules unclear" instead of being guessed.

## Development

- On Windows, the "lower-case course URL redirects" Playwright test fails locally because the file system ignores
  case. It passes on GitHub's Linux runners.
- A full build writes about 28,600 files. In a synced folder (OneDrive, Dropbox), pause syncing while building.
