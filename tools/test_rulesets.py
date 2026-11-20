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
    assert checks == jobs == {"test", "versions", "e2e"}  # a renamed CI job would block every merge
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
