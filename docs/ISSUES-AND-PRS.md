# Writing issues and pull requests

All work on Illini Scheduler is planned in GitHub issues and shipped through pull requests. If every issue and pull
request has the same shape, anyone can pick up an issue or review a pull request without asking what it means. The
templates under `.github/` fill in these shapes when you click **New issue** or open a pull request.
[CONTRIBUTING.md](../CONTRIBUTING.md) covers branches, commits, versions and releases.

## Before you open an issue

- Search open and closed issues first. If yours is already there, comment on it instead.
- One issue is one pull request's worth of work. If it needs more than one pull request, write a parent issue with
  sub-issues (below).
- Questions go on the issue they're about. If there isn't one, open an issue with the `question` label.

## Kinds of issue

| Kind | Use it for | Template | Examples |
| --- | --- | --- | --- |
| Task | One pull request's worth of work, usually part of a bigger feature | Task | #122, #93, #117 |
| Parent | A feature that needs two or more pull requests: it explains the goal and lists its tasks | Parent | #121, #26, #58 |
| Data | Copying a table by hand, adding a source, or a check that repeats every term or year | Data | #105, #109, #73 |
| Bug | Something on the site is wrong or broken | Bug | #13 |

## Titles

- **Task:** `<Track> <N>: <outcome>`, where N is the order to do it in: "Map 1: where every building is",
  "Summer 2: summer filter in course search and the gen-ed finder".
- **Parent:** the outcome in plain words: "Summer courses everywhere, not a separate tab", "Four-year plan: drag
  courses into terms".
- **Bug:** where and what's wrong: "RMP: "Anderson, J" (MATH 221) matched to the wrong professor's profile".
- **Data:** the source and what to do with it: "SAT/ACT 1: copy CITL's ACT and SAT rows into data/test-credit",
  "Data check: November 2026".

Write them in sentence case, with no period at the end and no `[Feature]` tags or emoji: labels do that job.

## The body

Write for someone who has never seen the code. Name the files, functions and data fields. Link the docs. Write down
decisions that have already been made, so nobody has to guess them. Use short sentences and say what students will
notice.

### Task

```markdown
Part of #121. Needs #122. No backend needed.

Why it's needed and where things are today, in one or two sentences (`web/lib/summer.ts`, `pipeline/summer.py`).

### What to do
- Concrete steps, naming the files and fields to change.
- Decisions already made (what to keep, what not to do).

### Where it goes
The schedule builder's results, in each section row's details; replaces the row's separate "alternatives" line.

### Done when
- [ ] The tests that prove it: pytest, Vitest or Playwright, and on what
- [ ] Anything to report in the pull request, such as a number
```

- The first line links the parent issue and any issue this one needs first. Leave out what doesn't apply.
- **Where it goes** names the page, the block the change joins, and what it replaces or hides, so pages don't grow
  one feature at a time (docs/DESIGN.md Part 5). Pipeline or docs work says "No page".
- Each "Done when" box has to be something a reviewer can check. "Works well" isn't.

### Parent

```markdown
The problem or the goal in a short paragraph: who it's for and what's wrong today.

### What to do
- The outcome in three to five bullets.

### Where it goes
The pages it changes, and what each one gives up to make room.

Not included: what's left out on purpose, and why (optional).

### Sub-issues
In order: 1 course pages, 2 filters in search and the gen-ed finder, 3 remove the tab.

### Done when
- [ ] What's true for students when every sub-issue is closed
```

Create the tasks as GitHub sub-issues: use **Create sub-issue** or **Add existing issue** in the parent's sidebar.
A list in the text isn't enough, because GitHub only shows progress for linked sub-issues.

### Data

```markdown
Part of #104.

### Source
- <URL>: who publishes it and when it changes (e.g. every spring)

### What to copy or check
- Which rows or fields, and anything known to be wrong in the source.

### Where it goes
- `data/<folder>/<file>.yaml`, in the format in docs/<FORMAT>.md
- `source` and `read_on` in the file

### Done when
- [ ] pytest passes on the new file
- [ ] Rows spot-checked against the source, listed in the pull request
```

- Copy word for word and never guess. Where our copy has to differ from the source (a typo, a missing row), add a
  `fix` note that quotes both.
- Note the source's terms of use and how to credit it ([API.md](API.md) lists how we credit sources today).
- Nothing behind a NetID login (Self-Service, Canvas) is ever scraped.

### Bug

```markdown
### What happened

### Steps to reproduce
1. Go to <page URL>
2. ...

### What you expected

### Where
- Page URL (for the schedule builder, the share link)
- Browser and phone or computer, or the window width
- Site version, at the bottom of every page
```

## Labels, milestones and assignees

Every issue gets one kind label, at least one area label, one priority label, and any flags that apply.

| Labels | Use |
| --- | --- |
| `enhancement`, `bug`, `documentation`, `question` | Kind: what the issue is |
| `data-pipeline`, `degree-planner`, `schedule-builder`, `seats`, `rmp`, `ai` | Area: which part of the site or pipeline |
| `maintenance` | Upkeep: rollovers, yearly checks, test fixtures |
| `needs-backend` | Can't ship on the static site alone |
| `needs-human` | Needs a person: a manual check, an advisor, admin access |
| `accessibility` | A barrier for people with disabilities |
| `good first issue`, `help wanted` | Good for someone new, or open for anyone to take |
| `priority: critical`, `priority: high`, `priority: medium`, `priority: low` | How soon it needs doing (below) |

### Priority

Whoever opens the issue picks a priority; if you're not sure, pick `priority: medium` and say why in the body. Anyone
can suggest a different one in a comment, and the project owner has the final say. Change the label when things
change (a registration date gets close, a source starts refusing us).

| Label | When | What happens |
| --- | --- | --- |
| `priority: critical` | The live site is down or shows wrong data students could act on (times, seats, requirements), student data could leak, or a source is about to cut us off | Drop other work. Fix or work around it within a day, and release it as a hotfix (CONTRIBUTING.md) |
| `priority: high` | It blocks a milestone or a coming registration period, or it's a risk to the whole project: data access, terms of use, security | Next up. Someone is assigned within a few days |
| `priority: medium` | Normal planned work | Done in milestone order |
| `priority: low` | Nice to have: polish, ideas, small annoyances | When there's time; often a good first issue |

Pick the next issue to work on from the highest priority first, then by milestone. A bug is at least
`priority: high` when it gives students wrong information, however small it looks.

**Milestones.** Every issue goes in one milestone, the goal it helps ship. A parent and its sub-issues go in the same
one. The [milestones page](https://github.com/kamransingri/illini-scheduler/milestones) lists them with their due
dates. Ask before you start a new one.

**Assignees.** One person per issue. Assign yourself, or ask in a comment, before you start, so two people don't do
the same work. If you stop, say so in a comment and unassign yourself. A parent is assigned to whoever owns that
area. The exception is a project-wide risk everyone should follow (such as #256, asking the university for data
access): assign every contributor, and say in a comment who is doing each step.

## Pull requests

### Before you open one

- Work on a `type/short-name` branch from the latest `main`: `feature/`, `fix/`, `docs/`, `chore/`, `data/`,
  `hotfix/` or `release/` (CONTRIBUTING.md).
- `make lint` and `make test` pass (`make test-quick` is enough while you work). Run Playwright for the pages you changed:
  `cd web && npx playwright test <spec> --workers=1`.
- Add a line under **Unreleased** in CHANGELOG.md if people will notice the change.
- Update the docs where behaviour changed: LIMITATIONS, DECISIONS, and API.md for a new data field
  ([AGENTS.md](../AGENTS.md#5-keep-the-docs-true) has the full table).
- If an AI tool wrote most of it, say so in one line ([AI-USE.md](AI-USE.md)).

### Title

Use the same style as a commit: the area, what changes, and the issues it closes:

- "Restriction check: flag sections you can't register for (#78, #79, #80, #81)"
- "Data API: llms.txt and docs/API.md for every exported field (#98)"

### Body

Keep it short: the reviewer reads the diff for the details.

```markdown
Closes #98.

- What students (or whoever works on the code) will notice, in a few bullets

**Tests:** pytest and Vitest pass; Playwright schedule.spec.ts; checked /schedule/ at 375px.

**Before / after:** screenshots at 1280px and 375px, for any change to a page.

**Different from the issue:** only if you changed the plan, and why.
```

- Write `Closes #N` for every issue the pull request finishes (`Closes #78, closes #79`), so they close when it's
  merged. Write `Part of #N` for one it doesn't finish.
- Leave out file-by-file lists. Say what changes for people, not every function you touched.
- Put numbers you measured in the bullets ("reads 87% of the restriction sentences"), not adjectives.

### Review and merge

- The CI checks have to pass: `test` (lint, types, unit tests), `versions` (version files, CHANGELOG, branch name)
  and, when the change touches a page, `e2e` (Playwright against the branch's build).
- One approving review from someone other than the author. GitHub asks the code owners (`.github/CODEOWNERS`) first;
  a push after an approval dismisses it (CONTRIBUTING.md, Pull requests).
- Merge with a merge commit. The branch is deleted automatically.
- A pull request that ships a release also has a "Release X.Y.Z" commit (CONTRIBUTING.md, Releasing).
