# Instructions for AI coding tools

Read by AI coding tools (Claude Code reads it through CLAUDE.md). The rules for people are in
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/AI-USE.md](docs/AI-USE.md); they apply to you too.

## First, every session: start from the latest `main`

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
