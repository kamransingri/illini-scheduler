# Limitations

What Illini Scheduler can't do, or does only approximately, as of v0.17.0 (2026-11-27). Each item says where the gap
comes from. For future plans, see the [GitHub issues](https://github.com/kamransingri/illini-scheduler/issues). When
you change something listed here, change this page in the same pull request.

## The site itself

- **Unofficial.** It isn't affiliated with the University of Illinois. Confirm sections, seats and restrictions in
  Self-Service before registering.
- **Static, no accounts.** The site is a set of files on GitHub Pages. Your courses, degree progress and schedule live
  in your browser's storage (and in the share link), so they don't sync between devices and are lost if you clear site
  data. Accounts are planned (#151) but not built.
- **The HTTP API and hosted MCP server aren't live yet.** Both are built and tested in `api/`, and go live once the
  Supabase project is set up (#247). Until then, use the JSON files or run the MCP server with `npx`
  ([mcp/README.md](../mcp/README.md)).
- **Rebuilt once a day.** The site rebuilds nightly at 09:00 UTC from data read daily at 04:17 UTC. Course pages,
  the gen-ed finder and the schedule builder show seat status from that daily read. The Just opened page, the home
  page's Just opened panel and the schedule builder's backups are fresher (next section): a chosen section the live
  feed sees close is flagged with its backup, but the schedules themselves aren't rebuilt from the live feed.

## Seat changes ("Just opened")

- **Close to live, not live.** The busiest next-term courses are re-read about every 10 minutes (every 30 overnight)
  by a GitHub Actions job, and the page picks that up within about 5 minutes (GitHub caches the file for 5 minutes).
  Expect a change on the page roughly 5 to 15 minutes after it happens. GitHub can delay or skip scheduled runs when
  it's busy, and then the page says "Daily" instead of "Live".
- **Only busy courses.** A run reads about 240 courses: the 60 busiest every time, the next 340 in rotation, and up
  to 30 courses on the site's watch list (`data/watch.txt`, added by pull request). A quiet course is only checked by
  the daily crawl, so its openings show up the next day. For Spring 2027 about 1,100 courses have a closed section, so
  about 700 of them are quiet in this sense.
- **Watching a section doesn't make it checked more often.** "Watch" keeps a section in your list on Just opened with
  its latest status and lets you filter and be notified on it. The list stays in your browser (and its share link), so
  the live job can't see it; only `data/watch.txt` changes what the job reads ([#15](https://github.com/kamransingri/illini-scheduler/issues/15)).
  A list holds up to 40 sections.
- **A seat can be gone already.** Openings in popular courses can fill within minutes. Copy the CRN and confirm in
  Self-Service.
- **Notifications only while the page is open.** "Notify me" uses the browser's notifications for changes that arrive
  while the tab is open; there are no email or phone alerts. Alerts with the site closed need an alert server: the
  site's half is built and hidden ([PUSH.md](PUSH.md), [#16](https://github.com/kamransingri/illini-scheduler/issues/16)).

## Course and seat data

- **Open or closed only.** The site knows whether a section is open, not how many seats are left, the capacity or the
  waitlist. Those exist only in Self-Service, which needs a NetID; the site links to it and never scrapes it.
- **Snapshots.** The nightly build reads Course Explorer through Wade Fagen-Ulmschneider's mirror, because the live
  feed refuses bursts of requests from GitHub (DECISIONS D11.3). The mirror can lag the live site.
- **Final exams** appear only after Course Explorer publishes them (usually around mid-term), and are refreshed
  weekly. Exams a department or instructor schedules itself (CBTF exams, take-home finals) aren't in that schedule, so
  the builder lists those courses as having no final listed and can't check them for conflicts.
- **Calendar export (.ics)** uses the Registrar's academic calendar for each loaded term (`web/lib/terms.ts`, copied
  by hand with the source and read date): first and last day of instruction, the 8-week halves, and all-campus holidays
  and breaks, which are left out as `EXDATE`s. Final exams are added as one-off events when they're listed (a box
  next to Download .ics turns them off), and a class that meets on a different
  schedule than Course Explorer lists won't match. A term the Registrar hasn't published gets estimated dates, and the
  builder and every exported event say so.
- **Search by CRN** covers the next and the current term only.
- **Building locations** come from OpenStreetMap (`buildings.json`, #93). About 97% of next term's in-person
  meetings have one; a building OSM doesn't have (the School of Information Sciences building, the Veterinary
  Teaching Hospital) or a name nobody has checked in `data/buildings.csv` has none. A building is one point at its
  centre, not its entrances.
- **Getting there** (#96) uses MTD's published timetable, one bus and no transfers. MTD publishes one term at a time, so
  next term's trips use this term's times until MTD publishes the next. Walking times are straight-line estimates.
  Buses run late, and the tab can't see detours or cancellations (live departures are #97).
- **The map of each day** needs WebGL and OpenFreeMap's tile servers. Without either, the list of stops still shows.
  Walking lines are straight lines between buildings, not the path you'd walk.
- **Only the renumberings in `data/renumbered.csv` are linked** (33 in 2026-11, including the 2026-2027 French,
  German, Italian, Spanish and Scandinavian sequences). Each needs a source, so a renumbering the catalog doesn't
  state stays unlinked and that course's history stops at the change. My courses and the degree checklist don't
  translate old numbers: a student who took SPAN 200 adds it as SPAN 210 by hand (D23.4).

## GPA data

- **Through Summer 2026.** "Recent" GPA means Fall 2022 to Spring 2026. A new professor or new course has no grade
  history.
- **Name matching.** Course Explorer writes only a last name and an initial ("Gonzalez, D"), so the site works out who
  that is from the GPA dataset: the course's past teachers, the catalog's cross-listed twins and sections that meet
  together. When that stays ambiguous the name is left unmatched rather than guessed, and logged in
  `data/unmatched.csv` (mostly TAs). In November 2026, 86% of CS, 91% of MATH and 87% of STAT lecture instructors were
  matched (`python -m pipeline.names --report`, [#12](https://github.com/kamransingri/illini-scheduler/issues/12)).
  Most of the rest have no grade history at all, such as new instructors and seminars.

## Rate My Professors

- **No official API.** The pipeline uses the same queries the RMP website uses, rate limited and cached (asked again
  after 7 days, used for up to 90). If RMP changes them, ratings stop updating until the pipeline is fixed.
- **Coverage.** Every professor a course page shows is looked up, next term's first. New lookups are capped at 20
  minutes per nightly run, so coverage keeps growing over several nights (DECISIONS D18.6). Instructors without a
  match show a search link.
- **Matching is by name, department and reviews.** Nicknames, middle names and one-letter spelling slips match only
  when the department or the reviews back them up, so some professors will still be missed, and a profile shows only
  on courses whose subject it fits. A two-part surname that RMP lists under one part ("Fagen-Ulmschneider" as "Wade
  Fagen") is searched part by part when the whole name finds no one.
- **Reviews.** Only a professor's 20 newest RMP ratings are read. A course page shows only that course's (and its old
  numbers'), or, when there are none, the professor's reviews for other courses, marked as such. A professor with many
  newer reviews for other courses may show none for this one.
- **RMP ratings are self-selected.** The people who rate are not a random sample, which is why the best pick score
  pulls ratings with few reviews toward an average.

## Summer courses

- **Last summer's classes until the next is published.** Course Explorer lists a summer around March, so until then
  the gen-ed finder's Summer view, course pages and the search show the newest summer it has (Summer 2026 in November 2026), says so, and shows how many of the last three
  summers each class ran in. A class can still be dropped or added for the coming summer.
- **Classes only, no seats.** Independent study, internships, research and study abroad aren't listed. Summer sections
  aren't in the schedule builder or the seat checks; confirm sections in Course Explorer and Self-Service. A summer
  class with no fall or spring section in the current or next term has no course page here, so the search sends it to
  Course Explorer.
- **No winter session.** There's no open source for winter courses.

## Gen-ed finder and schedule builder

- **The gen-ed finder checks only start time, end time and days off** from the schedule builder's must-haves. Blocked
  times and the lunch break are applied once the course is in the builder (DECISIONS D20.2). The times come from this
  browser, so a shared link with "Only courses that fit them" filters by the reader's own times.
- **The lunch break rule is fixed** at 45 free minutes between 11am and 2pm on each day with class.
- **Expected GPA** in the builder uses each section's instructor GPA for that course, else the course average; it is
  a guide, not a prediction.
- **Restrictions** are read from each section's "Restricted to ..." and "Not intended for ..." sentences in Course
  Explorer and checked against About you (level, class standing, and the major and minor picked in the degree
  checklist). About 87% of those sentences are read: level, class standing, majors and minors, colleges, departments
  and graduate or non-degree programs. Program cohorts (James Scholars, Merit, living-learning communities, ESL
  placement), sections that open to more students on a date, and Banner's own names for majors that differ from the
  catalog's are shown as "restricted" with the text. A department is never a "no", since a major's department
  can't be told from its name. Self-Service has the final word.
- **Credit-hour warnings** use the campus undergraduate limits (18 hours in fall and spring, 12 for full-time). Your
  college may add its own rules, graduate limits differ, and a variable-credit course counts as a range until you pick
  its hours in Self-Service.

## Best pick score

- It's a heuristic built from course GPA, the professor's GPA difference, RMP and open seats, with small samples
  pulled toward an average (D13.18). It doesn't predict your grade. You can change the weights.

## Degree planner

- **Not an official degree audit.** Use DARS and your advisor for that.
- **Mostly imported automatically.** 317 majors and concentrations and 127 minors were read by
  `pipeline/catalog_import.py` from the 2026-2027 catalog. Seven were checked by hand, line by line, against their catalog pages: Computer Science,
  Psychology (its main page; the ten concentrations are imported), Economics, Mechanical Engineering, Finance,
  Accountancy, and Finance + Data Science. The others say they were read automatically.
- **Prose rules aren't checked.** Requirements the catalog states in words (advanced electives, CS focus areas,
  supporting course work) show the catalog's wording and a checkbox you tick yourself. Where the catalog is precise,
  hand-checked majors count them instead (CS technical electives: 18 hours of CS 397 and 400-level courses, minus the
  core).
- **Missing courses.** About 260 course codes in about 130 programs aren't offered in the terms the site loads. Of
  these, about 215 are in the 2026-2027 course catalog but rarely taught (often graduate courses), and about 40 aren't
  in it at all: retired or renumbered courses that program pages still list. They show greyed out, without a link.
- **Scope.** Undergraduate majors (with their concentrations) and minors in the 2026-2027 catalog, plus the 22 LAS
  undergraduate certificates as a link and one box to tick (D54). No other colleges' certificates, graduate programs or
  earlier catalog years.
- **Tracks are found by name.** A program offers a track choice only when the catalog lists its tracks as groups named
  "... Track" (D58.1). Options listed another way, such as Industrial Engineering's "Track Option Electives", show as
  requirements you tick yourself.
- **Major and minor overlap.** A course counts toward both your major and your minor on the checklist. The 30 minors
  whose catalog page asks for coursework distinct from the major show how much you have (D43, D47); other limits
  (no overlap with one named major) are only in the minor page's words. Minors closed to your major are greyed out
  only where the catalog or the department says so in words (24 minors, D55); others aren't checked.
- **Transcript and DARS import reads text, not the systems.** Both sit behind a NetID, so you copy the page and paste
  it; it's read in your browser. The parser was written from the transcript's published layout and the registrar's
  grade key, with hand-written samples, so a layout it hasn't seen may leave lines unread: it lists them instead of
  guessing, and you add those courses by hand.
- **AP and IB credit are estimates.** The courses come from CITL's tables for the year you started (AP: 2024-2025,
  2025-2026 or 2026-2027; IB: 2026-2027 only, because CITL's earlier IB tables don't separate Higher and Standard
  Level; SAT and ACT: 2025-2026 or 2026-2027, Composition I and placement only), copied by hand, with a few slips in CITL's tables corrected (docs/AP-CREDIT.md). The real credit shows on DARS
  once your scores reach the university. Dual credit and transfer credit aren't worked out: Illinois's equivalencies
  are in Transferology, which needs an account, so look your courses up there and add the Illinois course yourself as
  "AP, IB or transfer credit". Elective credit such as `MATH 1--` counts toward your hours,
  and toward a requirement only when it takes every course at that level in that subject.
- **Prerequisites are read from the catalog's sentence.** The checklist says met, not met or can't tell, with the
  sentence beside it. Anything the site can't check (consent of the instructor, "or equivalent", class standing, a
  grade, a clause it can't read) is "can't tell", never a guess, and a course's section may add prerequisites of its
  own. On 150 hand-labelled courses it read none looser than the catalog (DECISIONS.md D49).
- **Double counting** is allowed only where the catalog or the gen-ed rules say so in quotable words. Anything else
  shows as "rules unclear" instead of being guessed. A course approved for Advanced Composition or Quantitative
  Reasoning II counts for its other gen-ed category too. Two program groups that list the same course (common in
  Grainger programs) are still unclear until an advisor confirms them (#18).

## Development

- On Windows, the "lower-case course URL redirects" Playwright test fails locally because the file system ignores
  case. It passes on GitHub's Linux runners.
- A full build writes about 28,600 files. In a synced folder (OneDrive, Dropbox), pause syncing while building.
