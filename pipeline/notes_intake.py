"""Student notes intake (issue #31): approved "Student note" issues become data/notes/<subject>-<number>.yaml entries.

Students fill in the issue form (.github/ISSUE_TEMPLATE/student-note.yml, linked from "Suggest a note" on each course
page). A maintainer reads the issue and adds the `approved` label. This script, run by the "Student notes intake"
workflow, reads every open issue labelled both `student-note` and `approved`, checks it, and appends the note to the
course's file with the issue as its `source`. An issue already used as a source is skipped, so running it twice is
harmless. The workflow then opens a pull request that closes the issues it took notes from.

    python -m pipeline.notes_intake                      read the issues with `gh`
    python -m pipeline.notes_intake --issues issues.json same, from `gh issue list --json number,url,body` output
    python -m pipeline.notes_intake --pr-body pr.md      also write the pull request's description
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .config import NOTES_DIR
from .notes import load_file

MAX_LEN = 600  # what pipeline/notes.py keeps
SEASONS = {"fall": "fa", "spring": "sp", "summer": "su", "winter": "wi"}
NO_RESPONSE = "_No response_"


@dataclass
class Submission:
    number: int
    url: str
    course: str       # "CS 124"
    instructor: str   # "Challen, G" or ""
    term: str         # "2026-fa" or ""
    text: str

    @property
    def path_name(self) -> str:
        subj, num = self.course.split()
        return f"{subj.lower()}-{num}.yaml"


def form_fields(body: str) -> dict[str, str]:
    """GitHub writes an issue form's answers as "### Label" followed by the answer."""
    fields: dict[str, str] = {}
    for part in re.split(r"^### ", body or "", flags=re.M)[1:]:
        label, _, value = part.partition("\n")
        value = value.strip()
        fields[label.strip().lower()] = "" if value == NO_RESPONSE else value
    return fields


def parse_course(raw: str) -> str | None:
    m = re.fullmatch(r"([A-Za-z]{2,5})\s*-?\s*(\d{3})", raw.strip())
    return f"{m.group(1).upper()} {m.group(2)}" if m else None


def parse_term(raw: str) -> str | None:
    """"Fall 2026", "fall '26"... or "2026-fa" as "2026-fa"; "" for no answer; None when it can't be read."""
    raw = raw.strip().lower()
    if not raw:
        return ""
    if re.fullmatch(r"\d{4}-(fa|sp|su|wi)", raw):
        return raw
    m = re.fullmatch(r"(fall|spring|summer|winter)\s+'?(\d{4}|\d{2})", raw)
    if not m:
        return None
    year = m.group(2) if len(m.group(2)) == 4 else f"20{m.group(2)}"
    return f"{year}-{SEASONS[m.group(1)]}"


def parse_issue(issue: dict[str, Any]) -> tuple[Submission | None, str]:
    """A checked submission, or None and the reason it can't be used as it is."""
    f = form_fields(str(issue.get("body") or ""))
    course = parse_course(f.get("course", ""))
    if not course:
        return None, f"course {f.get('course', '')!r} doesn't look like 'CS 124'"
    term = parse_term(f.get("term taken", ""))
    if term is None:
        return None, f"term {f.get('term taken', '')!r} doesn't look like 'Fall 2026'"
    text = " ".join(f.get("note", "").split())
    if not text:
        return None, "the note is empty"
    if len(text) > MAX_LEN:
        return None, f"the note is {len(text)} characters (at most {MAX_LEN}); shorten it in the issue"
    if "[x]" not in f.get("posting policy", "").lower():
        return None, "the posting policy box isn't ticked"
    instructor = " ".join(f.get("instructor", "").split())
    return Submission(int(issue["number"]), str(issue["url"]), course, instructor, term, text), ""


def add_notes(subs: list[Submission], directory: Path = NOTES_DIR) -> list[Submission]:
    """Append each submission to its course's file unless its issue is already a source there. Returns those added."""
    added = []
    for s in subs:
        path = directory / s.path_name
        loaded = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None
        doc: dict[str, Any] = loaded or {"course": s.course, "notes": []}
        notes = doc.setdefault("notes", []) or []
        doc["notes"] = notes
        if any(str(n.get("source", "")) == s.url for n in notes):
            continue
        note: dict[str, str] = {"instructor": s.instructor} if s.instructor else {}
        if s.term:
            note["term"] = s.term
        note.update({"text": s.text, "source": s.url})
        notes.append(note)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
        load_file(path)  # the site's loader must read it back
        added.append(s)
    return added


def pr_body(added: list[Submission], skipped: list[tuple[int, str]]) -> str:
    out = ["Student notes from issues a maintainer labelled `approved` (`python -m pipeline.notes_intake`).", ""]
    out += [f"- {s.course}{f' ({s.instructor})' if s.instructor else ''}: {s.text}" for s in added]
    if skipped:
        out += ["", "Not taken (fix the issue, then run the workflow again):"]
        out += [f"- #{n}: {why}" for n, why in skipped]
    out += ["", *[f"Closes #{s.number}" for s in added]]
    return "\n".join(out) + "\n"


def read_issues(path: Path | None) -> list[dict[str, Any]]:
    if path:
        return list(json.loads(path.read_text(encoding="utf-8")))
    out = subprocess.run(["gh", "issue", "list", "--label", "student-note", "--label", "approved", "--state", "open",
                          "--limit", "200", "--json", "number,url,body"], capture_output=True, text=True, check=True)
    return list(json.loads(out.stdout))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--issues", type=Path, help="issues as JSON instead of asking gh")
    ap.add_argument("--pr-body", type=Path, help="write the pull request description here")
    ap.add_argument("--dir", type=Path, default=NOTES_DIR, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    subs, skipped = [], []
    for issue in sorted(read_issues(args.issues), key=lambda i: int(i["number"])):
        s, why = parse_issue(issue)
        if s:
            subs.append(s)
        else:
            skipped.append((int(issue["number"]), why))
    added = add_notes(subs, args.dir)
    for s in added:
        print(f"#{s.number} -> {args.dir / s.path_name}")
    for n, why in skipped:
        print(f"#{n} skipped: {why}")
    if args.pr_body:
        args.pr_body.write_text(pr_body(added, skipped), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
