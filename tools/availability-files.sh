#!/usr/bin/env bash
# The daily seat availability files (data/availability/*.json, ~8.5 MB each) live on the `availability` branch as one
# commit that every crawl replaces, so they never pile up in main's history (#180). Same idea as `live-seats`.
#   tools/availability-files.sh fetch     put the branch's files in data/availability/
#   tools/availability-files.sh publish   force-push data/availability/*.json as the branch's one commit (needs GH_TOKEN
#                                         and GITHUB_REPOSITORY in Actions; uses the origin remote's credentials otherwise)
set -euo pipefail
DIR=data/availability
BRANCH=availability

case "${1:-}" in
  fetch)
    mkdir -p "$DIR"
    if git fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
      git archive FETCH_HEAD | tar -x -C "$DIR"
    else
      # No branch yet (the first run after the move): the last version committed to main
      git fetch -q --depth=100 origin main
      sha=$(git log -1 --format=%H --diff-filter=AM FETCH_HEAD -- "$DIR")
      [ -n "$sha" ] || { echo "No availability files on the $BRANCH branch or in main's recent history" >&2; exit 1; }
      git archive "$sha" "$DIR" | tar -x
    fi
    ls -l "$DIR"
    ;;
  publish)
    ls "$DIR"/*.json > /dev/null
    url=$(git remote get-url origin)
    if [ -n "${GH_TOKEN:-}" ]; then url="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"; fi
    tmp=$(mktemp -d)
    cp "$DIR"/*.json "$tmp"/
    cd "$tmp"
    git init -q -b "$BRANCH"
    git config user.name "illini-scheduler-bot"
    git config user.email "actions@users.noreply.github.com"
    git add ./*.json
    git commit -qm "seat availability $(date -u +%FT%H:%MZ)"
    git push -qf "$url" "$BRANCH"
    ;;
  *)
    echo "usage: $0 fetch|publish" >&2
    exit 2
    ;;
esac
