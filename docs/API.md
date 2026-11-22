# Data API

Everything Illini Scheduler shows comes from public JSON files that are rebuilt every night and served with the site.
You can read them from scripts, notebooks or AI tools. You don't need a key, and GitHub Pages allows cross-origin
reads (`Access-Control-Allow-Origin: *`). [`llms.txt`](../web/public/llms.txt) is the short version of this page for
AI tools. To use the data from an AI app without writing code, add the MCP server in [`mcp/`](../mcp/README.md).

- **Base URL:** `https://kamransingri.github.io/illini-scheduler/data/`
- **Rebuilt:** nightly at 09:00 UTC (`.github/workflows/pages.yml`). `meta.json` `built_at` says when. Seat status in
  the files is from the daily availability crawl. `live.json` (below) has changes from the last 48 hours, about every
  10 minutes.
- **Format version:** `meta.json` `format_version`. It goes up when a field is renamed or removed, or changes meaning
  or units, and the change goes in [CHANGELOG.md](../CHANGELOG.md). New fields don't change it, so ignore fields you
  don't know.
- **Read-only, best effort.** This is a student project, not the University's system of record. Check anything that
  matters in [Course Explorer](https://courses.illinois.edu/) and Self-Service before you register.
  [LIMITATIONS.md](LIMITATIONS.md) lists what the data gets wrong.
- **Terms:** reusing the data is fine with credit to the sources below; the site's
  [terms of use](https://kamransingri.github.io/illini-scheduler/terms/) have the rest, and the
  [AI use policy](AI-USE.md) covers AI tools.

## Where the data comes from

Credit these sources if you republish the data:

- **Course Explorer** (University of Illinois): sections, meeting times, instructors, descriptions, gen-ed
  attributes, seat status and final exams. History is from Wade Fagen-Ulmschneider's
  [course-catalog](https://github.com/wadefagen/datasets/tree/main/course-catalog) mirror.
- **[UIUC GPA dataset](https://github.com/wadefagen/datasets/tree/main/gpa)**,
  **[gen-ed list](https://github.com/wadefagen/datasets/tree/main/geneds)** and
  **[Teachers Ranked as Excellent](https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent)**
  by Wade Fagen-Ulmschneider.
- **[Academic Catalog](https://catalog.illinois.edu/)**: degree requirements.
- **[CITL](https://citl.illinois.edu/current-cutoff-scores)**: AP and IB credit tables.
- **Rate My Professors**: ratings, tags and review snippets. They belong to Rate My Professors and its reviewers, so
  link to the professor's page (`rmp.url`) when you show them.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)**: building locations in `buildings.json`, © OpenStreetMap
  contributors under the Open Database License (ODbL). Show that credit wherever you show them.
- **[MTD](https://developer.mtd.org/)** (Champaign-Urbana Mass Transit District): bus routes, stops and scheduled times in
  `transit.json`, under MTD's developer terms. Show "Data provided by Champaign-Urbana Mass Transit District" next to
  them, don't use MTD's name or logo to promote anything, and use them only to help people ride the bus.

## Conventions

- **Paths** in the tables: `a.b` is field `b` of object `a`; `a[]` is each item of list `a`; `<term>` (any name in
  angle brackets) stands for every key of a map.
- **Terms:** `YYYY-ss`, with `sp` spring, `su` summer, `fa` fall and `wi` winter: `2027-sp` is Spring 2027.
- **Course codes:** subject and number with a space (`CS 124`) where a code is one string; `s` and `n` where they're
  split.
- **Times:** minutes after midnight (`600` is 10:00 AM). `null` means no time (online or arranged).
- **Days:** a bit mask: Monday 1, Tuesday 2, Wednesday 4, Thursday 8, Friday 16, Saturday 32, Sunday 64. `10` is
  Tuesday and Thursday.
- **Grade shares** (`pct`) are fractions from 0 to 1. RMP `would_take_again` is a percentage from 0 to 100.
- **Instructor keys** are `last|first` in lower case (`challen|g`). They link a professor across sections, GPA rows
  and courses.
- **Timestamps** are ISO 8601 with a UTC offset. Dates without a time are `YYYY-MM-DD`.
- `null` means unknown or not applicable. A missing optional field means the same.

## Files

| File | What it is | Size |
| --- | --- | --- |
| `meta.json` | Build time, terms, data windows and snapshot dates | ~50 KB |
| `search.json` | Every course with a page, and next term's instructors | ~1 MB |
| `course/<SUBJECT>/<NUMBER>.json` | Everything about one course: sections, GPA, professors, history | 5–200 KB each |
| `geneds.json` | Gen-ed courses for next term, with their scores | ~300 KB |
| `summer.json` | The newest summer's classes | ~100 KB |
| `crns.json` | CRN to course and section | ~1 MB |
| `renumbered.json` | Old course numbers to new ones | small |
| `buildings.json` | Where each building in the section data is | ~12 KB |
| `transit.json` | MTD bus stops, routes and a normal week's times near campus, and places to live | ~170 KB |
| `seat-events.json` | Seat status changes from the last 7 days | ~300 KB |
| `degrees/index.json` | Every major and minor | ~60 KB |
| `degrees/<id>.json` | One program's requirements | 5–150 KB each |
| `degrees/gened-courses.json` | Every course with a gen-ed code | ~250 KB |
| `ap-credit.json`, `ib-credit.json` | Course credit for AP and IB scores | small |
| `feeds/<SUBJECT>/<NUMBER>.xml` | RSS feed of one course's seat changes | small |
| `live.json` (another URL) | Seat changes from the last 48 hours, every ~10 minutes | small |

### `data/meta.json`

Build information. Read it first to learn the current and next term.

| Field | Type | Meaning |
| --- | --- | --- |
| `format_version` | number | Data format version (see the top of this page) |
| `built_at` | string | When the data was built |
| `current_term` | string | Term in progress, e.g. `2026-fa` |
| `next_term` | string | Term students are registering for, e.g. `2027-sp` |
| `terms.<term>.label` | string | "Spring 2027" |
| `terms.<term>.source` | string | Where that term's sections came from |
| `terms.<term>.checked_at` | string | When that term's sections and seats were last read |
| `gpa.window` | string[] | First and last term in the GPA dataset |
| `gpa.recent` | string[] | Terms behind every "recent" GPA |
| `gpa.snapshot` | string | Date of the GPA dataset commit used |
| `geneds_snapshot` | string | Date of the gen-ed list commit used |
| `rmp_status` | string | `ok`, or why Rate My Professors data is missing (`unavailable: ...`) |
| `match_report.<subject>.names` | number | Instructor names in that subject this term |
| `match_report.<subject>.gpa_matched` | number | Names matched to the GPA dataset |
| `match_report.<subject>.gpa_pct` | number | Share matched, 0 to 100 |
| `match_report.<subject>.primary_names` | number | Names teaching lectures |
| `match_report.<subject>.primary_matched` | number | Lecture instructors matched to the GPA dataset |
| `match_report.<subject>.primary_gpa_pct` | number | Share matched, 0 to 100 |
| `match_report.<subject>.rmp_matched` | number | Names matched to Rate My Professors |
| `match_report.<subject>.rmp_pct` | number | Share matched, 0 to 100 |
| `buildings.osm_base` | string | When the OpenStreetMap data behind `buildings.json` was current; `null` when OSM couldn't be reached this build |
| `buildings.located` | number | Building names with a location |
| `buildings.share` | number | Share of next term's in-person meetings whose building has a location, 0 to 1 |
| `transit_feed_end` | string | Last day of the MTD timetable in `transit.json`; `null` when it couldn't be downloaded |
| `repo_url` | string | Source code |
| `live_url` | string | URL of `live.json` |
| `n_courses` | number | Course files in `course/` |
| `history_terms` | string[] | Every term in the offering history, oldest first |
| `score_priors.subject_gpa.<subject>` | number | Student-weighted recent GPA of the subject |
| `score_priors.campus_gpa` | number | Student-weighted recent GPA of campus |
| `score_priors.rmp.quality` | number | Mean RMP quality of rated UIUC instructors |
| `score_priors.rmp.difficulty` | number | Mean RMP difficulty |
| `score_priors.rmp.would_take_again` | number | Mean would-take-again, 0 to 100 |
| `score_priors.rmp.n_instructors` | number | Rated instructors in those means |

The site's "best pick" score pulls small samples toward `score_priors`
([DECISIONS.md](DECISIONS.md) D13).

### `data/search.json`

The home page search. Short field names keep it small.

| Field | Type | Meaning |
| --- | --- | --- |
| `courses[].s` | string | Subject, `CS` |
| `courses[].n` | string | Number, `124` |
| `courses[].t` | string | Title |
| `courses[].c` | string | Credit hours as printed, `3` or `3 OR 4` |
| `courses[].g` | string[] | Gen-ed codes (see the gen-ed codes below) |
| `courses[].gpa` | number \| null | Recent average GPA, or the all-time one when there's no recent one |
| `courses[].nx` | 0 \| 1 | Has sections next term |
| `courses[].cu` | 0 \| 1 | Has sections this term |
| `courses[].f` | string[] | Old codes of a renumbered course (optional) |
| `courses[].o` | string | When it usually runs, from the last four years: the seasons it runs in, comma-separated (`f` fall, `s` spring, `u` summer), `fo`/`fe`/`so`/`se` for a fall or spring in odd or even years only, `i` irregular, `n` not offered recently. `f,s` is every fall and spring (optional) |
| `instructors[].name` | string | Display name |
| `instructors[].k` | string | Instructor key |
| `instructors[].c` | string[] | Courses they teach next term, `["CS 124"]` |

**Gen-ed codes:** `ACP` Advanced Composition, `COMP1` Composition I, `HP` Historical & Philosophical, `LA` Literature
& Arts, `LS` Life Sciences, `PS` Physical Sciences, `QR1` and `QR2` Quantitative Reasoning I and II, `SS` Social
Sciences, `BSC` Behavioral Sciences, `NW` Non-Western, `US` US Minority, `WCC` Western/Comparative. Categories group
them: `HUM` (HP, LA), `NAT` (LS, PS), `SBS` (SS, BSC), `CS` cultural studies (NW, US, WCC), `QR`, `ACP` and `COMP1`.

### `data/course/<SUBJECT>/<NUMBER>.json`

One file per course offered this term or next, or with recent GPA data: `data/course/CS/124.json`.

| Field | Type | Meaning |
| --- | --- | --- |
| `subject` | string | `CS` |
| `number` | string | `124` |
| `title` | string | Title |
| `subject_name` | string | "Computer Science" |
| `credits` | string | Credit hours as printed, "3 hours." |
| `credit_range` | [number, number] | Fewest and most credit hours |
| `description` | string | Catalog description |
| `prereq` | string | Prerequisite text as printed |
| `section_info` | string | Course Explorer's section information ("Same as ...") |
| `schedule_info` | string | Course Explorer's schedule information |
| `latest_term` | string \| null | Newest term the course is listed in |
| `geneds.codes` | string[] | Gen-ed codes |
| `geneds.categories` | string[] | Gen-ed categories |
| `gpa` | object \| null | Course GPA from the GPA dataset |
| `gpa.avg` | number | All-time average GPA |
| `gpa.recent` | number \| null | Average over `meta.gpa.recent` |
| `gpa.students` | number | Grades behind `avg` |
| `gpa.recent_students` | number | Grades behind `recent` |
| `gpa.terms_covered` | number | Terms with grades |
| `gpa.first_term` | string | First term with grades |
| `gpa.last_term` | string | Last term with grades |
| `gpa.recent_terms` | string[] | First and last term of the recent window |
| `gpa.pct.A` | number \| null | Share of A grades (A+, A, A-) |
| `gpa.pct.B` | number \| null | Share of B grades |
| `gpa.pct.C` | number \| null | Share of C grades |
| `gpa.pct.DF` | number \| null | Share of D and F grades |
| `gpa.pct.W` | number \| null | Share of withdrawals |
| `gpa.by_term[].term` | string | Term |
| `gpa.by_term[].gpa` | number \| null | Average GPA that term |
| `gpa.by_term[].students` | number | Grades that term |
| `gpa.by_term[].pct.A` | number \| null | As `gpa.pct`, for that term |
| `gpa.by_term[].pct.B` | number \| null | |
| `gpa.by_term[].pct.C` | number \| null | |
| `gpa.by_term[].pct.DF` | number \| null | |
| `gpa.by_term[].pct.W` | number \| null | |
| `gpa.by_term[].as` | string | The old code it was taught under, for a renumbered course (optional) |
| `pattern` | object \| null | When the course is usually offered |
| `pattern.label` | string | "Every fall and spring", "Fall only", ... |
| `pattern.target` | string | Term the prediction is for |
| `pattern.likelihood` | string | `High`, `Medium` or `Low` |
| `pattern.reason` | string | Why |
| `history[].term` | string | A term the course was offered |
| `history[].n_sections` | number | Sections that term |
| `history[].online_share` | number \| null | Share of sections online, 0 to 1 |
| `history[].instructors` | string[] | Instructors as printed |
| `history[].as` | string | Old code, for a renumbered course (optional) |
| `terms.<term>.label` | string | "Spring 2027" (only this term and next) |
| `terms.<term>.checked_at` | string | When sections and seats were read |
| `terms.<term>.source` | string | Where they came from |
| `terms.<term>.status_known` | boolean | Seat status was read (false before registration opens) |
| `terms.<term>.n_primary` | number | Lectures (primary sections) |
| `terms.<term>.n_open` | number \| null | Lectures open, `null` when status isn't known |
| `terms.<term>.sections[].crn` | string | CRN, 5 digits |
| `terms.<term>.sections[].code` | string | Section code, `AL1` |
| `terms.<term>.sections[].type` | string | Type code, `LEC`, `DIS`, `LAB`, `ONL`, ... |
| `terms.<term>.sections[].type_name` | string | "Lecture" |
| `terms.<term>.sections[].component` | string | `primary`, or the secondary type (`DIS`, `LAB`) you take with it |
| `terms.<term>.sections[].group` | string | Link group: sections pair within a group; `*` pairs with any |
| `terms.<term>.sections[].part` | string | Part of term: `1` full term, `A` first half, `B` second half |
| `terms.<term>.sections[].status` | string | Seat status as printed: `Open`, `Closed`, `Open (Restricted)`, `CrossListOpen`, ... |
| `terms.<term>.sections[].status_code` | string | Course Explorer status code; `P` is pending (not yet open) |
| `terms.<term>.sections[].status_at` | string | When the status was read (`""` unknown) |
| `terms.<term>.sections[].status_since` | string | When it last changed to this status (`""` unknown) |
| `terms.<term>.sections[].credits` | string | Section credit hours, if different from the course |
| `terms.<term>.sections[].title` | string | Section title (topics courses) |
| `terms.<term>.sections[].text` | string | Section text and notes, including restrictions |
| `terms.<term>.sections[].special` | string | Why it looks restricted or special-program (`""` if it doesn't) |
| `terms.<term>.sections[].instructors` | string[] | Instructor keys |
| `terms.<term>.sections[].instructors_raw` | string[] | Instructors as printed, "Challen, G" |
| `terms.<term>.sections[].meetings[].d` | number | Days mask |
| `terms.<term>.sections[].meetings[].s` | number \| null | Start time |
| `terms.<term>.sections[].meetings[].e` | number \| null | End time |
| `terms.<term>.sections[].meetings[].b` | string | Building |
| `terms.<term>.sections[].meetings[].r` | string | Room |
| `terms.<term>.sections[].fx` | array | Final exams: `[date, start, end, type]`; type `Conflict` is the make-up slot (optional) |
| `instructors.<instructor key>.name` | string | Display name |
| `instructors.<instructor key>.teaching` | string[] | Terms they teach it, of this term and next |
| `instructors.<instructor key>.in_gpa_dataset` | boolean | Has grades for this course |
| `instructors.<instructor key>.tre` | string[] | Recent terms on the Teachers Ranked as Excellent list |
| `instructors.<instructor key>.gpa` | object \| null | Their grades in this course |
| `instructors.<instructor key>.gpa.avg` | number | All-time average GPA |
| `instructors.<instructor key>.gpa.recent` | number \| null | Recent average GPA |
| `instructors.<instructor key>.gpa.students` | number | Grades |
| `instructors.<instructor key>.gpa.n_terms` | number | Terms taught |
| `instructors.<instructor key>.gpa.first_term` | string | First term taught |
| `instructors.<instructor key>.gpa.last_term` | string | Last term taught |
| `instructors.<instructor key>.gpa.delta` | number \| null | Their GPA minus the course GPA |
| `instructors.<instructor key>.gpa.limited` | boolean | Few grades: read with care |
| `instructors.<instructor key>.gpa.pct.A` | number \| null | As `gpa.pct` |
| `instructors.<instructor key>.gpa.pct.B` | number \| null | |
| `instructors.<instructor key>.gpa.pct.C` | number \| null | |
| `instructors.<instructor key>.gpa.pct.DF` | number \| null | |
| `instructors.<instructor key>.gpa.pct.W` | number \| null | |
| `instructors.<instructor key>.rmp` | object \| null | Rate My Professors profile, when it fits this subject |
| `instructors.<instructor key>.rmp.id` | string | RMP id |
| `instructors.<instructor key>.rmp.url` | string | RMP page; link to it when you show ratings |
| `instructors.<instructor key>.rmp.rating` | number \| null | Quality, 1 to 5 |
| `instructors.<instructor key>.rmp.difficulty` | number \| null | Difficulty, 1 to 5 |
| `instructors.<instructor key>.rmp.would_take_again` | number \| null | Would take again, 0 to 100 (`-1` unknown) |
| `instructors.<instructor key>.rmp.num_ratings` | number | Ratings |
| `instructors.<instructor key>.rmp.tags` | string[] | Most common tags |
| `instructors.<instructor key>.rmp.reviews[].course` | string | Course the review is for, as written (`CS124`) |
| `instructors.<instructor key>.rmp.reviews[].date` | string | Date |
| `instructors.<instructor key>.rmp.reviews[].text` | string | Review text |
| `instructors.<instructor key>.rmp.fetched_at` | string | When it was read |
| `instructors.<instructor key>.exam` | object \| null | Exam format for this instructor (same fields as `exam_course`) |
| `instructors.<instructor key>.exam.<field>.value` | any | Found value, or `"unknown"` |
| `instructors.<instructor key>.exam.<field>.agree` | number \| null | Sources that agree with `value` |
| `instructors.<instructor key>.exam.<field>.total` | number \| null | Sources that mention it |
| `instructors.<instructor key>.exam.<field>.evidence[].quote` | string | Quote behind it |
| `instructors.<instructor key>.exam.<field>.evidence[].source` | string | Where the quote is from |
| `exam_course` | object \| null | Exam format for the course as a whole, read from its text and reviews |
| `exam_course.<field>.value` | any | Found value, or `"unknown"` |
| `exam_course.<field>.agree` | number \| null | Sources that agree with `value` |
| `exam_course.<field>.total` | number \| null | Sources that mention it |
| `exam_course.<field>.evidence[].quote` | string | Quote behind it |
| `exam_course.<field>.evidence[].source` | string | Where the quote is from |
| `changes[].term` | string | Term of a change |
| `changes[].field` | string | What changed: `number`, `title`, `prereq_text`, `credit_hours`, `instructor`, ... |
| `changes[].summary` | string | The change in words |
| `biggest_change` | object \| null | The change worth showing first, this term or next |
| `biggest_change.term` | string | |
| `biggest_change.field` | string | |
| `biggest_change.summary` | string | |
| `notes[].instructor` | string | Instructor as printed, or `""` for the whole course |
| `notes[].term` | string | Term, or `""` |
| `notes[].text` | string | A maintainer's note |
| `notes[].source` | string | Where it's from |
| `seat_events[].term` | string | Seat changes for this course, newest first (see `seat-events.json`) |
| `seat_events[].at` | string | |
| `seat_events[].crn` | string | |
| `seat_events[].s` | string | |
| `seat_events[].n` | string | |
| `seat_events[].code` | string | |
| `seat_events[].old` | string | |
| `seat_events[].new` | string | |
| `formerly[].code` | string | An old code of a renumbered course, `CS 199` |
| `formerly[].until` | string \| null | Last term under the old code |
| `formerly[].source` | string | Where the renumbering is stated |

Exam format fields (`<field>` above): `n_midterms` (number), `has_final`, `curve`, `attendance_required`,
`group_projects` and `textbook_required` (`yes` or `no`; `has_final` can also be `optional`), `exam_mode`
(`in-person`, `CBTF`, `online` or `take-home`) and `homework_platform` (a list of names: `PrairieLearn`, `Gradescope`,
`WebAssign`, ...). They're read from text with rules, so treat
them as hints ([DECISIONS.md](DECISIONS.md)).

### `data/geneds.json`

The gen-ed finder: every course with a gen-ed code that has sections next term or is on the gen-ed list.

| Field | Type | Meaning |
| --- | --- | --- |
| `[].s` | string | Subject |
| `[].n` | string | Number |
| `[].t` | string | Title |
| `[].codes` | string[] | Gen-ed codes |
| `[].cats` | string[] | Gen-ed categories |
| `[].cr` | [number, number] | Fewest and most credit hours |
| `[].gpa` | number \| null | Recent average GPA |
| `[].gpaN` | number | Grades behind it |
| `[].pctA` | number \| null | Share of A grades |
| `[].nSec` | number | Lectures next term |
| `[].nOpen` | number \| null | Lectures open next term |
| `[].statusKnown` | boolean | Seat status was read |
| `[].best` | object \| null | Next term's lecturer with the highest GPA here (60 or more grades) |
| `[].best.key` | string | Instructor key |
| `[].best.name` | string | Name |
| `[].best.gpa` | number | Their GPA in the course |
| `[].best.students` | number | Grades behind it |
| `[].rmp` | number \| null | Best RMP quality among next term's lecturers |
| `[].opts` | array | Each way to take it: `[earliest start, latest end, days mask, flags]`, `-1` when untimed. Flags: 1 a section was Closed, 2 possible with special sections, 4 possible by default |
| `[].profs[].k` | string | Next term's lecturers: instructor key |
| `[].profs[].name` | string | Name |
| `[].profs[].d` | number \| null | Their GPA minus the course GPA |
| `[].profs[].dn` | number | Grades behind `d` |
| `[].profs[].rmp` | array \| null | `[quality, difficulty, would take again, ratings]` |
| `[].profs[].open` | [number, number] \| null | `[open lectures, lectures]` they teach, `null` when status isn't known |

### `data/summer.json`

The newest summer's classes (the gen-ed finder's Summer view, the Summer line on course pages and the search). Not
written when no summer term is loaded.

| Field | Type | Meaning |
| --- | --- | --- |
| `term` | string | `2026-su` |
| `label` | string | "Summer 2026" |
| `recent` | string[] | Up to the last 3 summers, oldest first |
| `upcoming` | boolean | The summer is still ahead; false means it's last summer's list until the next is out |
| `next` | string | The summer after `term` |
| `next_label` | string | "Summer 2027" |
| `courses[].s` | string | Subject |
| `courses[].n` | string | Number |
| `courses[].t` | string | Title |
| `courses[].cr` | [number, number] \| null | Fewest and most credit hours |
| `courses[].codes` | string[] | Gen-ed codes |
| `courses[].nSec` | number | Class sections |
| `courses[].online` | string | `all`, `some` or `none` of its sections online |
| `courses[].sess` | string[] | Sessions: `S1` Session I (4 weeks from mid-May), `S2` Session II (8 weeks from mid-June), `full` (12 weeks), `S18`, `A`, `S2A`, `S2B`, `B`, `other` |
| `courses[].ran` | number | How many of `recent` it ran in |
| `courses[].gpa` | number \| null | Recent average GPA over all terms |
| `courses[].page` | boolean | Has a course file (offered this term or next, or with recent grades) |

### `data/crns.json`

Find a section by CRN. Next term comes first.

| Field | Type | Meaning |
| --- | --- | --- |
| `<term>.<crn>` | [string, string, string, string] | `[subject, number, section code, type name]` |

### `data/renumbered.json`

Old course codes that now redirect to a renumbered course.

| Field | Type | Meaning |
| --- | --- | --- |
| `<old code>` | string | New code, `"CS 199": "CS 124"` |

### `data/buildings.json`

Where each building in the section data is, from OpenStreetMap. Keys are building names exactly as a meeting's `b`
field has them, so `buildings[meeting.b]` finds the place. Online, arranged and "Location Pending" meetings, and
places off campus, have no entry; neither does a building OpenStreetMap doesn't have yet. `buildings` is empty when
OpenStreetMap couldn't be reached during the build.

| Field | Type | Meaning |
| --- | --- | --- |
| `credit` | string | The credit OpenStreetMap's licence asks for: show it next to anything drawn from this file |
| `osm_base` | string | When the OpenStreetMap data was current |
| `buildings.<building>.name` | string | The building's OpenStreetMap name: "Electrical and Computer Engineering Building" for `Electrical & Computer Eng Bldg` |
| `buildings.<building>.short` | string | OpenStreetMap's short name (`LCLB`, `CRCE`), or `null` |
| `buildings.<building>.lat` | number | Latitude of the building's centre |
| `buildings.<building>.lon` | number | Longitude of the building's centre |

### `data/transit.json`

MTD's published timetable (GTFS) for stops within 500 m of a class building or a place to live, for a normal week of
classes: each weekday's most common set of services, so holidays and breaks don't show. Only buses that call at two or
more of those stops are kept, grouped into patterns (same route, headsign, stops and minutes between them). A trip
on pattern `p` leaving at `t` calls at stop `p.s[i]` at `t + p.o[i]`. The feed covers one term at a time: until MTD
publishes the next term, its times are the current term's. Everything but `homes` is empty when the feed couldn't be
downloaded.

| Field | Type | Meaning |
| --- | --- | --- |
| `credit` | string | "Data provided by Champaign-Urbana Mass Transit District": show it next to the bus times |
| `feed.version` | string | MTD's name for this feed |
| `feed.start` | string | First day the feed covers |
| `feed.end` | string | Last day the feed covers |
| `week.<weekday>` | string | An example date whose service is the weekday's (`0` Monday ... `6` Sunday) |
| `routes` | [string, string, string, string][] | Short name, long name, colour and text colour (hex, no `#`): `["22", "Illini", "5a1d5a", "ffffff"]` |
| `stops` | [string, number, number][] | Name, latitude, longitude: `["Wright & Healey (East Side)", 40.112038, -88.228853]` |
| `patterns[].r` | number | Index into `routes` |
| `patterns[].h` | string | Headsign: where the bus is going |
| `patterns[].s` | number[] | The stops it calls at, in order (indexes into `stops`) |
| `patterns[].o` | number[] | Minutes from the first stop to each stop; `o[0]` is 0 |
| `patterns[].t` | [number, number][] | One entry per trip: departure from the first stop (minutes after midnight, past 1440 after midnight) and the days it runs (a bit mask, Monday 1 ... Sunday 64) |
| `homes[].name` | string | A residence hall, house or apartment building, as OpenStreetMap names it |
| `homes[].kind` | string | `hall` (residence halls and houses) or `apartments` |
| `homes[].lat` | number | Latitude |
| `homes[].lon` | number | Longitude |

### `data/seat-events.json`

Seat status changes from the last 7 days, newest first, at most 3,000 (the Just opened page).

| Field | Type | Meaning |
| --- | --- | --- |
| `[].term` | string | Term |
| `[].at` | string | When the change was seen |
| `[].crn` | string | CRN |
| `[].s` | string | Subject |
| `[].n` | string | Number |
| `[].t` | string | Course title |
| `[].code` | string | Section code |
| `[].old` | string | Status before |
| `[].new` | string | Status after |

### `data/degrees/index.json`

Every major and minor in the degree checklist.

| Field | Type | Meaning |
| --- | --- | --- |
| `[].id` | string | File name in `degrees/`, `computer-science-bs` |
| `[].type` | string | `major` or `minor` |
| `[].program` | string | "Computer Science, BS" |
| `[].college` | string | College |
| `[].catalog_year` | string | `2026-2027` |
| `[].groups` | number | Requirement groups |
| `[].generated` | string | When the file was made from the catalog |

### `data/degrees/<id>.json`

One program's requirements, from the Academic Catalog. [DEGREE-DATA.md](DEGREE-DATA.md) explains the rules and how the
files are checked.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Program id |
| `type` | string | `major` or `minor` |
| `program` | string | Program name |
| `college` | string | College |
| `catalog_year` | string | Catalog year |
| `source` | string | Catalog page |
| `read_on` | string | When the catalog was read |
| `generated` | string | When the file was made |
| `total_hours` | number \| null | Hours to graduate |
| `notes` | string[] | Notes from the catalog |
| `unknown` | string[] | Listed course codes not in this term's or next term's data |
| `double_counting[].within` | string | An exclusive set (see `groups[].exclusive`): whether one course can count for two of its groups |
| `double_counting[].between` | string[] | Two kinds (`program`, `gened`) or exclusive sets: whether one course can count for both |
| `double_counting[].allow` | boolean | Whether counting for both is allowed |
| `double_counting[].approved_for` | string[] | With `between`: only for courses approved for these gen-ed codes (optional) |
| `double_counting[].quote` | string | The rule as the source says it |
| `double_counting[].source` | string | Where it's from |
| `major_overlap` | object[] | A minor's coursework that must be distinct from the major (empty for most programs; DEGREE-DATA.md) |
| `major_overlap[].distinct_hours` | number | Hours of the minor's coursework that must not also count toward the major (or `distinct_courses`) |
| `major_overlap[].distinct_courses` | number | The same as a number of courses |
| `major_overlap[].min_level` | number | Only courses at this level or above count toward it (300 = "advanced") (optional) |
| `major_overlap[].from` | string[] | Course ranges it's about, when the minor's lists don't name them (optional) |
| `major_overlap[].exclude` | string[] | Courses in `from` that don't count (optional) |
| `major_overlap[].minors_too` | boolean | Distinct from the student's other minors too (optional) |
| `major_overlap[].quote` | string | The rule in the catalog's words |
| `major_overlap[].source` | string | The minor's catalog page |
| `groups[].id` | string | Group id |
| `groups[].name` | string | "Composition I" |
| `groups[].section` | string | Heading it's under |
| `groups[].kind` | string | `program` or `gened` |
| `groups[].rule` | string | `all`, `n_of`, `hours` or `manual` |
| `groups[].n` | number \| null | Courses needed for `n_of` |
| `groups[].hours` | number \| null | Hours needed for `hours` |
| `groups[].items` | array | Listed choices: each item is a list of alternatives, each alternative a list of codes taken together |
| `groups[].from` | string[] | Selectors for open lists: a code, a range like `CS 400-499`, or `gened:HP` |
| `groups[].eligible` | string[] | Codes the selectors match, minus `exclude`; empty for gen-ed-only groups (use `gened-courses.json`) |
| `groups[].exclude` | string[] | Codes that don't count |
| `groups[].max_hours.<selector>` | number | Most hours that can come from that selector |
| `groups[].min_from.<selector>` | number | Fewest courses that must come from that selector |
| `groups[].not_with` | string[] | Group ids a course can't also count for |
| `groups[].exclusive` | string \| null | The exclusive set the group is in, for `double_counting[].within` |
| `groups[].source` | string \| null | Where the group is stated |
| `groups[].notes` | string[] | Notes |
| `courses.<code>.t` | string | Facts about every listed course that isn't in `gened-courses.json`: title |
| `courses.<code>.cr` | [number, number] | Fewest and most credit hours |
| `courses.<code>.g` | string[] | Gen-ed codes |
| `courses.<code>.page` | boolean | Has a course file |
| `courses.<code>.gpa` | number \| null | Recent GPA, or all-time when there's no recent one (courses with a page) |
| `courses.<code>.gn` | number | Grades behind it |
| `courses.<code>.nx` | 0 \| 1 | Has sections next term |
| `courses.<code>.nSec` | number | Lectures next term |
| `courses.<code>.nOpen` | number \| null | Lectures open |
| `courses.<code>.known` | boolean | Seat status was read |
| `courses.<code>.pre` | string | Prerequisite text |
| `courses.<code>.profs[].k` | string | As `geneds.json` `profs` |
| `courses.<code>.profs[].name` | string | |
| `courses.<code>.profs[].d` | number \| null | |
| `courses.<code>.profs[].dn` | number | |
| `courses.<code>.profs[].rmp` | array \| null | |
| `courses.<code>.profs[].open` | [number, number] \| null | |

### `data/degrees/gened-courses.json`

Every course with a gen-ed code, shared by all programs. Same fields as `courses.<code>` above.

| Field | Type | Meaning |
| --- | --- | --- |
| `<code>.t` | string | Title |
| `<code>.cr` | [number, number] | Fewest and most credit hours |
| `<code>.g` | string[] | Gen-ed codes |
| `<code>.page` | boolean | Has a course file |
| `<code>.gpa` | number \| null | Recent GPA |
| `<code>.gn` | number | Grades behind it |
| `<code>.nx` | 0 \| 1 | Has sections next term |
| `<code>.nSec` | number | Lectures next term |
| `<code>.nOpen` | number \| null | Lectures open |
| `<code>.known` | boolean | Seat status was read |
| `<code>.pre` | string | Prerequisite text |
| `<code>.profs[].k` | string | As `geneds.json` `profs` |
| `<code>.profs[].name` | string | |
| `<code>.profs[].d` | number \| null | |
| `<code>.profs[].dn` | number | |
| `<code>.profs[].rmp` | array \| null | |
| `<code>.profs[].open` | [number, number] \| null | |

### `data/ap-credit.json`

Course credit for AP scores, from CITL's tables, newest year first. [AP-CREDIT.md](AP-CREDIT.md) has the details.

| Field | Type | Meaning |
| --- | --- | --- |
| `years[].id` | string | First year, `2026` |
| `years[].label` | string | `2026-2027` |
| `years[].entering` | string | Which students the table is for |
| `years[].source` | string | CITL page |
| `years[].read_on` | string | When it was copied |
| `years[].notes` | string[] | Notes for the whole table |
| `years[].unknown` | string[] | Credited codes not in this build's courses |
| `years[].exams[].id` | string | Exam id, `CALCAB` |
| `years[].exams[].name` | string | "Calculus AB" |
| `years[].exams[].sub` | string \| null | Name of the subscore, if the exam has one |
| `years[].exams[].notes` | string[] | Notes |
| `years[].exams[].rows[].scores` | number[] | Scores the row applies to |
| `years[].exams[].rows[].sub` | number[] \| null | Subscores it applies to |
| `years[].exams[].rows[].college` | string \| null | `grainger` or `other` when credit depends on the college |
| `years[].exams[].rows[].with.<exam id>` | number[] | It applies only with these scores on another exam (0 = not taken) |
| `years[].exams[].rows[].credit` | array | `[[course code, hours], ...]`; `MATH 1--` is elective credit |
| `years[].exams[].rows[].message` | string \| null | CITL's note for the row |
| `years[].exams[].rows[].fix` | string \| null | Where the table was corrected by hand, and why |

### `data/ib-credit.json`

Course credit for IB scores. Same as `ap-credit.json`, plus levels and without `sub`, `college` and `with` values.

| Field | Type | Meaning |
| --- | --- | --- |
| `years[].id` | string | First year |
| `years[].label` | string | `2026-2027` |
| `years[].entering` | string | Which students the table is for |
| `years[].source` | string | CITL page |
| `years[].read_on` | string | When it was checked |
| `years[].notes` | string[] | Notes |
| `years[].unknown` | string[] | Credited codes not in this build's courses |
| `years[].exams[].id` | string | Exam id |
| `years[].exams[].name` | string | Exam name |
| `years[].exams[].sub` | null | Always `null` |
| `years[].exams[].levels` | string[] | `HL`, `SL` or both |
| `years[].exams[].notes` | string[] | Notes |
| `years[].exams[].rows[].level` | string | `HL` or `SL` |
| `years[].exams[].rows[].scores` | number[] | Scores, 1 to 7 |
| `years[].exams[].rows[].sub` | null | Always `null` |
| `years[].exams[].rows[].college` | null | Always `null` |
| `years[].exams[].rows[].with` | null | Always `null` |
| `years[].exams[].rows[].credit` | array | `[[course code, hours], ...]` |
| `years[].exams[].rows[].message` | string \| null | CITL's note |
| `years[].exams[].rows[].fix` | string \| null | Hand correction, and why |

### `data/feeds/<SUBJECT>/<NUMBER>.xml`

An RSS 2.0 feed of a course's seat changes (the last 50), for feed readers. One per course in `search.json`.

### `live.json`

Seat changes from the last 48 hours, rewritten about every 10 minutes during the day by `.github/workflows/live-seats.yml`. It isn't
under `data/`: read it from `meta.json` `live_url`, today
`https://raw.githubusercontent.com/kamransingri/illini-scheduler/live-seats/live.json`. Only the busiest next-term
courses are re-read.

| Field | Type | Meaning |
| --- | --- | --- |
| `updated` | string | When it was written |
| `window_hours` | number | How far back `events` goes |
| `checked.<term>` | number | Courses re-read in the window |
| `events[].term` | string | As `seat-events.json` |
| `events[].at` | string | |
| `events[].crn` | string | |
| `events[].s` | string | |
| `events[].n` | string | |
| `events[].t` | string | |
| `events[].code` | string | |
| `events[].old` | string | |
| `events[].new` | string | |
| `seen.<term>.<crn>` | [string, string] | Latest `[status, checked at]` of each section in `events` |
| `read.<term>.<course>` | string | When each course was last re-read |
| `watched.<term>` | string[] | Courses on the watch list (`data/watch.txt`) |

## Keeping this page up to date

`tools/api_docs.py` checks that every field in the exported files has a row on this page. It runs in pytest twice:
once on an export of the test fixtures (CI on every pull request) and once on the full export when
`web/public/data` exists (the nightly build). To check a folder by hand: `python -m tools.api_docs web/public/data`.
When you rename or remove a field, raise `DATA_FORMAT` in `pipeline/export.py` and say so in the CHANGELOG.
