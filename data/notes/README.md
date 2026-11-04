# Student notes

One YAML file per course, e.g. `cs-124.yaml`. Only add notes that a student actually submitted (via the
"Suggest a note" GitHub issue link on a course page). Schema:

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
