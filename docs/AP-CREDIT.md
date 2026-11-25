# AP and IB credit

The degree checklist turns a student's AP exams and scores into the Illinois courses they're expected to give, using
the table CITL (the Center for Innovation in Teaching & Learning) publishes for each entering year. One YAML file per
year in `data/ap-credit/`, copied **by hand** from CITL's page. `make data` validates every file
(`pipeline/ap_credit.py`), lists credited course codes the loaded Course Explorer data doesn't know, and exports
`web/public/data/ap-credit.json`. The page does the rest in the browser (`web/lib/apcredit.ts`).

```sh
python -m pipeline.ap_credit     # validate every file; with data/illini.db built, also list unknown course codes
```

## Where the tables are

| Entering year | Students who start in | Source (read 2026-11-17) |
| --- | --- | --- |
| 2026-2027 | Summer 2026, Fall 2026 or Spring 2027 | [Current cutoff scores](https://citl.illinois.edu/current-cutoff-scores): year 2026-2027, exam type AP, every test selected (the table only appears after picking filters) |
| 2025-2026 | Summer 2025, Fall 2025 or Spring 2026 | [Advanced Placement (AP) Credit 2025](https://citl.illinois.edu/advanced-placement-ap-credit-2025) |
| 2024-2025 | Summer 2024, Fall 2024 or Spring 2025 | [2024-2025 page](https://citl.illinois.edu/test-placement-proficiency/proficiency-testing/advanced-placement-ap-credit/advanced-placement-ap-credit-1) |

Policies follow the year a student **first enrolled**, not the current year, so every year's file stays. A new year's
table usually appears in spring; add it as a new file and the newest becomes the default.

Why by hand and not a scraper: about 40 exams change once a year, the current table only renders after clicking
filters, and the pages have slips a scraper would copy (below).

**Watching for changes.** Every Monday `citl-watch.yml` runs `python -m pipeline.citl_watch`: it reads each year's
source again (the cutoff tool's rows come from the JSON service its page uses) and compares the exam names and rows
with `data/ap-credit/citl/<year>.txt`, the snapshot taken when the file was last checked. A changed row, or a year in
CITL's tool with no file here (2027-2028), opens one issue with the diff. After updating the YAML by hand, run
`python -m pipeline.citl_watch --update` and commit the new snapshots.

## File

```yaml
year: 2026-2027                       # must match the file name
entering: Summer 2026, Fall 2026 or Spring 2027
source: https://citl.illinois.edu/current-cutoff-scores
read_on: 2026-11-17
notes: [...]                          # optional, shown under the expected AP credit for that year
exams:
  - id: CALCBC                        # 2-10 capitals/digits; the same id every year, because links store it
    name: Calculus BC                 # the College Board's exam name, without "AP"
    sub: Calculus AB subscore         # only if some rows depend on a subscore
    notes: [...]                      # optional, shown under every score of this exam
    rows:
      - scores: [3]                   # AP scores this row covers
        sub: [4, 5]                   # optional: subscores (0 = no subscore)
        college: other                # optional: grainger | other (Grainger College of Engineering or not)
        with: {ENGLANG: [4, 5]}       # optional: another exam's score (0 = not taken)
        credit: {MATH 220: 5}         # course code or elective credit ("MATH 1--") -> CITL's hours; {} = none
        message: Placed into MATH 231 # CITL's placement message, word for word
        fix: ...                      # optional: where our copy differs from the page, quoting it
```

The validator reports every problem at once: unknown keys, malformed codes, scores outside 1 to 5, a `sub` on an exam
with no subscore label, `with` naming an exam that isn't in the file, a row with no credit and no message, and **two
rows that both apply** to the same score, subscore, college and other-exam score.

Rules for copying:

- Copy what the page says, including the hours, which can differ from the catalog's (AP French gives FR 205 at 2
  hours; the catalog says 3).
- Keep placement messages word for word, including their punctuation. Change one only to correct a course code or a
  misspelling, and say so in `fix`, quoting the page.
- When the page contradicts itself, take the reading the rest of the page (or the neighbouring year) supports and say
  so in `fix`. Corrections made so far:

| Year | Exam | Page says | We use |
| --- | --- | --- | --- |
| 2024-2025 | Calculus BC, Grainger, 5 | credits "MATH 220" but lists hours for MATH 231 too | MATH 220 and MATH 231 |
| 2024-2025 | Calculus BC, Grainger, 4 | "MATH231 ... concurrent enrollment in MATH 229" | MATH 299, as every other row |
| 2024-2025 | German, 4 or 5 | credits "GER 105" but lists hours for GER 211 | GER 211, as 2025-2026 |
| 2024-2025 | Macroeconomics, 5 | "ECON 105" (no such course) | ECON 103, as 2025-2026 and 2026-2027 |
| 2024-2025 | Spanish Language / Literature | a row for a 5 and none for a 4 | the same credit for a 4 (state law requires credit for a 4; 2025-2026 does this) |
| 2024-2025 | Physics 2, 3 | "the PHYS 101 or the proficiency exam" | "the PHYS 101 or the PHYS 102 proficiency exam" |
| 2024-2025 | Microeconomics, 3 or 4 | "register fo rhte departmental" | spelling fixed |
| 2025-2026 | Physics 2, 4 | "the PHYS 10 proficiency exam" | PHYS 102 |
| 2026-2027 | Japanese, 5 | "JPAN 203, 204, 305, 306" | JAPN |
| 2026-2027 | Calculus BC, 4 or 5 | hours "5 + 3 + 8" | 5 and 3 (8 is the total) |
| all | Biology, 5 | IB 150 and MCB 150, 4 hours (on one or two rows) | both, 4 hours each |

What isn't copied: the gen-ed column. A credited course carries the gen-eds the course itself has in the site's data,
which is what DARS applies. (The pages sometimes disagree with the course: 2026-2027 lists CS 101 as Quantitative
Reasoning I, while the course is QR II.)

## IB credit

IB (International Baccalaureate) credit works the same way, from `data/ib-credit/<year>.yaml` to
`web/public/data/ib-credit.json` (issue #25, DECISIONS D27). Only **2026-2027** is copied: it comes from the same
cutoff score tool (year 2026-2027, exam type IB), whose IB rows have a level and one row per score band. The tool's
2025-2026 IB rows have no level, so Higher and Standard Level can't be told apart, and older years are prose pages.

The file has the AP shape with these differences:

```yaml
exams:
  - id: ECON                          # ours, stable: links store it
    name: Economics                   # ours; the tool writes names in capitals, with typos
    rows:
      - level: HL                     # required on every row: HL (Higher Level) or SL (Standard Level)
        scores: [6, 7]                # IB scores 1 to 7
        credit: {ECON 102: 3, ECON 103: 3}
        message: ...                  # word for word, as for AP
```

No `sub`, `college` or `with`. Two rows overlap only when they have the same level and share a score. There's no
diploma rule: CITL lists credit per exam only.

Corrections made to the tool's 2026-2027 IB rows:

| Exam | Tool says | We use |
| --- | --- | --- |
| Chinese B: Mandarin, SL ab initio | filed under Chinese B with the level "SL ab initio" | its own exam, Chinese B ab initio: Mandarin (SL) |
| Chinese B ab initio: Mandarin, 6 or 7 | hours "5" for "CHIN 201 AND 202" | 5 each (both are 5-hour courses, as CHIN 203 and 204 are 5 + 5) |
| Chinese B: Cantonese, SL | the same row twice | once |
| Hindi A: Literature, SL | scores "4, 5, 6, 6" | 4 to 7, as the HL row |
| Hindi B: Literature, SL | "HNDI 403, 404" at "4" hours, placing into HNDI 404 | HNDI 403 only (4 hours) |
| French A: Literature and Performance, SL | score "NA", credit "Only available on request" | scores 4 to 7, no credit, that message |

`citl_watch` checks the tool's IB rows every Monday against `data/ib-credit/citl/2026-2027.txt`, in the same issue
as AP.

**Transfer and dual credit** aren't tabulated (D27.6): Illinois's equivalencies are in Transferology, which needs an
account. The checklist links to it, and the student adds the Illinois course as "AP, IB or transfer credit".

## SAT and ACT

`data/test-credit/<year>.yaml` (2025-2026 and 2026-2027, issue #104) has the same shape, with four exams: ACT English,
SAT EBRW (RHET 105 credit or a Rhetoric placement), ACT Math and SAT Math (CITL's Chemistry page: 25 or below, or 590
or below, recommends CHEM 101; no credit). A row gives a score `range: [lowest, highest]` instead of `scores` (ACT 1 to
36, SAT 200 to 800 in tens); the export lists every score in the range. Placement rows have `credit: {}` and CITL's
message word for word.

- **2026-2027 SAT EBRW 530.** The Rhetoric Placement page puts it in "530 - 730" (RHET 105); the cutoff tool puts it
  in "200-530". We follow the page and say so in `fix`.
- **2025-2026.** The tool writes "1-19" as "19-Jan" and its ACT messages name 2024-2025 terms; both are corrected,
  with `fix` notes.
- **Rules.** Only official scores sent with the application count (the form says so). RHET 105 from ACT/SAT and AP
  English Language counts once. The link carries `t=ACTENG-35,SATMATH-590`.
- **Every year.** `citl-watch.yml` snapshots the tool's ACT and SAT rows and the Rhetoric and Chemistry pages in
  `data/test-credit/citl/`; the quarterly data check has a "SAT and ACT credit" row.

## How the checklist uses it

- **Input.** "Add an AP or IB exam" under My courses: the starting term (newest by default; it picks the AP and the
  IB table), AP or IB, an exam and a score, plus the subscore when an AP score depends on one (Calculus BC 3: the AB
  subscore, with "no subscore"; Music Theory 4 and 5: the aural subscore) or the level for IB (asked only when the
  subject has both). The English Literature rows read the English Language score already in the list.
- **Pasting scores.** "Paste your AP or IB scores" under the form takes the text of College Board's score page or
  the IB's results page (`web/lib/scoreimport.ts`). It matches exam names to the year's table, including short and
  old names ("Calc BC", "US Gov"), reads the Calculus BC AB and Music Theory aural subscores, keeps the highest
  score of a retaken exam and says so, and lists the IB diploma core (Theory of Knowledge, Extended Essay, total
  points) as not used for credit. A preview shows what was found, what isn't recognised and what would be replaced;
  Apply writes the same `a=` and `i=` lists typing does. The text is parsed in the browser and never sent. Sample
  pages are in `web/tests/unit/fixtures/scoreimport/`.
- **College.** Calculus AB and BC have separate Grainger rows; the college comes from the chosen program. With no
  program, the other rows are used and the panel says so.
- **Stored as scores, not courses.** The link carries `a=CALCBC-3-4,CHEM-5` (exam, score, subscore),
  `i=ECON-HL-6` (IB exam, level, score), `y=2025` (the entering year, left out for the newest) and `d=MATH220` (credit
  switched off). The courses are worked out from the
  table each time, so fixing a table fixes old links too.
- **Counting.** Credited courses count like "AP, IB or transfer credit" (completed), at CITL's hours, with an "AP
  credit" or "IB credit" tag. The same course from two exams (AP or IB) counts once; elective credit in one subject from two exams adds up. Elective
  credit (`MATH 1--`) counts toward the hours line and toward a rule that takes every number at that level
  (`FIN 400-499` takes `FIN 4--`); nowhere else. A course the student also listed themselves keeps their entry.
- **Shown.** Each exam with its courses (each can be unticked, for students who'd rather take the course), CITL's
  placement message, the exam's notes (Chemistry: lecture credit only) and any `fix`. Credited courses also count for
  prerequisites, so MATH 241's "check prerequisites" note disappears once MATH 231 is credited.

It's an estimate until the credit appears on the student's DARS report; the page says so.
