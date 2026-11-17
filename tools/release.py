"""Versions and releases: one version number, kept in step across the repo, with notes in CHANGELOG.md.

    python -m tools.release current              print the version
    python -m tools.release check [--base REF]   version files agree, CHANGELOG covers it, and (with --base) it only
                                                 went up compared with REF and isn't tagged yet
    python -m tools.release bump minor           next version (major | minor | patch | X.Y.Z[-beta.N]) in every file,
                                                 and CHANGELOG's Unreleased section becomes that version
    python -m tools.release notes 0.5.0          that version's CHANGELOG section (the GitHub release text)
    python -m tools.release publish --sha SHA    release workflow: tag SHA as vX.Y.Z if that tag doesn't exist, and
                                                 make a GitHub release for every tagged version without one

Versions are semver (0.5.0, 0.6.0-beta.1). pyproject.toml spells pre-releases the PEP 440 way (0.6.0b1).
Process: CONTRIBUTING.md.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = "web/package.json"
LOCK = "web/package-lock.json"
PYPROJECT = "pyproject.toml"
CHANGELOG = "CHANGELOG.md"

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$")
PEP440 = {"alpha": "a", "beta": "b", "rc": "rc"}
HEADING = re.compile(r"^## \[(?P<v>[^\]]+)\](?: - (?P<date>\d{4}-\d{2}-\d{2}))?[ \t]*$", re.M)
LINK = re.compile(r"^\[(?P<v>[^\]]+)\]: (?P<url>\S+)[ \t]*$", re.M)


class ReleaseError(Exception):
    pass


@dataclass(frozen=True, order=True)
class Version:
    major: int
    minor: int
    patch: int
    # pre-releases sort before the release: (0, "beta", 1) < (1, "", 0)
    final: int = 1
    pre: str = ""
    pre_n: int = 0

    @classmethod
    def parse(cls, s: str) -> Version:
        m = SEMVER.match(s.strip())
        if not m:
            raise ReleaseError(f"{s!r} isn't a version like 1.2.3 or 1.2.3-beta.1")
        a, b, c, pre, n = m.groups()
        return cls(int(a), int(b), int(c), 0 if pre else 1, pre or "", int(n or 0))

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        return base if self.final else f"{base}-{self.pre}.{self.pre_n}"

    @property
    def pep440(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        return base if self.final else f"{base}{PEP440[self.pre]}{self.pre_n}"

    @property
    def prerelease(self) -> bool:
        return not self.final

    def bump(self, kind: str) -> Version:
        if kind == "major":
            return Version(self.major + 1, 0, 0)
        if kind == "minor":
            return Version(self.major, self.minor + 1, 0)
        if kind == "patch":
            # 0.6.0-beta.2 -> 0.6.0: finishing a pre-release
            return Version(self.major, self.minor, self.patch if self.prerelease else self.patch + 1)
        new = Version.parse(kind)
        if new <= self:
            raise ReleaseError(f"{new} isn't after {self}")
        return new


def from_pep440(s: str) -> str:
    m = re.match(r"^(\d+\.\d+\.\d+)(?:(a|b|rc)(\d+))?$", s.strip())
    if not m:
        raise ReleaseError(f"pyproject.toml version {s!r} isn't X.Y.Z or X.Y.Z(a|b|rc)N")
    base, pre, n = m.groups()
    names = {short: name for name, short in PEP440.items()}
    return f"{base}-{names[pre]}.{n}" if pre else base


# --- the files that carry the version ---------------------------------------------------------------------------


def read_versions(root: Path = ROOT) -> dict[str, str]:
    pkg = json.loads((root / PACKAGE).read_text(encoding="utf-8"))
    lock = json.loads((root / LOCK).read_text(encoding="utf-8"))
    py = re.search(r'^version = "([^"]+)"', (root / PYPROJECT).read_text(encoding="utf-8"), re.M)
    return {
        PACKAGE: pkg["version"],
        LOCK: lock["version"],
        f"{LOCK} (packages[''])": lock.get("packages", {}).get("", {}).get("version", lock["version"]),
        PYPROJECT: from_pep440(py.group(1)) if py else "missing",
    }


def write_version(v: Version, root: Path = ROOT) -> None:
    def sub(path: str, pattern: str, repl: str, count: int) -> None:
        p = root / path
        text = p.read_text(encoding="utf-8")
        new, n = re.subn(pattern, repl, text, count=count, flags=re.M)
        if n != count:
            raise ReleaseError(f"{path}: expected {count} version field(s), found {n}")
        p.write_bytes(new.encode("utf-8"))

    # Text substitution, not json.dump, so the files keep their formatting and line endings.
    sub(PACKAGE, r'^(  "version": )"[^"]+"', rf'\g<1>"{v}"', 1)
    sub(LOCK, r'^(  "version": )"[^"]+"', rf'\g<1>"{v}"', 1)  # top level
    sub(LOCK, r'^(  "packages": \{\s*"": \{\s*"name": "[^"]+",\s*"version": )"[^"]+"', rf'\g<1>"{v}"', 1)
    sub(PYPROJECT, r'^version = "[^"]+"', f'version = "{v.pep440}"', 1)


# --- CHANGELOG.md ----------------------------------------------------------------------------------------------


def read_log(root: Path = ROOT) -> str:
    """CHANGELOG.md with \\n line endings (a Windows checkout has \\r\\n)."""
    return (root / CHANGELOG).read_bytes().decode("utf-8").replace("\r\n", "\n")


def write_log(text: str, root: Path = ROOT) -> None:
    crlf = b"\r\n" in (root / CHANGELOG).read_bytes()
    (root / CHANGELOG).write_bytes((text.replace("\n", "\r\n") if crlf else text).encode("utf-8"))


def sections(text: str) -> dict[str, tuple[str | None, str]]:
    """{version or "Unreleased": (date, body)} in file order."""
    heads = list(HEADING.finditer(text))
    first_link = LINK.search(text)
    out: dict[str, tuple[str | None, str]] = {}
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else (first_link.start() if first_link else len(text))
        out[h["v"]] = (h["date"], text[h.end() : end].strip())
    return out


def notes(text: str, version: str) -> str:
    sec = sections(text)
    if version not in sec:
        raise ReleaseError(f"{CHANGELOG} has no section for {version}")
    return sec[version][1]


def repo_url(text: str) -> str:
    m = re.search(r"^\[Unreleased\]: (https://github\.com/[^/]+/[^/]+)/compare/", text, re.M)
    if not m:
        raise ReleaseError(f"{CHANGELOG} needs an [Unreleased]: https://github.com/OWNER/REPO/compare/vX...HEAD link")
    return m.group(1)


def cut(text: str, new: Version, date: str) -> str:
    """Unreleased becomes `new` (dated), a fresh empty Unreleased goes on top, and the compare links follow."""
    sec = sections(text)
    if "Unreleased" not in sec:
        raise ReleaseError(f"{CHANGELOG} has no ## [Unreleased] section")
    if not sec["Unreleased"][1]:
        raise ReleaseError(f"Nothing under ## [Unreleased] in {CHANGELOG}: add what changed before releasing")
    if str(new) in sec:
        raise ReleaseError(f"{CHANGELOG} already has a section for {new}")
    released = [v for v in sec if v != "Unreleased"]
    prev = released[0] if released else None
    url = repo_url(text)
    text = re.sub(r"^## \[Unreleased\][ \t]*$", f"## [Unreleased]\n\n## [{new}] - {date}", text, count=1, flags=re.M)
    text = re.sub(r"^\[Unreleased\]: .*$", f"[Unreleased]: {url}/compare/v{new}...HEAD", text, count=1, flags=re.M)
    link = f"{url}/compare/v{prev}...v{new}" if prev else f"{url}/releases/tag/v{new}"
    return re.sub(r"^(\[Unreleased\]: .*)$", rf"\1\n[{new}]: {link}", text, count=1, flags=re.M)


# --- git -------------------------------------------------------------------------------------------------------


def git(*args: str, root: Path = ROOT, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if check and r.returncode:
        raise ReleaseError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout.strip()


def tags(root: Path = ROOT) -> set[str]:
    return set(git("tag", "--list", "v*", root=root).split())


def version_at(ref: str, root: Path = ROOT) -> str | None:
    out = subprocess.run(["git", "show", f"{ref}:{PACKAGE}"], cwd=root, capture_output=True, text=True)
    return json.loads(out.stdout)["version"] if out.returncode == 0 else None


# --- commands --------------------------------------------------------------------------------------------------


def check(root: Path = ROOT, base: str | None = None) -> list[str]:
    """Problems that should fail CI; warnings are printed, not returned."""
    problems: list[str] = []
    found = read_versions(root)
    if len(set(found.values())) > 1:
        problems.append("Version files disagree: " + ", ".join(f"{k} = {v}" for k, v in found.items())
                        + ". Use `make release V=...` (tools/release.py bump) instead of editing them by hand.")
        return problems
    current = found[PACKAGE]
    try:
        v = Version.parse(current)
    except ReleaseError as e:
        return [str(e)]
    sec = sections(read_log(root))
    if "Unreleased" not in sec:
        problems.append(f"{CHANGELOG} has no ## [Unreleased] section")
    if current not in sec:
        problems.append(f"{CHANGELOG} has no ## [{current}] section for the current version")
    elif not sec[current][0]:
        problems.append(f"{CHANGELOG}: ## [{current}] needs a date (## [{current}] - YYYY-MM-DD)")
    if base:
        old = version_at(base, root)
        if old and old != current:
            if v <= Version.parse(old):
                problems.append(f"The version went from {old} to {current}: it can only go up")
            if f"v{current}" in tags(root):
                problems.append(f"v{current} is already tagged: pick the next version")
        if old == current:
            changed = git("diff", "--name-only", f"{base}...HEAD", root=root).splitlines()
            code = [f for f in changed if f.startswith(("web/app/", "web/components/", "web/lib/", "pipeline/"))
                    and "/tests/" not in f]
            if code and CHANGELOG not in changed:
                print(f"::warning::This branch changes {len(code)} code file(s) but not {CHANGELOG}. "
                      "Add a line under ## [Unreleased] if people will notice the change.")
    return problems


def bump(kind: str, root: Path = ROOT, date: str | None = None) -> Version:
    problems = check(root)
    if problems:
        raise ReleaseError("Fix these first:\n- " + "\n- ".join(problems))
    new = Version.parse(read_versions(root)[PACKAGE]).bump(kind)
    text = cut(read_log(root), new, date or datetime.now(UTC).date().isoformat())
    write_version(new, root)
    write_log(text, root)
    return new


def publish(sha: str, root: Path = ROOT, dry_run: bool = False) -> list[list[str]]:
    """Tag the current version at `sha` if it isn't tagged, then create the GitHub release of every tagged version in
    CHANGELOG that has none. Returns the commands (run unless dry_run)."""
    current = read_versions(root)[PACKAGE]
    text = read_log(root)
    have = tags(root)
    cmds: list[list[str]] = []
    if f"v{current}" not in have:
        msg = f"v{current}\n\n{notes(text, current)}"
        cmds.append(["git", "-c", "user.name=github-actions[bot]",
                     "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                     "tag", "-a", f"v{current}", sha, "-m", msg])
        cmds.append(["git", "push", "origin", f"refs/tags/v{current}"])
        have.add(f"v{current}")
    released = set()
    if not dry_run:
        out = subprocess.run(["gh", "release", "list", "--limit", "200", "--json", "tagName", "--jq", ".[].tagName"],
                             cwd=root, capture_output=True, text=True, check=True).stdout
        released = set(out.split())
    newest = max((Version.parse(v[1:]) for v in have if SEMVER.match(v[1:]) and not Version.parse(v[1:]).prerelease),
                 default=None)
    # oldest first, so the release list reads in order and the newest ends up marked "Latest"
    for ver in sorted((v for v in sections(text) if v != "Unreleased"), key=Version.parse):
        tag = f"v{ver}"
        if tag not in have or tag in released:
            continue
        v = Version.parse(ver)
        cmd = ["gh", "release", "create", tag, "--title", tag, "--notes", notes(text, ver), "--verify-tag"]
        if v.prerelease:
            cmd.append("--prerelease")
        cmd.append(f"--latest={'true' if v == newest else 'false'}")
        cmds.append(cmd)
    for cmd in cmds:
        print("+", " ".join(c if len(c) < 60 else c[:57] + "..." for c in cmd), flush=True)
        if not dry_run:
            subprocess.run(cmd, cwd=root, check=True)
    return cmds


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("current")
    c = sub.add_parser("check")
    c.add_argument("--base", help="git ref to compare with, e.g. origin/main")
    b = sub.add_parser("bump")
    b.add_argument("kind", help="major, minor, patch or an exact version such as 0.6.0-beta.1")
    b.add_argument("--date", help="release date (default: today, UTC)")
    n = sub.add_parser("notes")
    n.add_argument("version")
    p = sub.add_parser("publish")
    p.add_argument("--sha", required=True)
    p.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "current":
            print(read_versions()[PACKAGE])
        elif args.cmd == "check":
            problems = check(base=args.base)
            for problem in problems:
                print(f"::error::{problem}")
            if problems:
                return 1
            print(f"Version {read_versions()[PACKAGE]}: files agree and {CHANGELOG} covers it")
        elif args.cmd == "bump":
            new = bump(args.kind, date=args.date)
            print(f"Version {new}. Review {CHANGELOG}, then commit: git commit -am \"Release {new}\"")
        elif args.cmd == "notes":
            print(notes(read_log(), args.version))
        elif args.cmd == "publish":
            publish(args.sha, dry_run=args.dry_run)
    except ReleaseError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
