# Design

How Illini Scheduler looks and why. Part 1 is the audit of the site as it was on 2026-11-16 (screenshots in
`docs/screenshots/before/`). Part 2 is the direction the redesign follows. Part 3 lists the tokens and shared
components that implement it.

## Part 1. Audit (before)

Built from `main` at 140df9d with full data, 1280px and 375px wide.

**Course page (CS 124, MATH 221, STAT 107).** The page that matters most, and the hardest to read.

- **Professor data is split in three places.** Sections name "Lewis, C"; the instructor card further down says
  "Colleen Lewis"; past instructors are behind a link at the bottom. Nothing connects a section row to its
  professor's card. On STAT 107 the first instructor card starts after 27 section rows (about 1,500px down); on
  MATH 221 after 60+.
- **Reviews have no clear owner.** RMP snippets sit in the card as small quotes with "(CS105 2026-05-13)" after each.
  On CS 124 all three reviews are for CS 105, and nothing says they're for another course. On MATH 221 one card shows
  2011–2018 reviews for AFRO 310 and EPS 310, which is almost certainly a different person matched by "Anderson, J".
- **A wall of identical cards.** MATH 221 (Fall 2026) shows 30+ two-column cards, mostly discussion TAs, each
  repeating the same 3-line paragraph ("No grades on record for this instructor ... new instructors appear only
  after their first term is published"). Lecturers and TAs look the same.
- **Too much small grey text.** Source lines, the chart caption, review text, "Teaching Spring 2027", tags and the
  seat-status explanation are 12px #566173; the chart axis labels are SVG text that renders at about 5px on a phone.
- **The same kind of number formatted different ways.** RMP is "Quality 2.2/5" while GPA is a bare "3.59"; dates
  are "Nov 16, 2026" in one place and "2026-05-13" in another; terms are "Fall 2021" in text and "2021-fa" on the
  chart axis; the summary shows the recent GPA while the instructor block shows the all-time one.
- **Colour has no single meaning.** Orange is the brand, the "Add to schedule" button, every link, gen-ed badges and
  the focus ring. Green is "Open", the "High" outlook, the A grade segment and "above average". Red is "Closed", the
  D/F segment and "below average". Amber is "Restricted", C grades, "special" and "Limited data".
- **Dotted underlines look like links.** Every number with a source (`Metric`) has a dotted underline and a
  hover-only tooltip, which phones can't open.
- **Explanations push the data down.** "Each card's ± compares that instructor with the course in the terms they
  taught (grading changes over the years...)", the RSS paragraph and the chart caption are full paragraphs between
  the heading and the numbers.
- **Template tells.** An all-caps "BEFORE YOU REGISTER" eyebrow, a unicode star on "★ Ranked excellent", "↗" after
  every external link ("Check live seats ↗" 40 times on a page), and middle-dot strings ("CS 124 · Computer
  Science", "Instructors · Spring 2027", "n=352 · 97% A").
- **Mobile.** The summary's four facts wrap into a narrow 2x2 grid with underlined headline text; section cards put
  CRN, code, time, place and professor in an order that changes from row to row.

**Gen-ed finder.** Course rows are good, but each row has four differently sized columns with their own grey
label ("Recent GPA", "Best instructor next term", "Open") repeated on every row, a full orange button on every
row, and gen-ed badges in the same orange as the button. The intro paragraph is 14px grey.

**Schedule builder.** Each course in the cart gets its own tinted card (blue, yellow, green), and those colours mean
nothing outside the calendar. The help text for "Include special sections" is grey 12px in parentheses. The sliders
and the big orange button use the same colour as links.

**Just opened.** Every row repeats a full orange "Add to schedule" button (50 identical buttons in a screen); the
status change "LD8 opened (Closed → CrossListOpen)" is green text, so "opened" relies on colour; CRN and time are
grey 12px.

**Home.** Four bordered cards with an arrow after each title; the "Data freshness" card is styled like a link but
isn't one.

**Site-wide.** No brand fonts (system UI stack), body text mixes 12, 13, 14 and 16px, borders around nearly every
block, the footer disclaimer is the only place sources are explained.

## Part 2. Direction

**Subject, audience, job.** UIUC students choosing a course, a professor and a section, usually during a
registration window, often on a phone. The page has one job: put the numbers that decide "which professor, which
section" side by side so they can be compared without reading paragraphs, then hand off to Self-Service.

**Concept: a ledger.** Professors, sections and courses are rows on one shared column grid, so the same kind of number
sits in the same column all the way down the page and comparisons come from alignment, not from cards. A row expands
in place to show everything else about that professor. This aligned, expandable professor ledger is the one bold
element; everything around it stays quiet.

### Typography

- **Faces** (brand.illinois.edu/visual-identity/typography): Source Sans 3 for everything (the brand's "workhorse",
  free, variable), Montserrat for page and section headings and the one headline number in a block (the brand's face
  for "headings, subheadings, large stand-out numbers"). Both are self-hosted at build time by `next/font`.
- **Five sizes, no others:** 14px (labels, captions, meta), 16px (body), 19px (row titles, h3), 24px (section headings,
  headline numbers), 32px (page title). Body text is 16px; nothing is smaller than 14px.
- **Tabular numbers** (`tnum`) on every GPA, rating, percentage, count and time, so columns line up.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows above headings.

### Colour

From the Illinois brand web palette (brand.illinois.edu/visual-identity/color and brand.illinois.edu/web/web-color,
read 2026-11-16). Each colour has one meaning.

| Token | Hex | Brand name | Meaning | Contrast on white |
| --- | --- | --- | --- | --- |
| `ink` | #252525 | il-storm-10 | Body text | 15.3 |
| `heading` / `navy` | #13294B | il-blue | Headings, headline numbers, site header | 14.5 |
| `action` | #1D58A7 | il-industrial | **Every** link and button, focus ring. Nothing else is this colour | 7.0 |
| `orange` | #FF5F05 | il-orange | Brand mark only (wordmark, the rule under the header). Never small text | — |
| `muted` | #5E6162 | Storm shade | Secondary text. Brand Storm #707372 is 4.35:1 on the grey panel, so a darker shade is used | 6.3 (5.7 on panel) |
| `panel` | #F4F4F4 | il-storm-95 | The one quiet surface | — |
| `up` | #006230 | il-prairie | Higher than the course average | 7.5 |
| `down` | #B42318 | data red | Lower than the course average. The brand palette has no red; the brand allows extra colours for data | 6.6 |
| `open` on `open-bg` | #00606C on #E0F2F4 | Patina | Seat status: Open | 6.3 |
| `restricted` on `restricted-bg` | #7D3E13 on #FEF0D0 | Earth on Harvest tint | Seat status: Open (Restricted) | 7.2 |
| `closed` on `closed-bg` | #4A4C4B on #EEEEEE | Storm | Seat status: Closed | 7.5 |

- Green and red appear **only** as "above / below the course average" (GPA difference). Seat status never uses them.
- Every coloured state also has words: "+0.12" with "above the course average" for screen readers, "Open",
  "Restricted", "Closed" on every seat badge.
- The grade distribution bar uses a blue-to-grey ramp (A darkest, D/F lightest) with the percentages written out, so
  it doesn't borrow the meaning of green and red.

### Spacing and surfaces

- Tailwind's 4px scale only (4, 8, 12, 16, 24, 32, 48). One radius: 4px.
- Rows separated by hairlines and whitespace, not boxed in cards. The only filled surface is `panel`, used for the
  course summary and an expanded professor panel.
- Content is left aligned. Text blocks are capped at about 70 characters per line.
- The page is 72rem wide at most, so a list row can show every column next to the gen-ed filters.

### Hierarchy

- Each block has one main number (Montserrat, 24px, `heading`); everything else is 14–16px.
- Where a number comes from (source, term range, sample size) sits behind an (i) button next to it: hover, focus or
  tap opens it. Nothing is dropped, it just stops pushing the data down the page.
- One disclaimer, in the footer.

### Not a template

No emoji or unicode stars as icons, no gradients, no arrows appended to links, no walls of identical cards, no
middle-dot strings of metadata, no filler copy. One icon set (`components/ui/Icon.tsx`: 16px line icons, 1.75 stroke)
used everywhere; the external-link icon only marks links that leave the site.

## Part 3. Tokens and components

**Tokens** live in the `@theme` block of `web/app/globals.css`. Tailwind's default type and radius scales are reset
(`--text-*: initial`, `--radius-*: initial`), so `text-xs`, `text-3xl`, `rounded-lg` and friends simply don't exist and
can't creep back in. Classes to use:

| Kind | Classes |
| --- | --- |
| Text | `text-ink`, `text-heading`, `text-muted`, `text-action`, `text-up`, `text-down` |
| Surfaces | `bg-white`, `bg-panel`, `bg-navy` (site header), `bg-action-tint` (selected / hover) |
| Seat status | `bg-open-bg text-open`, `bg-restricted-bg text-restricted`, `bg-closed-bg text-closed` (only via `<SeatStatus>`) |
| Grades | `bg-grade-a`, `bg-grade-b`, `bg-grade-c`, `bg-grade-df` (only via `<GradeBar>` / `<GpaChart>`) |
| Type | `text-sm` 14, `text-base` 16, `text-lg` 19, `text-xl` 24, `text-2xl` 32; `font-display` (Montserrat); `tnum` for numbers |
| Radius | `rounded` (4px), `rounded-full` for dots |
| Course colours | `course-0` ... `course-5` with `course-swatch` / `course-block`: brand supporting colours that tell courses apart in the schedule calendar and cart, and nothing else |

**Shared components** (`web/components/ui/`):

| Component | Use |
| --- | --- |
| `Icon` | The only icon set: chevrons, info, external, copy, check, plus, rss, award, sort, alert... |
| `Info` | (i) button with a popover for a number's source, term range and sample size; hover, focus or tap |
| `Stat` | One labelled number with optional sub-line and source (`<dl>` item) |
| `Badge` | Neutral chip: gen-ed code, credit hours, "Limited data", "special" |
| `SeatStatus` | Open / Restricted / Closed badge: own colours, a dot and the word |
| `Delta` | ± difference from the course average in green/red, with "above/below the course average" for screen readers |
| `SectionHeader` | h2/h3 with actions on the right and a one-line lead |
| `DataRow` | Label/value row inside a `<dl>` |
| `Expandable` | Disclosure button + panel (`aria-expanded`, `aria-controls`) |
| `CourseRow` | One course in any list (search results, gen-ed finder, degree checklist): code and title, then fixed columns (score, GPA, best professor, RMP, next term, action) in the same place on every list. Uses container queries, so it lays out by the width it gets (a narrow sidebar stacks it) |

`web/components/WeightsControl.tsx` is the one place students set the best-pick weights (course page, gen-ed finder,
degree checklist). Course-page pieces built on them live in `web/components/course/` (`ProfessorLedger`, `SectionsList`, `CompareTable`,
`BestPick`, `ScoreBreakdown`, `CourseView`).
