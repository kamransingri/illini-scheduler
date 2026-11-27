#!/usr/bin/env bash
# /no-checks-main and /no-checks-pr, commented on a pull request (.github/workflows/commands.yml, CONTRIBUTING.md).
#
#   /no-checks-main  merge into main now, without waiting for checks or a review, and deploy without the tests.
#                    The pull request's own checks keep running.
#   /no-checks-pr    skip the slow checks (test, e2e) on this pull request: label it no-checks-pr and re-run its CI.
#                    The versions check still runs.
#
# Only someone with write access can use them, and only on a pull request from a branch of this repository.
# Needs GH_TOKEN, GITHUB_REPOSITORY, PR (number), ACTOR (who commented) and BODY (the comment).
# DRY_RUN=1 reads everything but prints what it would change instead of changing it.
set -euo pipefail

repo=$GITHUB_REPOSITORY
server=${GITHUB_SERVER_URL:-https://github.com}

run() {
  if [ -n "${DRY_RUN:-}" ]; then echo "would run: $*"; else "$@"; fi
}
say() {
  run gh pr comment "$PR" -R "$repo" --body "$1"
}

cmd=$(printf '%s\n' "$BODY" | head -n 1 | tr -d '\r' | awk '{print $1}')
case "$cmd" in
  /no-checks-main | /no-checks-pr) ;;
  *) echo "Not a command: '$cmd'"; exit 0 ;;
esac

perm=$(gh api "repos/$repo/collaborators/$ACTOR/permission" --jq .permission 2>/dev/null || echo none)
case "$perm" in
  admin | maintain | write) ;;
  *) say "\`$cmd\` needs write access to this repository, and $ACTOR has \`$perm\`."; exit 1 ;;
esac

IFS=$'\t' read -r state cross branch sha < <(gh pr view "$PR" -R "$repo" \
  --json state,isCrossRepository,headRefName,headRefOid --jq '[.state, .isCrossRepository, .headRefName, .headRefOid] | @tsv')
if [ "$state" != OPEN ]; then say "\`$cmd\` only works on an open pull request."; exit 1; fi
if [ "$cross" != false ]; then say "\`$cmd\` doesn't work on pull requests from forks."; exit 1; fi
files=$(gh pr view "$PR" -R "$repo" --json files --jq '.files[].path')
echo "$cmd by $ACTOR ($perm) on #$PR: $branch at $sha, $(grep -c . <<<"$files" || true) files"

if [ "$cmd" = /no-checks-pr ]; then
  run gh label create no-checks-pr -R "$repo" --color BFD4F2 --force \
    --description "CI skips test and e2e on this pull request (/no-checks-pr)"
  run gh pr edit "$PR" -R "$repo" --add-label no-checks-pr
  # Re-run this commit's CI: its gate job reads the label live, so test and e2e skip (a skipped job counts as passed).
  for id in $(gh run list -R "$repo" --workflow ci.yml --commit "$sha" --limit 10 --json databaseId --jq '.[].databaseId'); do
    status=$(gh run view "$id" -R "$repo" --json status --jq .status)
    if [ "$status" != completed ]; then
      run gh run cancel "$id" -R "$repo"
      for _ in $(seq 1 36); do
        [ -n "${DRY_RUN:-}" ] && break
        [ "$(gh run view "$id" -R "$repo" --json status --jq .status)" = completed ] && break
        sleep 5
      done
    fi
    run gh run rerun "$id" -R "$repo"
  done
  say "Skipping \`test\` and \`e2e\` on this pull request (label \`no-checks-pr\`): its CI is re-running without them, and later pushes skip them too. \`versions\` still runs. Remove the label to bring them back from the next push."
  exit 0
fi

# /no-checks-main. A merge made with the workflow's token is allowed past the main ruleset (GitHub Actions is its
# bypass actor), but it doesn't start the push workflows, so this starts the ones the merge would have.
if ! out=$(run gh api -X PUT "repos/$repo/pulls/$PR/merge" -f merge_method=merge -f sha="$sha" 2>&1); then
  say "\`/no-checks-main\` couldn't merge: $out"
  exit 1
fi
echo "$out"
if grep -qvE '\.md$|^screenshots/' <<<"$files"; then # pages.yml: paths-ignore **.md, screenshots/**
  run gh workflow run pages.yml -R "$repo" --ref main -f skip_checks=true
  deploy="Deploying without lint, unit or browser tests: $server/$repo/actions/workflows/pages.yml"
else
  deploy="Only Markdown changed, so there's nothing to deploy."
fi
if grep -qxE 'web/package\.json|pyproject\.toml|CHANGELOG\.md' <<<"$files"; then # release.yml's paths
  run gh workflow run release.yml -R "$repo" --ref main
fi
if grep -qE '^(api/|supabase/|mcp/src/|web/lib/)|^mcp/package\.json$|^\.github/workflows/api\.yml$' <<<"$files"; then # api.yml's paths
  run gh workflow run api.yml -R "$repo" --ref main
fi
# branch-cleanup.yml doesn't run for a merge made by a workflow either
case "$branch" in
  main | live-seats | availability) ;;
  *)
    tip=$(gh api "repos/$repo/git/ref/heads/$branch" --jq .object.sha 2>/dev/null || true)
    if [ "$tip" = "$sha" ]; then run gh api -X DELETE "repos/$repo/git/refs/heads/$branch"; fi
    ;;
esac
say "Merged into \`main\` by \`/no-checks-main\` from $ACTOR, without waiting for checks or a review. $deploy"
