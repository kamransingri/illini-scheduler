# Student notes

One YAML file per course, e.g. `cs-124.yaml`. Only notes a student actually submitted, through "Suggest a note" on a
course page (the "Student note" issue form). To publish them: read the issue, add the `approved` label, and run the
"Student notes intake" workflow in the Actions tab. `pipeline/notes_intake.py` appends each approved note here with
its issue as `source` and opens a pull request that closes the issues. Schema:

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
