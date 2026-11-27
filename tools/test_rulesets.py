"""The ruleset files, CODEOWNERS and the CI job names agree (CONTRIBUTING.md, Repository settings; #147)."""

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GITHUB_ACTIONS_APP = 15368


def ruleset(name: str) -> dict:
    return json.loads((ROOT / ".github" / "rulesets" / name).read_text(encoding="utf-8"))


def test_main_needs_a_review_and_the_ci_checks_but_lets_the_bots_through():
    main = ruleset("main.json")
    rules = {r["type"]: r.get("parameters", {}) for r in main["rules"]}
    assert {"deletion", "non_fast_forward", "pull_request", "required_status_checks"} <= set(rules)
    review = rules["pull_request"]
    assert review["required_approving_review_count"] == 1 and review["dismiss_stale_reviews_on_push"] is True
    checks = {c["context"] for c in rules["required_status_checks"]["required_status_checks"]}
    jobs = set(yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8"))["jobs"])
    # a renamed CI job would block every merge; gate (/no-checks-pr) only decides whether test and e2e run
    assert checks == jobs - {"gate"} == {"test", "versions", "e2e"}
    for name in ("main.json", "version-tags.json"):
        assert {"actor_id": GITHUB_ACTIONS_APP, "actor_type": "Integration", "bypass_mode": "always"} \
            in ruleset(name)["bypass_actors"]


def test_codeowners_paths_exist_and_name_people():
    lines = [x.split() for x in (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8").splitlines()
             if x.strip() and not x.startswith("#")]
    assert lines[0][0] == "*"
    for path, *owners in lines:
        assert owners and all(re.fullmatch(r"@[A-Za-z0-9-]+", o) for o in owners), path
        assert path == "*" or (ROOT / path.strip("/")).exists(), path


# Everyone who could use /no-checks-main and /no-checks-pr when the list was locked (2026-11-27, DECISIONS D72).
# Nobody new gets the commands: adding a name to .github/pr-command-users.txt fails this test.
COMMAND_USERS = {"kamransingri", "ishaanman7898", "smyans", "nityagehlot", "mc-git-lab"}


def test_the_skip_checks_list_is_locked_to_the_contributors_and_the_owners_review_it():
    """/no-checks-main and /no-checks-pr (tools/pr-command.sh) read .github/pr-command-users.txt from main."""
    lines = (ROOT / ".github" / "pr-command-users.txt").read_text(encoding="utf-8").splitlines()
    users = {line.split("#")[0].strip().lower() for line in lines} - {""}
    assert users == COMMAND_USERS  # locked: no one added, no one renamed
    owners = [line.split() for line in (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8").splitlines()
              if line.strip() and not line.startswith("#")]
    assert ["/.github/", "@kamransingri", "@ishaanman7898"] in owners  # a change to the list needs their review
    script = (ROOT / "tools" / "pr-command.sh").read_text(encoding="utf-8")
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "pr-command-users.txt" in script and "pr-command-users.txt" in ci
