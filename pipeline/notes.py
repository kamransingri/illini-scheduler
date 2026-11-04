"""Curated student notes: data/notes/*.yaml (one file per course). No backend; new notes arrive as GitHub issues
("Suggest a note" on the course page) and a maintainer copies them in.

    course: CS 124
    notes:
      - instructor: "Challen, G"        # as printed on Course Explorer
        term: 2026-fa                   # optional
        text: "Weekly quizzes in the CBTF; no final."
        source: "https://github.com/<owner>/illini-scheduler/issues/12"   # optional
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from .config import NOTES_DIR
from .names import parse_name


@dataclass
class Note:
    subject: str
    number: str
    instructor: str
    term: str
    text: str
    source: str

    @property
    def fallback_key(self) -> str:
        p = parse_name(self.instructor)
        return f"{p.last}|{p.first_name or p.first_initial}" if p else "*"


def load_file(path: Path) -> list[Note]:
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    subj, _, num = str(doc.get("course", "")).strip().upper().partition(" ")
    if not subj or not num:
        raise ValueError(f"{path}: 'course' must look like 'CS 124'")
    out = []
    for n in doc.get("notes") or []:
        text = " ".join(str(n.get("text", "")).split())
        if not text:
            continue
        out.append(Note(subj, num.strip(), str(n.get("instructor", "")).strip(), str(n.get("term", "") or ""),
                        text[:600], str(n.get("source", "") or "")))
    return out


def load_all(directory: Path = NOTES_DIR) -> list[Note]:
    notes: list[Note] = []
    for p in sorted(directory.glob("*.yaml")):
        notes += load_file(p)
    return notes
