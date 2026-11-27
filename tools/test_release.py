import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tools import release as r

ROOT = Path(__file__).resolve().parent.parent
FILES = [r.PACKAGE, r.LOCK, r.MCP_PACKAGE, r.MCP_LOCK, r.PYPROJECT, r.CHANGELOG]

LOG = """# Changelog

## [Unreleased]

### Added

- A searchable program picker.

## [0.4.0] - 2026-11-17

### Added

- Search by CRN.

## [0.2.0-beta.1] - 2026-11-16

- First beta.

[Unreleased]: https://github.com/o/r/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/o/r/compare/v0.2.0-beta.1...v0.4.0
[0.2.0-beta.1]: https://github.com/o/r/releases/tag/v0.2.0-beta.1
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """The real version files at 0.4.0, with a small changelog."""
    for f in FILES:
        (tmp_path / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f, tmp_path / f)
    r.write_version(r.Version.parse("0.4.0"), tmp_path)
    (tmp_path / r.CHANGELOG).write_text(LOG, encoding="utf-8", newline="\n")
    return tmp_path


def git(root: Path, *args: str) -> str:
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=root,
                          check=True, capture_output=True, text=True).stdout


def test_versions_parse_order_and_bump() -> None:
    v = r.Version.parse
    assert v("0.2.0-beta.1") < v("0.2.0-beta.2") < v("0.2.0-rc.1") < v("0.2.0") < v("0.2.1") < v("0.10.0")
    assert str(v("0.4.0").bump("minor")) == "0.5.0"
    assert str(v("0.4.3").bump("patch")) == "0.4.4"
    assert str(v("0.4.3").bump("major")) == "1.0.0"
    assert str(v("0.6.0-beta.2").bump("patch")) == "0.6.0"  # finishing a pre-release
    assert str(v("0.4.0").bump("0.5.0-beta.1")) == "0.5.0-beta.1"
    assert v("0.6.0-beta.1").pep440 == "0.6.0b1" and v("1.0.0-rc.2").pep440 == "1.0.0rc2"
    assert r.from_pep440("0.2.0b1") == "0.2.0-beta.1" and r.from_pep440("0.4.0") == "0.4.0"
    with pytest.raises(r.ReleaseError):
        v("0.4.0").bump("0.3.9")
    with pytest.raises(r.ReleaseError):
        v("v1.2")


def test_bump_moves_every_file_and_the_changelog(repo: Path) -> None:
    assert r.check(repo) == []
    new = r.bump("minor", repo, date="2026-11-18")
    assert str(new) == "0.5.0"
    assert set(r.read_versions(repo).values()) == {"0.5.0"}
    for package, lockfile in ((r.PACKAGE, r.LOCK), (r.MCP_PACKAGE, r.MCP_LOCK)):
        assert json.loads((repo / package).read_text(encoding="utf-8"))["version"] == "0.5.0"
        lock = json.loads((repo / lockfile).read_text(encoding="utf-8"))
        assert lock["version"] == lock["packages"][""]["version"] == "0.5.0"
    assert 'version = "0.5.0"' in (repo / r.PYPROJECT).read_text(encoding="utf-8")
    log = r.read_log(repo)
    sec = r.sections(log)
    assert list(sec)[:3] == ["Unreleased", "0.5.0", "0.4.0"]
    assert sec["Unreleased"] == (None, "")
    assert sec["0.5.0"] == ("2026-11-18", "### Added\n\n- A searchable program picker.")
    assert ("[Unreleased]: https://github.com/o/r/compare/v0.5.0...HEAD\n"
            "[0.5.0]: https://github.com/o/r/compare/v0.4.0...v0.5.0\n") in log
    assert r.check(repo) == []
    # nothing new under Unreleased: no release
    with pytest.raises(r.ReleaseError, match="Nothing under"):
        r.bump("patch", repo)


def test_pre_release_spelling_in_pyproject(repo: Path) -> None:
    r.bump("0.5.0-beta.1", repo, date="2026-11-18")
    assert 'version = "0.5.0b1"' in (repo / r.PYPROJECT).read_text(encoding="utf-8")
    assert r.read_versions(repo)[r.PYPROJECT] == "0.5.0-beta.1"


def test_windows_line_endings_are_kept(repo: Path) -> None:
    (repo / r.CHANGELOG).write_bytes(LOG.replace("\n", "\r\n").encode())
    r.bump("patch", repo, date="2026-11-18")
    raw = (repo / r.CHANGELOG).read_bytes()
    assert b"## [0.4.1] - 2026-11-18\r\n" in raw and b"\n" not in raw.replace(b"\r\n", b"")


def test_check_catches_disagreeing_files_and_missing_sections(repo: Path) -> None:
    p = repo / r.PYPROJECT
    p.write_text(p.read_text(encoding="utf-8").replace('version = "0.4.0"', 'version = "0.4.1"'), encoding="utf-8")
    assert "disagree" in r.check(repo)[0]
    r.write_version(r.Version.parse("0.4.0"), repo)
    m = repo / r.MCP_PACKAGE  # the MCP server's package counts too
    m.write_text(m.read_text(encoding="utf-8").replace('"version": "0.4.0"', '"version": "0.3.9"'), encoding="utf-8")
    assert r.check(repo)[0].startswith("Version files disagree") and "mcp/package.json = 0.3.9" in r.check(repo)[0]
    r.write_version(r.Version.parse("0.4.2"), repo)
    assert r.check(repo) == ["CHANGELOG.md has no ## [0.4.2] section for the current version"]
    with pytest.raises(r.ReleaseError, match="Fix these first"):
        r.bump("patch", repo)


def test_check_against_a_base_branch(repo: Path) -> None:
    git(repo, "init", "-q", "-b", "main")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "base")
    git(repo, "tag", "v0.4.0")
    git(repo, "switch", "-qc", "feature/x")
    assert r.check(repo, base="main") == []
    # going down
    r.write_version(r.Version.parse("0.3.0"), repo)
    (repo / r.CHANGELOG).write_text(LOG.replace("## [0.4.0] - 2026-11-17", "## [0.3.0] - 2026-11-17"), encoding="utf-8")
    git(repo, "commit", "-qam", "down")
    assert r.check(repo, base="main") == ["The version went from 0.4.0 to 0.3.0: it can only go up"]
    # unless the higher version was withdrawn: its tag is gone, so going down replaces it
    git(repo, "tag", "-d", "v0.4.0")
    assert r.check(repo, base="main") == []
    git(repo, "tag", "v0.4.0", "main")
    # a version that's already tagged
    git(repo, "tag", "v0.5.0", "main")
    r.write_version(r.Version.parse("0.5.0"), repo)
    (repo / r.CHANGELOG).write_text(LOG.replace("## [0.4.0] - 2026-11-17", "## [0.5.0] - 2026-11-17"), encoding="utf-8")
    git(repo, "commit", "-qam", "tagged")
    assert r.check(repo, base="main") == ["v0.5.0 is already tagged: pick the next version"]


def test_publish_tags_the_new_version_and_backfills_releases(repo: Path) -> None:
    git(repo, "init", "-q", "-b", "main")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "base")
    git(repo, "tag", "v0.2.0-beta.1")
    git(repo, "tag", "v0.4.0")
    r.bump("minor", repo, date="2026-11-18")
    git(repo, "commit", "-qam", "Release 0.5.0")
    sha = git(repo, "rev-parse", "HEAD").strip()
    cmds = r.publish(sha, repo, dry_run=True)
    assert cmds[0][-6:] == ["tag", "-a", "v0.5.0", sha, "-m", "v0.5.0\n\n### Added\n\n- A searchable program picker."]
    assert cmds[1] == ["git", "push", "origin", "refs/tags/v0.5.0"]
    made = [(c[3], c[-1]) for c in cmds[2:]]
    assert made == [("v0.2.0-beta.1", "--latest=false"), ("v0.4.0", "--latest=false"), ("v0.5.0", "--latest=true")]
    assert "--prerelease" in cmds[2] and "--prerelease" not in cmds[4]
    # already tagged: nothing to tag again
    git(repo, "tag", "v0.5.0")
    assert all(c[0] == "gh" for c in r.publish(sha, repo, dry_run=True))


def test_the_repository_itself_passes() -> None:
    assert r.check(ROOT) == []
