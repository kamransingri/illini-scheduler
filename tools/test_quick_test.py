from tools import quick_test as q


def test_a_module_runs_its_own_test_file():
    assert q.plan(["pipeline/offerings.py"]).pytest == ["pipeline/tests/test_offerings.py"]
    assert q.plan(["tools/release.py"]).pytest == ["tools/test_release.py"]
    assert q.plan(["pipeline/tests/test_degrees.py"]).pytest == ["pipeline/tests/test_degrees.py"]


def test_a_module_without_a_test_file_runs_its_package():
    p = q.plan(["pipeline/config.py", "pipeline/offerings.py", "tools/release.py"])
    assert p.pytest == ["pipeline/tests", "tools/test_release.py"]  # the package covers test_offerings.py


def test_dependencies_run_everything_and_web_changes_pick_vitest():
    assert q.plan(["requirements.txt", "pipeline/offerings.py"]).pytest == ["."]
    p = q.plan(["web/components/FourYearPlan.tsx", "docs/API.md"])
    assert (p.pytest, p.web, p.mcp) == ([], True, False)
    p = q.plan(["web/lib/plan.ts"])
    assert (p.web, p.mcp) == (True, True)  # the MCP server imports web/lib
    assert q.plan(["CHANGELOG.md"]) == q.Plan()


def test_commands():
    cmds = q.commands(q.Plan(pytest=["tools/test_release.py"], web=True), "origin/main")
    assert cmds[0][0][1:] == ["-m", "pytest", "-q", "tools/test_release.py"]
    assert cmds[1][0][1:] == ["vitest", "run", "--changed", "origin/main"] and cmds[1][1].name == "web"
    assert q.commands(q.Plan(pytest=["."]), "HEAD")[0][0][-2:] == ["pytest", "-q"]
