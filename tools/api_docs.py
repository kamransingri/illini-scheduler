"""Check that docs/API.md documents every field of the exported JSON (#98).

API.md has a `### `data/<file>`` heading per file and a table whose first column is a field path: `a.b` is field b
of object a, `a[]` each item of list a, and `<name>` any key of a map. A list of objects needs its items' fields
documented; a list of plain values (or of lists) is documented as the field itself.

    python -m tools.api_docs [DATA_DIR]     # default web/public/data; exit 1 when a field or file isn't documented
"""

from __future__ import annotations

import fnmatch
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
API_MD = ROOT / "docs" / "API.md"
DATA_DIR = ROOT / "web" / "public" / "data"

HEADING = re.compile(r"^#{2,4} `(?:data/)?([^`]+)`")
ROW = re.compile(r"^\| `([^`]+)` \|")
TOKEN = re.compile(r"\[\]|[^.\[\]]+")


@dataclass
class Node:
    """One step of a documented path; `wild` is the `<name>` child that matches any map key."""

    children: dict[str, Node] = field(default_factory=dict)
    wild: Node | None = None

    def add(self, path: str) -> None:
        node = self
        for tok in TOKEN.findall(path):
            if tok.startswith("<") and tok.endswith(">"):
                node.wild = node.wild or Node()
                node = node.wild
            else:
                node = node.children.setdefault(tok, Node())

    def child(self, key: str) -> Node | None:
        return self.children.get(key) or self.wild


def parse(text: str) -> dict[str, Node]:
    """{file pattern ("course/<SUBJECT>/<NUMBER>.json"): its documented fields} from API.md's text."""
    files: dict[str, Node] = {}
    current: Node | None = None
    for line in text.splitlines():
        if line.startswith("#"):
            m = HEADING.match(line)
            current = files.setdefault(m.group(1), Node()) if m else None
        elif current is not None and (r := ROW.match(line)):
            current.add(r.group(1))
    return files


def undocumented(value: Any, node: Node, path: str = "") -> set[str]:
    """Paths in `value` that `node` doesn't document, written the way API.md writes them."""
    out: set[str] = set()
    if isinstance(value, dict):
        for k, v in value.items():
            sub = node.child(k)
            here = f"{path}.{k}" if path else k
            if sub is None:
                out.add(here)
            else:
                out |= undocumented(v, sub, here)
    elif isinstance(value, list) and any(isinstance(x, dict) for x in value):
        items = node.children.get("[]")
        if items is None:
            return {f"{path}[]"}
        for x in value:
            out |= undocumented(x, items, f"{path}[]")
    return out


def pattern_for(rel: str, patterns: list[str]) -> str | None:
    """The documented file a data file is: an exact name first, then a `<name>` pattern."""
    if rel in patterns:
        return rel
    for p in patterns:
        if "<" in p and fnmatch.fnmatchcase(rel, re.sub(r"<[^>]+>", "*", p)) and rel.count("/") == p.count("/"):
            return p
    return None


def check(name: str, value: Any, text: str | None = None) -> set[str]:
    """One document against API.md's section for `name` (e.g. "live.json", which isn't under data/)."""
    docs = parse(API_MD.read_text(encoding="utf-8") if text is None else text)
    if name not in docs:
        return {"(no section in docs/API.md)"}
    return undocumented(value, docs[name])


def check_dir(data_dir: Path, text: str | None = None) -> list[str]:
    """Every JSON file under `data_dir` against API.md: one line per undocumented file or field."""
    docs = parse(API_MD.read_text(encoding="utf-8") if text is None else text)
    problems: dict[str, set[str]] = {}
    for f in sorted(data_dir.rglob("*.json")):
        rel = f.relative_to(data_dir).as_posix()
        p = pattern_for(rel, list(docs))
        if p is None:
            problems.setdefault(rel, set()).add("(the file has no section in docs/API.md)")
            continue
        missing = undocumented(json.loads(f.read_text(encoding="utf-8")), docs[p])
        if missing:
            problems.setdefault(p, set()).update(missing)
    return [f"{p}: {m}" for p, ms in sorted(problems.items()) for m in sorted(ms)]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    data_dir = Path(args[0]) if args else DATA_DIR
    if not data_dir.is_dir():
        print(f"{data_dir} doesn't exist: run `make data` first", file=sys.stderr)
        return 2
    problems = check_dir(data_dir)
    for p in problems:
        print(p)
    if problems:
        print(f"\n{len(problems)} field(s) not in docs/API.md. Add a row for each (and raise DATA_FORMAT in "
              "pipeline/export.py if a field was renamed or removed).", file=sys.stderr)
        return 1
    print(f"every field under {data_dir} is in docs/API.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
