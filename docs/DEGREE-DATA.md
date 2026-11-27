# Degree requirements

One YAML file per program in `data/degrees/`, read from the official Academic Catalog page for one catalog year
(https://catalog.illinois.edu/). Most files are written by `python -m pipeline.catalog_import` (they carry a
`generated:` date). Seven were checked by hand line by line and have no `generated:` key: `accountancy-bs`,
`computer-science-bs`, `economics-balas`, `finance-bs`, `finance-data-science`, `mechanical-engineering-bs` and
`psychology-bslas`. In all there are 466 files: 317 majors and concentrations, 127 minors (`-minor`) and 22
certificates (`type: certificate`). Never fill a file in from memory: if the catalog
can't be read, leave `groups: []` and say so in the pull request. `make data` validates every file (`pipeline/degrees.py`), checks each course code against
the Course Explorer data it loads, logs codes it can't find, and exports `web/public/data/degrees/<id>.json` for the
degree checklist at `/degree/`.

## File

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Slug, same as the file name (`finance-data-science`; minors end in `-minor`) |
| `type` | no | `minor` for a minor, `certificate` for a certificate (its `source` may be any illinois.edu page, D54); leave it out for a major |
| `program`, `college` | yes | As the catalog names them |
| `catalog_year` | yes | `2026-2027` |
| `source` | yes | The catalog page URL |
| `read_on` | yes | Date the page was read, `YYYY-MM-DD` |
| `generated` | no | Date `pipeline/catalog_import.py` wrote the file. The importer overwrites only files that have this key; delete it once you've checked a file by hand |
| `total_hours` | no | Minimum hours for the degree, or for the minor (the lowest number of a range like "18-21") |
| `notes` | no | Catalog text for rules the schema can't express (copied, not paraphrased) |
| `double_counting` | no | When one course may count toward two requirements (below) |
| `major_overlap` | no | A minor's coursework that must be distinct from the major (below) |
| `not_open_to` | no | Catalog-backed major or college eligibility restrictions for minors and certificates (below) |
| `groups` | yes | The requirement groups, in catalog order |

A short example, from the hand-checked `finance-data-science.yaml`:

```yaml
id: finance-data-science
program: Finance + Data Science, BS
college: Gies College of Business
catalog_year: 2026-2027
source: https://catalog.illinois.edu/undergraduate/bus/finance-data-science-bs/
read_on: 2026-11-16
total_hours: 124
groups:
  - id: business-core
    name: Business core
    section: Business Core Requirements
    rule: all
    courses: [ACCY 201, ACCY 202, BADM 275, BADM 300, BADM 310, BADM 320, BADM 449, BUS 101, BUS 201, BUS 401,
              CMN 101, ECON 102, ECON 103, FIN 221]
```

## Groups

| Key | Meaning |
| --- | --- |
| `id`, `name` | Unique id; the name shown on the checklist |
| `section` | The catalog heading it sits under (groups with the same section are shown together) |
| `kind` | `program` (default) or `gened` |
| `rule` | `all` (every item), `n_of` (`n` items), `hours` (at least `hours` credit hours), `manual` (the student ticks it: a language requirement that high-school work can satisfy, or any rule the catalog states in prose; its `notes` hold the catalog's words and its `courses`, if any, are shown as links and never counted) |
| `courses` | Items. An item is a code (`MATH 221`), a sequence that counts as one item (`RHET 101 + RHET 102`), or a list of alternatives (`[STAT 107, CS 107, IS 107]`) |
| `from` | Selectors instead of a list: a number range (`FIN 400-499`) or a gen-ed code (`gened:HP`) |
| `exclude` | Codes a selector must not match (`[FIN 494, FIN 495]`) |
| `max_hours` | Cap on what one course can contribute (`{FIN 490: 3}`) |
| `min_from` | At least this many items must match a selector (`{gened:QR1: 1}`) |
| `not_with` | A course used for one of these group ids can't also count here ("four *additional* courses") |
| `exclusive` | Name of a set of groups no single course may satisfy two of (`cultural-studies`) |
| `source`, `notes` | Override the page URL for this group; catalog text to show with it |

Gen-ed codes: `ACP`, `COMP1`, `HP`, `LA`, `LS`, `PS`, `QR1`, `QR2`, `SS`, `BSC`, `NW`, `US`, `WCC`.

## Double counting

A list of rules, checked in order; the first that matches a pair of requirements decides. A pair no rule covers is
shown as "rules unclear" instead of guessed.

```yaml
double_counting:
  - allow: false
    within: cultural-studies          # two groups of the same exclusive set
    quote: "...no single course can fulfill multiple Cultural Studies categories."
    source: https://gened.illinois.edu/requirements/
  - allow: true
    between: [gened, gened]
    approved_for: [ACP, QR2]          # only a course approved for one of these and another category
    quote: "Individual courses will be approved to satisfy only one General Education requirement except as follows. ..."
    source: https://gened.illinois.edu/faculty-staff/details-criteria/
  - allow: true
    between: [program, gened]         # kinds or exclusive-set names
    quote: "Some Gen Ed requirements may be met by courses required and/or electives in the program."
    source: https://catalog.illinois.edu/...
```

`approved_for` (gen-ed codes, with `between` only) narrows a rule to courses approved for one of those categories and
at least one more; it's how the campus exception for Advanced Composition and Quantitative Reasoning II is written
(DECISIONS.md D32). An advisor's answer is a rule too: put their role and the date in `quote` and a written policy URL,
if they give one, in `source`.

## Overlap with the major (minors)

Some minor pages say part of the minor must not also count toward the major. Copy the sentence into a rule; a page
that says nothing gets none, and the checklist keeps saying the rules are unclear.

```yaml
major_overlap:
  - distinct_hours: 6                 # or distinct_courses: 2
    min_level: 300                    # only 300- and 400-level courses count toward it ("advanced")
    from: [UP 300-499]                # optional: the courses it's about, when the minor's own lists don't name them
    exclude: [UP 499]                 # optional, with from
    minors_too: true                  # "...distinct from credit earned for your major or another minor"
    quote: "At least six (6) hours of coursework must be advanced courses (300- or 400-level) and distinct from ..."
    source: https://catalog.illinois.edu/undergraduate/faa/minors/urban-studies-planning/
```

The checklist counts the minor's courses in My courses (on its lists, or in `from`) at `min_level` or above that the
major's own requirements don't use (its gen-eds aren't the major), nor another minor's with `minors_too`. A course on a
hand-ticked list of the major is counted, with a note that it may count there. The importer keeps this key when it
rewrites a generated file, so it survives a re-import (DECISIONS.md D43).

## Tracks

There is no `tracks` key: a track is the groups whose `name` ends in "Track" (`Microeconomics Track`, `Econometrics
Track`), which is how the importer already writes them. Two or more different track names make a choice. The checklist
then shows a **Track** picker, counts only the picked track's groups (`withTrack` in `web/lib/degree.ts`), and keeps a
"Pick a track" requirement open until one is picked; the pick travels in the share link as `tr=` (DECISIONS.md D58.1).

To make a track choice work by hand, give each of its groups the same `name` ending in "Track". A list of options by
area that isn't named that way (Industrial Engineering's "Track Option Electives") isn't a choice yet.

## Eligibility (minors and certificates)

Some program pages say a minor is not open to particular majors or colleges. Copy the sentence and link to its source;
do not infer restrictions from a program's name or coursework. `majors` names program ids, including concentration ids;
`colleges` names the exact college strings in the degree files. A rule may use either or both. For a minor that says who
it *is* for ("open only to students in Gies"), use `only_majors` and/or `only_colleges`: every other major is excluded.
A department page counts as a source when the catalog is silent (Statistics, Chemistry, Kinesiology). Wording that only
describes an audience ("designed for non-majors", "not appropriate for") is not a rule. A `caveat` records an
eligibility exception the checklist cannot determine, and is shown with the warning.

```yaml
not_open_to:
  - majors: [advertising-bs, computer-science-advertising-bs]
    quote: "Students pursuing a major in Advertising or CS+Advertising are not eligible for a minor in Advertising."
    source: https://catalog.illinois.edu/undergraduate/media/minors/advertising/
  # International Business: everyone outside Gies
  - only_colleges: [Gies College of Business]
    quote: "…is not open to students earning Undergraduate degrees in colleges other than the Gies College."
    source: https://catalog.illinois.edu/undergraduate/bus/minors/international-business/
```

The picker keeps restricted minors visible but disabled for the selected major. A saved/shared selection or later major
change is retained and shown with the quoted rule and source. The catalog importer preserves `not_open_to` when it
rewrites a generated file.

## Importing every program

`python -m pipeline.catalog_import` reads https://catalog.illinois.edu/undergraduate/, every program page on it and its
concentration pages (each concentration with requirements of its own becomes a program, e.g.
`psychology-bslas-cognitive-neuroscience`; the main page is kept unless it has no requirements, like English), then
https://catalog.illinois.edu/undergraduate/minors/
and every minor page on it, one request per second, cached in `data/raw/catalog/`; `--offline` re-parses the cache and
`--only majors` or `--only minors` limits the run. Minor pages have no gen-ed table; a few keep their course list on the
Overview tab instead of a Requirements tab, and the importer reads it from there. What it turns into rules, and what it leaves as `manual`, is in
DECISIONS.md D13.28 and D30. A file whose requirements read the same as before is left alone (date included), so a
re-import's diff shows only real changes. Run it when a new catalog year is published, then `python -m pipeline.degrees`
and `make data`.

## Adding or checking a program by hand

1. Open the program's page in the current Academic Catalog and copy each table into a group, in order. Use `notes` for
   anything the schema can't express.
2. Add the campus gen-ed groups the page says apply, and the `double_counting` rules with their quotes.
3. Run `python -m pipeline.degrees` to validate it (it prints unknown course codes), then `make data`.
