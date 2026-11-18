# Contributing

How changes get from a laptop to the live site: branches, commits, pull requests, versions and releases. Setup and
commands are in the [README](README.md); the docs index is [docs/README.md](docs/README.md).

## Branches

| Branch | What it is | Who writes to it |
| --- | --- | --- |
| `main` | What's live. Every push rebuilds and deploys the site (`pages.yml`). | Merged pull requests, plus the data jobs' own commits (`data: nightly refresh …`, `data: seat availability …`) and the release workflow's tags |
| `live-seats` | One commit holding `live.json`, replaced every ~10 minutes by `live-seats.yml`. No code. | Only that workflow. Never branch from it or merge it |
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

Keep branches short-lived. When `main` moves on, bring it in with `git fetch && git merge origin/main` and resolve
conflicts on your branch, never on `main`. Rebase only a branch nobody else has pulled.

## Commits

- One line saying what changes, in the imperative, under ~72 characters: "Degree checklist: search programs by name or
  acronym". A body for the why when it isn't obvious.
- `data:` is reserved for the bots' commits, so a person's commit is easy to tell apart.
- A commit should leave the build working, so a bisect can land anywhere.

## Pull requests

1. Open one against `main`. The template asks for what changed, how it was checked and the changelog line.
2. CI runs two checks, and both must pass:
   - `test`: lint, type checks and unit tests
   - `versions`: version files agree, CHANGELOG covers the version, the version only goes up, and the branch name follows the convention
3. Merge with **a merge commit** (the default; PRs #1 to #5 were merged this way), so each branch's history stays
   readable on `main`.
4. The branch is deleted automatically (`branch-cleanup.yml`). GitHub keeps a "Restore branch" button on the pull
   request. Locally: `git switch main && git pull --prune && git branch -d feature/program-search`.

## Versions

One version number for the whole repo, in `web/package.json` (and its lock file) and `pyproject.toml`, always the same.
It follows [Semantic Versioning](https://semver.org/). Until 1.0:

| Bump | When | Example |
| --- | --- | --- |
| minor `0.X.0` | A new page or feature, a change in behaviour people will notice, or anything that breaks old share links or saved data | Search by CRN, the program search |
| patch `0.4.X` | Fixes, wording, speed, and docs about the site | A gen-ed chip that wrapped |
| pre-release `0.X.0-beta.N` | Part of a bigger change, put live to try out | `0.2.0-beta.1` before the redesign was finished |
| none | Data refreshes, CI and tooling, internal docs | The nightly refresh |

1.0.0 is for when the site is ready to be relied on outside the beta: degree data checked by hand, seat alerts.

Never edit the version files by hand. `make release` keeps them in step, and CI fails if they disagree.

## Changelog

[CHANGELOG.md](CHANGELOG.md) lists what changed in each version, for the people using the site. Add your line under
**Unreleased** in the same pull request as the change, under Added, Changed, Fixed or Removed. Leave out changes nobody
will notice. CI warns, without failing, when code changed but the changelog didn't.

## Releasing

1. On the branch that finishes the work (or a `release/0.5.0` branch from `main`):

   ```sh
   make release V=minor          # or patch, major, 0.6.0-beta.1
   git commit -am "Release 0.5.0"
   ```

   This moves every version file to 0.5.0 and turns Unreleased into `## [0.5.0] - <today>` with a fresh, empty
   Unreleased above it. Read the section once more: it becomes the release notes.
2. Push and open the pull request. CI checks the new version is higher than `main`'s and not tagged yet.
3. Merge it. The **Release** workflow (`release.yml`) tags the merge commit `v0.5.0` and publishes a GitHub release
   with that changelog section (pre-releases marked as such). The deploy runs at the same time.

Don't create `v*` tags by hand: the workflow tags the commit that actually reached `main`. To re-run a release that
failed, use "Run workflow" on the Release workflow in the Actions tab; it only does what's missing.

**Hotfix:** branch `hotfix/short-name` from `main`, fix it, `make release V=patch`, open the pull request, merge.

## Repository settings (owner)

These need admin rights on the repository, so they're kept as files to apply rather than applied by the workflows:

- **Rulesets.** Settings, then Rules, Rulesets, New ruleset, Import a ruleset, once for each file in
  `.github/rulesets/`. From a terminal:
  `gh api -X POST repos/kamransingri/illini-scheduler/rulesets --input .github/rulesets/main.json`.
  - `main.json`: `main` can't be deleted or force-pushed. Changes arrive through pull requests with `test` and
    `versions` passing.
  - `version-tags.json`: `v*` tags can't be created, moved or deleted by hand.
  - Both let GitHub Actions (app id 15368) through, so the data jobs keep committing to `main` and the release workflow
    can tag. After importing, check that the next nightly `data: nightly refresh` commit still lands.
- **Settings, General, Pull Requests:** keep "Allow merge commits" on and tick "Automatically delete head branches". The
  cleanup workflow then finds the branch already gone, which is fine.
- **Settings, Actions, General:** workflow permissions "Read and write". The data jobs and the release workflow push
  with the built-in token.
