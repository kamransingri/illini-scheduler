# Instructions for AI coding tools

Read by AI coding tools working on Illini Scheduler. [CLAUDE.md](CLAUDE.md) is a copy of this file for Claude Code:
change both together, so they stay the same. The rules for people are in [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/AI-USE.md](docs/AI-USE.md); they apply to you too. Where this file and those disagree, those win: fix this file.

## 1. First, every session: start from the latest `main`

Before you read or edit any code, run:

```sh
git fetch origin
git status            # commit or stash anything uncommitted first
git switch main && git pull --ff-only
git switch <branch>   # the branch you're working on, if it isn't main
git merge main        # resolve conflicts here, on the branch
```

Don't skip this because the clone looks recent: others merge into `main` every day, and the bots commit data nightly.
Working from an old copy means your pull request quietly undoes what `main` already changed.

If `git pull` says `refusing to merge unrelated histories` or `Not possible to fast-forward`, the clone is from before
the history rewrite (#183). Stop and tell the person: don't merge the two histories. Once they've saved anything
unpushed, `git reset --hard origin/main` fixes `main`.

## 2. What this repository is

An unofficial course planner for UIUC students, live at https://kamransingri.github.io/illini-scheduler/. A Python
pipeline reads public sources into SQLite and exports JSON; a Next.js static export turns that JSON into about 7,100
course pages plus the gen-ed finder, degree checklist, schedule builder and Just opened. The same JSON feeds an MCP
server and an HTTP API. There are no accounts and no server-side student data.

| Path | What's there |
| --- | --- |
| `pipeline/` | Python 3.11+: ingest (`course_explorer.py`, `gpa.py`, `rmp.py`, `availability.py`, `live_seats.py`...), instructor matching (`names.py`), degree and credit data (`degrees.py`, `catalog_import.py`, `ap_credit.py`), `export.py`, and `run.py` which runs it all. Tests in `pipeline/tests/` |
| `web/` | Next.js 15 App Router, TypeScript, Tailwind 4. Pages in `web/app/`, components in `web/components/`, the logic (search, ranking, schedule generator, degree checks) in `web/lib/`. Vitest tests in `web/tests/unit/`, Playwright in `web/tests/e2e/` |
| `mcp/` | The MCP server. `src/schemas.ts` (arguments) and `src/answers.ts` (answers) are shared with `api/`; search and ranking are imported from `web/lib` |
| `api/`, `supabase/` | The HTTP API at `/v1/` and the hosted MCP server at `/mcp`, as one Supabase Edge Function with no database ([docs/BACKEND.md](docs/BACKEND.md)) |
| `data/` | Hand-kept data, committed: `degrees/*.yaml`, `ap-credit/`, `ib-credit/`, `test-credit/`, `notes/`, `buildings.csv`, `name_overrides.csv`, `renumbered.csv`, `watch.txt`. Generated, never committed: `illini.db`, `raw/`, `availability/` |
| `fixtures/` | Real data saved from each source for offline tests. Never written by hand ([fixtures/README.md](fixtures/README.md)) |
| `tools/` | Repo tooling: `release.py` (versions), `quick_test.py`, `api_docs.py` (checks docs/API.md covers every exported field) |
| `docs/` | Reference docs, indexed in [docs/README.md](docs/README.md) |
| `.github/` | Workflows, issue and pull request templates, CODEOWNERS, rulesets |

## 3. Commands

```sh
pip install -r requirements.txt && (cd web && npm ci) && (cd mcp && npm ci)
make data-quick                    # CS, MATH, STAT, RHET only; `make data` for everything (~25 s)
python -m pipeline.run --fixtures  # fully offline build from fixtures/
make test-quick                    # only the unit tests for what changed since origin/main
make test                          # pytest + Vitest (web and mcp)
make lint                          # ruff, mypy, ESLint, tsc
make test-api                      # api/: type-check and Vitest (needs `npm ci` in api/ and mcp/)
PAGES_LIMIT=50 make build          # static export with 50 course pages instead of ~7,100
cd web && npx playwright test <spec> --workers=1
```

Keep the load on the person's laptop light: prefer `make test-quick` and `PAGES_LIMIT` builds, run Playwright with
`--workers=1` and only the specs you touched, and stop `make serve` or `make dev` when you're done. CI runs everything.

On Windows: the repository may sit in a synced folder (OneDrive); a full build writes about 28,600 files, so suggest
pausing sync first. The "lower-case course URL redirects" Playwright test fails locally because the file system
ignores case; it passes on CI. Write files as UTF-8 explicitly.

## 4. Rules CI or reviewers enforce

**Branches and pull requests**

- Work on a `type/short-name` branch from the latest `main`: `feature/`, `fix/`, `docs/`, `chore/`, `data/`,
  `hotfix/`, `release/`. Lower case with hyphens; CI fails other names.
- Changes reach `main` through a pull request with `test`, `versions` and `e2e` passing and one approving review,
  merged with a merge commit. Push straight to `main` only when the person explicitly tells you to.
- Never branch from, merge or push to `live-seats` or `availability`: each is one commit a workflow replaces.
- Don't commit, push, open pull requests or comment on issues unless the person asked.

**Versions and the changelog**

- Never edit version numbers by hand (`pyproject.toml`, `web/package.json`, `mcp/package.json` and their lock files).
  `make release V=patch|minor|major` changes them all and turns **Unreleased** into the new version.
- Never create, move or delete `v*` tags. `release.yml` tags the commit that reaches `main`.
- A change people will notice gets one line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md), under Added,
  Changed, Fixed or Removed, written for students. Internal changes get none.

**The data**

- Facts the site shows (degree requirements, AP, IB, SAT and ACT credit, restrictions, sections, grades) are copied
  word for word from their source or parsed by tested code. Never write, guess or fill them in from memory. If a source
  can't be read, leave the data empty and say so. Where our copy must differ from the source, add a `fix` note that
  quotes both ([docs/AP-CREDIT.md](docs/AP-CREDIT.md), [docs/DEGREE-DATA.md](docs/DEGREE-DATA.md)).
- Nothing behind a NetID login (Self-Service, Canvas, DARS) is ever fetched or scraped.
- The exported JSON is a public API. A new field needs a row in [docs/API.md](docs/API.md) or `tools/test_api_docs.py`
  fails. Renaming or removing a field, or changing its meaning, also raises `DATA_FORMAT` in `pipeline/export.py`.
- Fixtures are saved from the real source with the commands in `fixtures/README.md`, never edited by hand.

**Students' data and AI**

- Everything a student enters stays in their browser and their share link. No page sends it to a server or calls an
  AI API.
- The MCP server and the API keep nothing between requests and never log the arguments of a call.

**Code**

- The site, the MCP server and the API must agree. Put shared logic in `web/lib` and import it; a new API endpoint the
  MCP server should offer goes in `mcp/src/schemas.ts` and `mcp/src/answers.ts`.
- Keep changes to what was asked. Match the style of the file you're in. Add or update tests for what you change.
- Commit messages: one imperative line under ~72 characters ("Degree checklist: search programs by name"). The
  `data:` prefix is reserved for the bots.

## 5. Keep the docs true

Update the doc in the same change as the behaviour it describes:

| You changed | Update |
| --- | --- |
| Anything students notice | `CHANGELOG.md` (Unreleased), and `README.md` if it changes what a page does |
| A judgment call (a threshold, a rule, a trade-off) | `docs/DECISIONS.md`: a new numbered entry at the end, with the date and issue |
| Something the site can't do, or does approximately | `docs/LIMITATIONS.md` |
| An exported JSON field, or an API endpoint | `docs/API.md` |
| A page's layout, a token or a shared component | `docs/DESIGN.md` (Part 5 says what each page may hold) |
| Degree, AP, IB or test credit formats | `docs/DEGREE-DATA.md`, `docs/AP-CREDIT.md` |
| A workflow, a `make` target or a command | `README.md` (Commands, Automation) |
| How work is branched, reviewed or released | `CONTRIBUTING.md`, and this file and `CLAUDE.md` |
| How AI is used, or what is sent to AI services | `docs/AI-USE.md` |

Write docs the way the existing ones are written: short, plain sentences in sentence case; say what changes for
students; name files, functions and fields; give numbers, not adjectives. No emoji, no em dashes, no `[Feature]` tags.

## 6. Issues and pull requests

- Issue titles and bodies follow [docs/ISSUES-AND-PRS.md](docs/ISSUES-AND-PRS.md) and the templates in
  `.github/ISSUE_TEMPLATE/`: Task, Parent (with GitHub sub-issues), Data and Bug, each with "Where it goes".
- A pull request title reads like a commit with the issues it closes: "Area: what changes (#N)". The body is short:
  `Closes #N`, a few bullets on what people will notice, and a one-line **Tests:** summary. No screenshots.
- When an AI tool wrote most of a pull request, the description says so in one line.
