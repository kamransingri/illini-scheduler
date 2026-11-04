# Progress

## Needs a human

1. **Create the private GitHub repo and push.** This session could not create repos (token is bound to
   pre-attached repos). Run, from the project root:
   `gh repo create illini-scheduler --private --source . --push`
2. **Network access for live sources (optional).** This session's network blocked `courses.illinois.edu`
   and `www.ratemyprofessors.com`. Once pushed, GitHub Actions has open internet and the nightly workflow
   fetches both.

## Phase log

### Phase 0 — preflight and scaffold

Tool versions: python 3.13.18, pip 24.0, node 22.23.4, npm 10.9.9, git 2.43.0, gh 2.89.0 (token valid only for
repo-scoped API calls), ruff 0.16.9, mypy 2.3.1, Playwright 1.63.0 + pre-installed Chromium.

Network check (2026-11-04):

| URL | Result |
| --- | --- |
| https://courses.illinois.edu/cisapp/explorer/schedule.xml | blocked (proxy 403) |
| https://raw.githubusercontent.com/wadefagen/datasets/main/README.md | 200 OK |
| https://www.ratemyprofessors.com/ | blocked (proxy 403) |

Fallback: see DECISIONS.md D0.2 and D0.3.
