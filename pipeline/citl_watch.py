"""Weekly check that CITL's AP, IB, ACT and SAT credit tables still say what data/ap-credit/*.yaml,
data/ib-credit/*.yaml and data/test-credit/*.yaml copied from them (issues #23, #25 and #107).

Each year file's `source` is read again and cut down to its content lines: exam names and table rows for a static CITL
page, or the AP rows of the cutoff-score tool's data (that page is an empty shell its script fills from a JSON
service). The lines are compared with data/ap-credit/citl/<year>.txt, taken when the YAML was last checked by hand.
The tool's list of years is checked too, so a new table (2027-2028) is noticed; a year older than the newest file is
not, because some are left out on purpose (the tool's 2025-2026 IB rows have no level). IB files are checked the same
way, against the tool's IB rows and data/ib-credit/citl/. ACT and SAT rows go together into data/test-credit/citl/,
with the Rhetoric and Chemistry placement pages beside them: the chemistry rule isn't in the tool, and the Rhetoric page
and the tool disagree on one SAT score. Nothing here edits the YAML: the hand copy and its `fix`
notes stay the source of truth (docs/AP-CREDIT.md).

    python -m pipeline.citl_watch               report; exit code 10 when something changed
    python -m pipeline.citl_watch --issue F     also write an issue body (Markdown) to F when something changed
    python -m pipeline.citl_watch --update      take new snapshots, after the YAML has been brought up to date
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import httpx
import yaml

from .ap_credit import AP_DIR, IB_DIR, TEST_DIR
from .config import USER_AGENT

CUTOFF_PAGE = "https://citl.illinois.edu/current-cutoff-scores"
# Where the cutoff page's script reads its data; the page names it (PNP_API_BASE_URL), and that wins over this.
CUTOFF_API = "https://pnp-cutoffs-backend-104034467107.us-central1.run.app"
COLUMNS = ("Test Name", "Level", "Score", "Course Credit", "Credit Earned", "Placement Message", "Gen Ed Fulfillment")
KINDS = (("AP", AP_DIR), ("IB", IB_DIR), ("ACT/SAT", TEST_DIR))  # exam type(s) in CITL's tool, folder of year files
PLACEMENT = "https://citl.illinois.edu/test-placement-proficiency/current-cutoffs/"
PAGES = {TEST_DIR: {name: PLACEMENT + name for name in ("rhetoric-placement", "chemistry-placement")}}
CHANGED = 10  # exit code when something changed; errors exit 1, so the workflow can tell them apart
MAX_DIFF_LINES = 120
VOID = {"area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"}
BR = "\n"
BLOCK = {"p", "div", "li", "tr", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6"}


def _norm(s: str) -> str:
    return " ".join(s.replace("\xa0", " ").split())


class _PageText(HTMLParser):
    """The text of CITL's accordions inside <main>, in page order: each exam's title as "## Name", then one line per
    block of its body (a table row with " | " between cells, or a paragraph: the 2024-2025 page has no tables)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[str] = []
        self._main = 0
        self._skip = 0
        self._mode: str | None = None  # "title" or "body" while inside one, else None
        self._depth = 0
        self._cell = 0  # inside a table cell: its paragraphs and headings stay on the row's line
        self._buf: list[str] = []

    def _flush(self) -> None:
        line = _norm("".join(self._buf)).strip(" |")
        self._buf = []
        if line:
            self.lines.append(f"## {line}" if self._mode == "title" else line)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main":
            self._main += 1
        if tag in ("script", "style"):
            self._skip += 1
        if not self._main:
            return
        if tag in VOID:  # no end tag follows, so it mustn't count toward the depth
            if self._mode == "body" and tag in ("br", "hr"):
                self._buf.append(" ") if self._cell else self._flush()
            return
        classes = (dict(attrs).get("class") or "").split()
        if self._mode is None and ("accordion-title" in classes or "card-body" in classes):
            self._mode, self._depth, self._buf = ("title" if "accordion-title" in classes else "body"), 1, []
            return
        if self._mode:
            self._depth += 1
            if tag in ("td", "th"):
                self._cell += 1
            elif self._mode == "body" and tag in BLOCK and not self._cell:
                self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        if self._main and self._mode:
            if tag in ("td", "th"):
                self._cell = max(0, self._cell - 1)
                self._buf.append(" | ")
            elif self._mode == "body" and tag in BLOCK and not self._cell:
                self._flush()
            elif self._cell:
                self._buf.append(" ")
            self._depth -= 1
            if self._depth == 0:
                self._flush()
                self._mode = None
        if tag == "main":
            self._main = max(0, self._main - 1)

    def handle_data(self, data: str) -> None:
        if self._mode and not self._skip:
            self._buf.append(data)


class _MainText(HTMLParser):
    """Every line of text inside <main>: a static page with no accordions, like the placement pages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.buf: list[str] = []
        self._main = self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._main += tag == "main"
        self._skip += tag in ("script", "style")
        if tag in BLOCK or tag in ("br", "td", "th"):
            self.buf.append(BR)

    def handle_endtag(self, tag: str) -> None:
        self._main -= tag == "main"
        self._skip -= tag in ("script", "style")
        if tag in BLOCK or tag in ("td", "th"):
            self.buf.append(BR)

    def handle_data(self, data: str) -> None:
        if self._main > 0 and self._skip <= 0:
            self.buf.append(data)


def main_lines(html: str) -> list[str]:
    p = _MainText()
    p.feed(html)
    p.close()
    return [x for x in (_norm(line) for line in "".join(p.buf).split(BR)) if x]


def page_lines(html: str) -> list[str]:
    p = _PageText()
    p.feed(html)
    p.close()
    return p.lines


def api_lines(data: dict[str, Any], exam_type: str = "AP") -> list[str]:
    """One exam type's rows of one year from the cutoff tool, one line each, sorted so a reordering isn't a change.
    "ACT/SAT" takes both types, with the type first on each line."""
    types = exam_type.split("/")
    rows = [e for e in data.get("entries") or [] if str(e.get("Exam Type", "")).upper() in types]
    cols = (("Exam Type",) if len(types) > 1 else ()) + COLUMNS
    return sorted(" | ".join(_norm(str(e.get(c) or "")) for c in cols) for e in rows)


@dataclass
class Report:
    exam_type: str = "AP"
    directory: Path = AP_DIR
    lines: dict[str, list[str]] = field(default_factory=dict)       # year -> what the source says now
    changed: dict[str, list[str]] = field(default_factory=dict)     # year -> diff against the snapshot
    no_snapshot: list[str] = field(default_factory=list)
    new_years: list[str] = field(default_factory=list)              # in CITL's tool, without a year file here
    sources: dict[str, str] = field(default_factory=dict)

    @property
    def anything(self) -> bool:
        return bool(self.changed or self.no_snapshot or self.new_years)


def year_files(directory: Path) -> dict[str, str]:
    """year ("2026-2027") -> its source URL, from the YAML files."""
    out = {}
    for p in sorted(directory.glob("*.yaml")):
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        out[str(doc["year"])] = str(doc["source"])
    return out


def api_base(client: httpx.Client) -> str:
    m = re.search(r"PNP_API_BASE_URL\s*=\s*['\"]([^'\"]+)['\"]", client.get(CUTOFF_PAGE).text)
    return (m.group(1) if m else CUTOFF_API).rstrip("/")


def check(client: httpx.Client, directory: Path = AP_DIR, exam_type: str = "AP") -> Report:
    rep = Report(exam_type, directory)
    files = year_files(directory)
    base = api_base(client)
    offered = [str(y["id"]) for y in client.get(f"{base}/api/public/years").raise_for_status().json()]
    rep.new_years = sorted(y for y in set(offered) - set(files) if not files or y > max(files))
    pages = PAGES.get(directory, {})
    for year, source in [*files.items(), *pages.items()]:
        rep.sources[year] = source
        if year in pages:
            lines = main_lines(client.get(source).raise_for_status().text)
        elif source.rstrip("/") == CUTOFF_PAGE:
            lines = api_lines(client.get(f"{base}/api/public/years/{year}").raise_for_status().json(), exam_type)
        else:
            lines = page_lines(client.get(source).raise_for_status().text)
        if not lines:
            raise RuntimeError(f"{year}: nothing read from {source}; the page's layout may have changed")
        rep.lines[year] = lines
        snap = directory / "citl" / f"{year}.txt"
        if not snap.exists():
            rep.no_snapshot.append(year)
            continue
        old = snap.read_text(encoding="utf-8").splitlines()
        if old != lines:
            rep.changed[year] = list(difflib.unified_diff(old, lines, "snapshot", "now", n=0, lineterm=""))[2:]
    return rep


def save_snapshots(rep: Report, directory: Path | None = None) -> None:
    directory = directory or rep.directory
    (directory / "citl").mkdir(parents=True, exist_ok=True)
    for year, lines in rep.lines.items():
        (directory / "citl" / f"{year}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def issue_body(reps: Report | list[Report]) -> str:
    reps = [reps] if isinstance(reps, Report) else reps
    out = ["CITL's AP, IB, SAT or ACT tables no longer match the snapshots taken when `data/ap-credit/*.yaml`, "
           "`data/ib-credit/*.yaml` and `data/test-credit/*.yaml` were last checked (`python -m pipeline.citl_watch`).",
           ""]
    for rep in reps:
        folder = rep.directory.name
        for year in rep.new_years:
            out += [f"- **New year in CITL's cutoff tool: {year}** ({rep.exam_type}). Copy it by hand into "
                    f"`data/{folder}/{year}.yaml` from {CUTOFF_PAGE} (docs/AP-CREDIT.md)."]
        for year in rep.no_snapshot:
            out += [f"- **{rep.exam_type} {year}:** no snapshot yet in `data/{folder}/citl/`."]
    for rep in reps:
        for year, diff in rep.changed.items():
            shown = diff[:MAX_DIFF_LINES]
            more = f"\n… and {len(diff) - len(shown)} more lines" if len(diff) > len(shown) else ""
            out += ["", f"### {rep.exam_type} {year} ({rep.sources[year]})", "", "```diff", *shown, "```" + more]
    out += ["", "To close this: update the YAML by hand (keep the `fix` notes), check it with `python -m "
            "pipeline.ap_credit`, then run `python -m pipeline.citl_watch --update` and commit the new snapshots."]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--update", action="store_true", help="take new snapshots")
    ap.add_argument("--issue", type=Path, help="write an issue body here when something changed")
    args = ap.parse_args(argv)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True) as client:
        reps = [check(client, directory, exam_type) for exam_type, directory in KINDS]
    for rep in reps:
        if args.update:
            save_snapshots(rep)
            print(f"{rep.exam_type}: snapshots taken for {', '.join(rep.lines)}")
            continue
        for year in rep.lines:
            state = ("changed" if year in rep.changed else "no snapshot" if year in rep.no_snapshot else "unchanged")
            print(f"{rep.exam_type} {year}: {len(rep.lines[year])} lines, {state}")
        if rep.new_years:
            print(f"{rep.exam_type} new in CITL's tool: {', '.join(rep.new_years)}")
    if args.update or not any(rep.anything for rep in reps):
        return 0
    if args.issue:
        args.issue.write_text(issue_body(reps), encoding="utf-8")
    return CHANGED


if __name__ == "__main__":
    sys.exit(main())
