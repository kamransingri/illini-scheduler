# Degree requirements

One YAML file per program in `data/degrees/`, read from the official Academic Catalog page for one catalog year
(https://catalog.illinois.edu/). Most files are written by `python -m pipeline.catalog_import` (they carry a
`generated:` date); `finance-data-science.yaml` was checked by hand. Never fill a file in from memory: if the catalog
can't be read, leave `groups: []` and say so in the pull request. `make data` validates every file (`pipeline/degrees.py`), checks each course code against
the Course Explorer data it loads, logs codes it can't find, and exports `web/public/data/degrees/<id>.json` for the
degree checklist at `/degree/`.

## File

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Slug, same as the file name (`finance-data-science`; minors end in `-minor`) |
| `type` | no | `minor` for a minor; leave it out for a major |
| `program`, `college` | yes | As the catalog names them |
| `catalog_year` | yes | `2026-2027` |
| `source` | yes | The catalog page URL |
| `read_on` | yes | Date the page was read, `YYYY-MM-DD` |
| `generated` | no | Date `pipeline/catalog_import.py` wrote the file. The importer overwrites only files that have this key; delete it once you've checked a file by hand |
| `total_hours` | no | Minimum hours for the degree, or for the minor (the lowest number of a range like "18-21") |
| `notes` | no | Catalog text for rules the schema can't express (copied, not paraphrased) |
| `double_counting` | no | When one course may count toward two requirements (below) |
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
    between: [program, gened]         # kinds or exclusive-set names
    quote: "Some Gen Ed requirements may be met by courses required and/or electives in the program."
    source: https://catalog.illinois.edu/...
```

## Importing every program

`python -m pipeline.catalog_import` reads https://catalog.illinois.edu/undergraduate/, every program page on it (and
the concentration pages of programs whose requirements live there), then https://catalog.illinois.edu/undergraduate/minors/
and every minor page on it, one request per second, cached in `data/raw/catalog/`; `--offline` re-parses the cache and
`--only majors` or `--only minors` limits the run. Minor pages have no gen-ed table; a few keep their course list on the
Overview tab instead of a Requirements tab, and the importer reads it from there. What it turns into rules, and what it leaves as `manual`, is in
DECISIONS.md D13.28. Run it when a new catalog year is published, then `python -m pipeline.degrees` and `make data`.

## Adding or checking a program by hand

1. Open the program's page in the current Academic Catalog and copy each table into a group, in order. Use `notes` for
   anything the schema can't express.
2. Add the campus gen-ed groups the page says apply, and the `double_counting` rules with their quotes.
3. Run `python -m pipeline.degrees` to validate it (it prints unknown course codes), then `make data`.
