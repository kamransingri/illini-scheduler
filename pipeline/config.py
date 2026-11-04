"""Shared paths and constants."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
DB_PATH = DATA / "illini.db"
FIXTURES = ROOT / "fixtures"
WEB_DATA = ROOT / "web" / "public" / "data"
NOTES_DIR = DATA / "notes"

USER_AGENT = "illini-scheduler/0.1 (student course planner; +https://github.com/kamransingri/illini-scheduler)"

WADE_RAW = "https://raw.githubusercontent.com/wadefagen/datasets/main"
CIS_BASE = "https://courses.illinois.edu/cisapp/explorer"

# The four reference courses used for fixtures and spot checks.
REFERENCE_COURSES = [("CS", "124"), ("MATH", "221"), ("STAT", "107"), ("RHET", "105")]
