"""`make test-quick`: only the unit tests for what changed, for a fast check on a laptop (#148, CONTRIBUTING.md).

    python -m tools.quick_test                 # changes since origin/main, committed or not
    python -m tools.quick_test --base HEAD     # only what isn't committed yet
    python -m tools.quick_test --dry-run       # print the commands without running them

Python: a changed module's own test file (pipeline/x.py -> pipeline/tests/test_x.py, tools/x.py -> tools/test_x.py),
a changed test file itself, or the whole package when a module has no test file of its own. Vitest picks the tests
that import a changed file (`vitest --changed`) in web/, and in mcp/ when mcp/ or web/lib/ changed. `make test` and
CI still run everything.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = {"pipeline": "pipeline/tests", "tools": "tools"}
EVERYTHING = {"pyproject.toml", "requirements.txt"}


@dataclass
class Plan:
    pytest: list[str] = field(default_factory=list)  # test files or directories; ["."] means the whole suite
    web: bool = False
    mcp: bool = False


def plan(changed: list[str], root: Path = ROOT) -> Plan:
    out = Plan()
    py: set[str] = set()
    for f in changed:
        if f in EVERYTHING:
            py = {"."}
        top, _, rest = f.partition("/")
        if f.endswith(".py") and top in PACKAGES and "." not in py:
            name = Path(f).name
            if name.startswith("test_"):
                py.add(f)
            else:
                own = Path(PACKAGES[top]) / f"test_{Path(rest).stem}.py"
                py.add(str(own).replace("\\", "/") if (root / own).exists() else PACKAGES[top])
        if top == "web":
            out.web = True
        if top == "mcp" or f.startswith("web/lib/"):
            out.mcp = True
    # a package's directory covers its single files
    dirs = {p for p in py if not p.endswith(".py")}
    covered = [p for p in py if p in dirs or not any(p.startswith(d + "/") for d in dirs)]
    out.pytest = ["."] if "." in py else sorted(covered)
    return out


def changed_files(base: str, root: Path = ROOT) -> list[str]:
    def git(*args: str) -> list[str]:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True)
        return [x for x in r.stdout.splitlines() if x]

    merge_base = git("merge-base", base, "HEAD")[0] if base != "HEAD" else "HEAD"
    files = git("diff", "--name-only", merge_base) + git("ls-files", "--others", "--exclude-standard")
    return sorted(set(files))


def commands(p: Plan, base: str) -> list[tuple[list[str], Path]]:
    npx = shutil.which("npx") or "npx"
    cmds: list[tuple[list[str], Path]] = []
    if p.pytest:
        cmds.append(([sys.executable, "-m", "pytest", "-q", *([] if p.pytest == ["."] else p.pytest)], ROOT))
    if p.web:
        cmds.append(([npx, "vitest", "run", "--changed", base], ROOT / "web"))
    if p.mcp:
        cmds.append(([npx, "vitest", "run", "--changed", base], ROOT / "mcp"))
    return cmds


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", default="origin/main", help="compare with this branch or commit (default origin/main)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    changed = changed_files(args.base)
    cmds = commands(plan(changed), args.base)
    if not cmds:
        print(f"Nothing to test: no Python, web/ or mcp/ changes since {args.base}.")
        return 0
    failed = 0
    for cmd, cwd in cmds:
        where = cwd.relative_to(ROOT) if cwd != ROOT else "."
        print(f"+ (cd {where}) {' '.join([Path(cmd[0]).stem, *cmd[1:]])}", flush=True)
        if not args.dry_run:
            failed |= subprocess.run(cmd, cwd=cwd).returncode != 0
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
