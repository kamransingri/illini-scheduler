# Limitations

What Illini Scheduler can't do, or does only approximately, as of v0.6.0 (2026-11-17). Each item says where the gap
comes from. For future plans, see the [GitHub issues](https://github.com/kamransingri/illini-scheduler/issues).

## The site itself

- **Unofficial.** It isn't affiliated with the University of Illinois. Confirm sections, seats and restrictions in
  Self-Service before registering.
- **Static, no backend.** The site is a set of files on GitHub Pages. There are no accounts. Your courses, degree
  progress and schedule live in your browser's storage (and in the share link), so they don't sync between devices
  and are lost if you clear site data.
- **Rebuilt once a day.** The site rebuilds nightly at 09:00 UTC from data read daily at 04:17 UTC. Course pages,
  the gen-ed finder and the schedule builder show seat status from that daily read. Only the Just opened page and the
  home page's Just opened panel are fresher (next section).

## Seat changes ("Just opened")

- **Close to live, not live.** The busiest next-term courses are re-read about every 10 minutes (every 30 overnight)
  by a GitHub Actions job, and the page picks that up within about 5 minutes (GitHub caches the file for 5 minutes).
  Expect a change on the page roughly 5 to 15 minutes after it happens. GitHub can delay or skip scheduled runs when
  it's busy, and then the page says "Daily" instead of "Live".
- **Only busy courses.** A run reads about 240 courses: the 60 busiest every time, the next 340 in rotation. A quiet
  course is only checked by the daily crawl, so its openings show up the next day.
- **A seat can be gone already.** Openings in popular courses can fill within minutes. Copy the CRN and confirm in
  Self-Service.
- **Notifications only while the page is open.** "Notify me" uses the browser's notifications for changes that arrive
  while the tab is open; there are no email or phone alerts (that needs a backend, [#16](https://github.com/kamransingri/illini-scheduler/issues/16)).

## Course and seat data

- **Open or closed only.** The site knows whether a section is open, not how many seats are left, the capacity or the
  waitlist. Those exist only in Self-Service, which needs a NetID; the site links to it and never scrapes it.
- **Snapshots.** The nightly build reads Course Explorer through Wade Fagen-Ulmschneider's mirror, because the live
  feed refuses bursts of requests from GitHub (DECISIONS D11.3). The mirror can lag the live site.
- **Final exams** appear only after Course Explorer publishes them, and are refreshed weekly.
- **Calendar export (.ics)** uses estimated instruction start and end dates (`web/lib/terms.ts`), not the official
  calendar.
- **Search by CRN** covers the next and the current term only.
- **Renumbered courses aren't linked.** The data has no link between an old number and its new one (D4.6), so a
  course's history stops at the renumbering.

## GPA data

- **Through Summer 2026.** "Recent" GPA means Fall 2022 to Spring 2026. A new professor or new course has no grade
  history.
- **Name matching.** Course Explorer and the GPA dataset write names differently ("Gonzalez, D"). When a match is
  ambiguous the site leaves it unmatched rather than guess: 3,863 names are logged in `data/unmatched.csv`, mostly
  TAs. When last measured, about 80% of lecture instructors were matched (CS 83%, MATH 86%, STAT 79%; [#12](https://github.com/kamransingri/illini-scheduler/issues/12)).

## Rate My Professors

- **No official API.** The pipeline uses the same queries the RMP website uses, rate limited and cached (asked again
  after 7 days, used for up to 90). If RMP changes them, ratings stop updating until the pipeline is fixed.
- **Coverage.** Every professor a course page shows is looked up, next term's first. New lookups are capped at 20
  minutes per nightly run, so coverage keeps growing over several nights (DECISIONS D18.6). Instructors without a
  match show a search link.
- **Matching is by name, department and reviews.** Nicknames, middle names and one-letter spelling slips match only
  when the department or the reviews back them up, so some professors will still be missed, and a profile shows only
  on courses whose subject it fits.
- **Reviews.** Only a professor's 20 newest RMP ratings are read; a course page shows up to 6, that course's first. A
  professor with many newer reviews for other courses may show none for this one.
- **RMP ratings are self-selected.** The people who rate are not a random sample, which is why the best pick score
  pulls ratings with few reviews toward an average.

## Gen-ed finder and schedule builder

- **The gen-ed finder has no time filters** since v0.4.0: add courses to the schedule builder and set start times,
  days off and the rest there (DECISIONS D14.5).
- **The lunch break rule is fixed** at 45 free minutes between 11am and 2pm on each day with class.
- **Expected GPA** in the builder uses each section's instructor GPA for that course, else the course average; it is
  a guide, not a prediction.

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
- **Scope.** Undergraduate majors (with their concentrations) and minors in the 2026-2027 catalog only. No certificates,
  graduate programs or earlier catalog years.
- **Major and minor overlap.** A course counts toward both your major and your minor on the checklist. Some minors and
  colleges limit that overlap; the minor's catalog page says so, and the checklist doesn't check it.
- **You enter your courses by hand.** There's no transcript or DARS import, because those sit behind a NetID.
- **AP credit is an estimate.** The courses come from CITL's AP table for the year you started (2024-2025, 2025-2026
  or 2026-2027 only), copied by hand, with a few slips on CITL's pages corrected (docs/AP-CREDIT.md). The real credit
  shows on DARS once your scores reach the university. IB scores, dual credit and transfer credit aren't worked out;
  add those courses yourself as "AP or transfer credit". Elective credit such as `MATH 1--` counts toward your hours,
  and toward a requirement only when it takes every course at that level in that subject.
- **Prerequisites** are shown as catalog text, not checked against your courses.
- **Double counting** is allowed only where the catalog or the gen-ed rules say so in quotable words. Anything else
  shows as "rules unclear" instead of being guessed.

## Development

- On Windows, the "lower-case course URL redirects" Playwright test fails locally because the file system ignores
  case. It passes on GitHub's Linux runners.
- A full build writes about 28,600 files. In a synced folder (OneDrive, Dropbox), pause syncing while building.
