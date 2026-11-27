# Contributing

How changes get from a laptop to the live site: branches, commits, pull requests, versions and releases. Setup and
commands are in the [README](README.md#run-it-locally); the docs index is [docs/README.md](docs/README.md). How to
write an issue or a pull request (titles, the shape of each kind of issue, labels, milestones, assignees) is in
[docs/ISSUES-AND-PRS.md](docs/ISSUES-AND-PRS.md). AI coding tools are welcome: [docs/AI-USE.md](docs/AI-USE.md) is
the policy, and [AGENTS.md](AGENTS.md) (copied to [CLAUDE.md](CLAUDE.md)) is what the tools read.

## Your first change

1. Set up as in the README: `pip install -r requirements.txt`, `npm ci` in `web/` and `mcp/`, then `make data-quick`.
2. Pick an issue (`good first issue` is a good start), assign yourself or ask on it, so two people don't do the same
   work.
3. Branch, change, and run `make test-quick` and `make lint`. For a page, `make dev` and look at it at 1280px and
   375px.
4. Add a CHANGELOG line if students will notice, update the docs the change touches, and open a pull request.

## The flow

```text
main ─────────────●──────────────────────────────●── merge commit ──► deploy (pages.yml)
                   \                            /                 └─► tag vX.Y.Z + GitHub release (release.yml),
                    feature/x: commits ─► pull request                 when the branch bumped the version
                                          ├─ checks: test, versions, e2e
                                          └─ one approving review from someone else
```

1. Branch from the latest `main` as `type/short-name`.
2. Commit, push and open a pull request. CI runs the checks, and GitHub asks the code owners for a review.
3. Someone other than you approves it. A push after the approval dismisses it, so the approval always covers the
   final diff.
4. Merge it with a merge commit. `main` deploys, and if the branch ran `make release` the release workflow tags it.

The bots (the nightly data refresh, the seat availability job, the release tags) don't go through pull requests:
the ruleset lets GitHub Actions through (Repository settings, below).

### Skipping the wait: `/no-checks-main` and `/no-checks-pr`

For a small change you want live now, comment on its pull request (you need write access; not on pull requests from
forks). `commands.yml` runs `tools/pr-command.sh`:

| Comment | What happens |
| --- | --- |
| `/no-checks-main` | Merges the pull request into `main` straight away, without waiting for its checks or a review, and deploys without lint, unit tests, browser tests, Lighthouse or the live smoke test (`pages.yml` with `skip_checks`), so the site updates in about 5 minutes instead of 10 to 15. The pull request's own checks keep running, so you still see whether they pass. It also starts `release.yml` and `api.yml` when the change touches their files, and deletes the branch |
| `/no-checks-pr` | Labels the pull request `no-checks-pr` and re-runs its CI without `test` and `e2e` (skipped jobs count as passed); `versions` still runs. Later pushes skip them too. Remove the label to bring them back from the next push |

Both skip the safety net, so use them for changes you've checked yourself. If something breaks, `main` is fixed by
the next pull request, as usual.

## Branches

| Branch | What it is | Who writes to it |
| --- | --- | --- |
| `main` | What's live. Every push rebuilds and deploys the site (`pages.yml`) from the last nightly refresh's data in a few minutes; put `[refresh data]` in the commit message or pull request title to refresh all sources first (about 20 minutes). | Merged pull requests, plus the nightly data job's own commits (`data: nightly refresh …`) and the release workflow's tags |
| `live-seats` | One commit holding `live.json`, replaced every ~10 minutes by `live-seats.yml`. No code. | Only that workflow. Never branch from it or merge it |
| `availability` | One commit holding `data/availability/*.json` (about 8.5 MB per term), replaced daily by `availability.yml`, so the files stay out of `main`'s history (#180). `make data` and the workflows fetch it with `tools/availability-files.sh fetch`. No code | Only that workflow. Never branch from it or merge it |
| `type/short-name` | One piece of work, branched from the latest `main` | You |

Work branch types:

| Type | For |
| --- | --- |
| `feature/` | Something new people can use: `feature/program-search` |
| `fix/` | A bug: `fix/gened-chip-wrap` |
| `docs/` | Docs only |
| `chore/` | Tooling, CI, dependencies, refactors nobody sees |
| `data/` | Hand-kept data: `data/degrees/*.yaml`, `data/name_overrides.csv`, `data/notes/`, `data/watch.txt`, `data/renumbered.csv` |
| `hotfix/` | An urgent fix to the live site, released as a patch straight away |
| `release/` | Only a version bump, when it isn't part of a feature branch |

Lower case with hyphens. CI fails a pull request from a branch named any other way.

```sh
git switch main && git pull
git switch -c feature/program-search
# ...commit...
git push -u origin feature/program-search
gh pr create --fill          # or open it on GitHub
```

Keep branches short-lived: a few days, a week at most. A bigger change goes in as several pull requests (the issue's
sub-issues are a good split), each one leaving `main` working. A branch nobody has pushed to in two weeks should be
finished, split or closed.

**When `main` moves on,** bring it in with `git fetch && git merge origin/main` (GitHub's "Update branch" button does
the same merge) and resolve conflicts on your branch, never on `main`. Rebase only a branch nobody else has pulled.
After the merge, read CHANGELOG.md once: when `main` released a version while your branch was open, git can move your
**Unreleased** lines into that version's section without a conflict. Move them back under **Unreleased**; a released
section must match its GitHub release.

## Commits

- One line saying what changes, in the imperative, under ~72 characters: "Degree checklist: search programs by name or
  acronym". A body for the why when it isn't obvious.
- `data:` is reserved for the bots' commits, so a person's commit is easy to tell apart.
- A commit should leave the build working, so a bisect can land anywhere.

## Pull requests

1. Open one against `main`. The template asks for the issues it closes, what changed in a few bullets and a one-line
   test summary ([docs/ISSUES-AND-PRS.md](docs/ISSUES-AND-PRS.md#pull-requests)). AI coding tools are fine; when one
   wrote most of the pull request, say so in one line ([docs/AI-USE.md](docs/AI-USE.md)).
2. CI runs these checks, and all must pass:
   - `test`: lint, type checks and unit tests (about 2 minutes)
   - `versions`: version files agree, CHANGELOG covers the version, the version only goes up, and the branch name follows the convention
   - `e2e`: the Playwright suite against this branch's build, when it changes `web/`, `mcp/`, `pipeline/` or `data/`.
     It exports this branch's data from the pipeline database the last deploy cached, so it fetches nothing; with no
     database cached yet it's skipped with a notice. `pages.yml` runs the whole suite again after merge.

   Before you push, `make test-quick` (or `python -m tools.quick_test`) runs only the unit tests for what changed since
   `origin/main`: a changed module's own test file, and the Vitest tests that import a changed file. It takes seconds
   where `make test` takes a minute or more, and keeps a laptop quiet; CI still runs everything. On a laptop, run
   Playwright with `--workers=1`.
3. **Review.** One approving review from someone other than the author, and the checks above passing. GitHub requests
   reviewers from [`.github/CODEOWNERS`](.github/CODEOWNERS) by path: anyone with write access can approve, the code
   owners are just asked first. A push after an approval dismisses it. Review for what the pull request says it does:
   does it, are the tests real, does the CHANGELOG line read right for students.
4. Merge with **a merge commit** (the default; PRs #1 to #5 were merged this way), so each branch's history stays
   readable on `main`.
5. The branch is deleted automatically (`branch-cleanup.yml`). GitHub keeps a "Restore branch" button on the pull
   request. Locally: `git switch main && git pull --prune && git branch -d feature/program-search`.

## Versions

One version number for the whole repo, in `pyproject.toml`, `web/package.json` and `mcp/package.json` (and their lock
files), always the same. The MCP server's package and the GitHub release carry it too. It follows
[Semantic Versioning](https://semver.org/); 1.0.0 was released on 2026-11-27.

| Bump | When | Example |
| --- | --- | --- |
| major `X.0.0` | Something that breaks what people or programs rely on: old share links or saved data stop working, a public JSON field, API endpoint or MCP tool argument is renamed or removed (`DATA_FORMAT` goes up) | None since 1.0.0 |
| minor `1.X.0` | A new page or feature, or a change in behaviour people will notice that keeps old links and data working | Tracks in the degree checklist, the HTTP API |
| patch `1.0.X` | Fixes, wording, speed, and docs about the site | A gen-ed chip that wrapped |
| pre-release `1.X.0-beta.N` | Part of a bigger change, put live to try out | `0.2.0-beta.1` before the redesign was finished |
| none | Data refreshes, CI and tooling, internal docs | The nightly refresh, this file |

Never edit the version files by hand. `make release` keeps them in step, and CI fails if they disagree. `make version`
checks them locally.

## Changelog

[CHANGELOG.md](CHANGELOG.md) lists what changed in each version, for the people using the site. Add your line under
**Unreleased** in the same pull request as the change, under Added, Changed, Fixed or Removed. Leave out changes nobody
will notice. CI warns, without failing, when code changed but the changelog didn't.

The exported JSON is a public API ([docs/API.md](docs/API.md)). A new field needs a row there, or the tests fail.
Renaming or removing a field, or changing what it means, also raises `DATA_FORMAT` in `pipeline/export.py` and gets a
line under **Changed** or **Removed**.

## Releasing

1. On the branch that finishes the work (or a `release/1.1.0` branch from `main`):

   ```sh
   make release V=minor          # or patch, major, 1.1.0-beta.1
   git commit -am "Release 1.1.0"
   ```

   This moves every version file to 1.1.0 and turns Unreleased into `## [1.1.0] - <today>` with a fresh, empty
   Unreleased above it. Read the section once more: it becomes the release notes.
2. Push and open the pull request. CI checks the new version is higher than `main`'s and not tagged yet.
3. Merge it. The **Release** workflow (`release.yml`) tags the merge commit `v1.1.0`, publishes a GitHub release with
   that changelog section (pre-releases marked as such) and attaches the MCP server package
   (`illini-scheduler-mcp.tgz`). The deploy runs at the same time.

Don't create `v*` tags by hand: the workflow tags the commit that actually reached `main`. To re-run a release that
failed, use "Run workflow" on the Release workflow in the Actions tab; it only does what's missing.

**Hotfix:** branch `hotfix/short-name` from `main`, fix it, `make release V=patch`, open the pull request, merge.

## Repository settings (owner)

These need admin rights on the repository, so they're kept as files to apply rather than applied by the workflows:

- **Rulesets.** Settings, then Rules, Rulesets, New ruleset, Import a ruleset, once for each file in
  `.github/rulesets/`. From a terminal:
  `gh api -X POST repos/kamransingri/illini-scheduler/rulesets --input .github/rulesets/main.json`.
  - `main.json`: `main` can't be deleted or force-pushed. Changes arrive through pull requests with `test`,
    `versions` and `e2e` passing and one approving review, dismissed by a later push. (`e2e` passes when it has
    nothing to test, so a docs change isn't held up.)
  - `version-tags.json`: `v*` tags can't be created, moved or deleted by hand.
  - Both let GitHub Actions (app id 15368) through, so the data jobs keep committing to `main` and the release workflow
    can tag. After importing, check that the next nightly `data: nightly refresh` commit still lands.
  - The files are the source of truth: change a rule here first, then apply it. To update a ruleset that's already
    on: `gh api repos/kamransingri/illini-scheduler/rulesets` lists them with their ids, then
    `gh api -X PUT repos/kamransingri/illini-scheduler/rulesets/<id> --input .github/rulesets/main.json`.
  - Until the owner imports them (#146), these rules are only written down: GitHub doesn't enforce them yet.
- **Settings, General, Pull Requests:** keep "Allow merge commits" on and tick "Automatically delete head branches". The
  cleanup workflow then finds the branch already gone, which is fine.
- **Settings, Actions, General:** workflow permissions "Read and write". The data jobs and the release workflow push
  with the built-in token.
