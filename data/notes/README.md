# Student notes

One YAML file per course, e.g. `cs-124.yaml`. Students don't submit notes here: the course page sends them to Rate My
Professors to review a course (through their professor). A maintainer may add a note that has a checkable `source`;
never one written from memory. Schema:

```yaml
course: CS 124
notes:
  - instructor: "Challen, G"   # name exactly as Course Explorer prints it
    term: 2026-fa              # optional
    text: "Weekly quizzes in the CBTF; no final."
    source: "https://github.com/<owner>/illini-scheduler/issues/12"   # optional
```

Notes feed the exam/grading profile (Phase 5) and are shown verbatim on the course page.
The repository ships with no notes: none have been submitted yet.
