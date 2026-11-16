# Degree requirements

One YAML file per program, copied from the official Academic Catalog page for one catalog year
(https://catalog.illinois.edu/). Never fill a file in from memory: if the catalog can't be read, leave `groups: []`
and say so in PROGRESS.md. `make data` validates every file (`pipeline/degrees.py`), checks each course code against
the Course Explorer data it loads, logs codes it can't find, and exports `web/public/data/degrees/<id>.json` for the
degree checklist at `/degree/`.

## File

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Slug, same as the file name (`finance-data-science`) |
| `program`, `college` | yes | As the catalog names them |
| `catalog_year` | yes | `2026-2027` |
| `source` | yes | The catalog page URL |
| `read_on` | yes | Date the page was read, `YYYY-MM-DD` |
| `total_hours` | no | Minimum hours for the degree |
| `notes` | no | Catalog text for rules the schema can't express (copied, not paraphrased) |
| `double_counting` | no | When one course may count toward two requirements (below) |
| `groups` | yes | The requirement groups, in catalog order |

## Groups

| Key | Meaning |
| --- | --- |
| `id`, `name` | Unique id; the name shown on the checklist |
| `section` | The catalog heading it sits under (groups with the same section are shown together) |
| `kind` | `program` (default) or `gened` |
| `rule` | `all` (every item), `n_of` (`n` items), `hours` (at least `hours` credit hours), `manual` (the student ticks it, e.g. a language requirement that high-school work can satisfy) |
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

## Adding a program

1. Open the program's page in the current Academic Catalog and copy each table into a group, in order. Use `notes` for
   anything the schema can't express.
2. Add the campus gen-ed groups the page says apply, and the `double_counting` rules with their quotes.
3. Run `python -m pipeline.degrees` to validate it (it prints unknown course codes), then `make data`.
