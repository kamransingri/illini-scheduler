"""SQLite schema for data/illini.db. Every phase writes its own tables; `connect()` creates them all."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Phase 1: Course Explorer
CREATE TABLE IF NOT EXISTS terms (
    term TEXT PRIMARY KEY,          -- '2027-sp'
    year INTEGER, season TEXT,      -- 'spring' | 'summer' | 'fall' | 'winter'
    label TEXT,                     -- 'Spring 2027'
    source TEXT,                    -- 'cis-api' | 'wade-course-catalog'
    checked_at TEXT                 -- when the source snapshot was taken (ISO 8601)
);
CREATE TABLE IF NOT EXISTS subjects (subject TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS courses (
    term TEXT, subject TEXT, number TEXT, title TEXT, credit_hours TEXT, description TEXT,
    gened_codes TEXT,               -- space-separated codes, e.g. 'HP NW'
    gened_text TEXT,                -- raw 'Degree Attributes'
    prereq_text TEXT, section_info_text TEXT, schedule_info_text TEXT,
    PRIMARY KEY (term, subject, number)
);
CREATE TABLE IF NOT EXISTS sections (
    term TEXT, crn TEXT, subject TEXT, number TEXT, section_code TEXT,
    type TEXT, type_name TEXT, part_of_term TEXT,
    start_time INTEGER, end_time INTEGER, days INTEGER, days_text TEXT,  -- first meeting
    building TEXT, room TEXT, instructors_raw TEXT,
    enrollment_status TEXT, status_code TEXT, section_title TEXT, section_credit_hours TEXT,
    section_text TEXT, section_notes TEXT,
    component TEXT,                 -- 'primary' or the secondary type code (DIS, LAB, ...)
    link_group TEXT,                -- sections that must be taken together share a group ('*' = any-with-any)
    PRIMARY KEY (term, crn)
);
CREATE TABLE IF NOT EXISTS meetings (
    term TEXT, crn TEXT, idx INTEGER, type TEXT,
    start_time INTEGER, end_time INTEGER, days INTEGER, building TEXT, room TEXT, instructors_raw TEXT,
    PRIMARY KEY (term, crn, idx)
);
CREATE INDEX IF NOT EXISTS sections_course ON sections(subject, number, term);

-- Seat availability (Open / Closed / ...) per section, from the Course Explorer web pages
CREATE TABLE IF NOT EXISTS availability (
    term TEXT, crn TEXT, status TEXT, checked_at TEXT, since TEXT,
    PRIMARY KEY (term, crn)
);
CREATE TABLE IF NOT EXISTS seat_events (
    term TEXT, at TEXT, crn TEXT, subject TEXT, number TEXT, code TEXT, old TEXT, new TEXT
);

-- Phase 2: GPA
CREATE TABLE IF NOT EXISTS gpa_course (
    subject TEXT, number TEXT, title TEXT, avg_gpa REAL, recent_avg_gpa REAL, students INTEGER,
    recent_students INTEGER, terms_covered INTEGER, first_term TEXT, last_term TEXT,
    pct_A REAL, pct_B REAL, pct_C REAL, pct_DF REAL, pct_W REAL,
    PRIMARY KEY (subject, number)
);
CREATE TABLE IF NOT EXISTS gpa_course_term (
    subject TEXT, number TEXT, term TEXT, avg_gpa REAL, students INTEGER,
    pct_A REAL, pct_B REAL, pct_C REAL, pct_DF REAL, pct_W REAL,
    PRIMARY KEY (subject, number, term)
);
CREATE TABLE IF NOT EXISTS gpa_instructor_course (
    subject TEXT, number TEXT, instructor_key TEXT, instructor_name TEXT,
    avg_gpa REAL, recent_avg_gpa REAL, students INTEGER, n_terms INTEGER, first_term TEXT, last_term TEXT,
    delta_vs_course REAL, limited_data INTEGER,
    pct_A REAL, pct_B REAL, pct_C REAL, pct_DF REAL, pct_W REAL,
    PRIMARY KEY (subject, number, instructor_key)
);
CREATE TABLE IF NOT EXISTS geneds (
    subject TEXT, number TEXT, term TEXT, codes TEXT, categories TEXT,
    PRIMARY KEY (subject, number, term)
);

-- Phase 3: instructors and RMP
CREATE TABLE IF NOT EXISTS instructors (
    instructor_key TEXT PRIMARY KEY, last TEXT, first_initial TEXT, first_name TEXT, display_name TEXT,
    rmp_id TEXT, excellent_terms TEXT
);
CREATE TABLE IF NOT EXISTS instructor_aliases (
    source TEXT, raw_name TEXT, subject TEXT, instructor_key TEXT, method TEXT,
    PRIMARY KEY (source, raw_name, subject)
);
CREATE TABLE IF NOT EXISTS rmp (
    rmp_id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, department TEXT,
    avg_rating REAL, avg_difficulty REAL, would_take_again_pct REAL, num_ratings INTEGER,
    top_tags TEXT, reviews_json TEXT, fetched_at TEXT
);

-- Phase 4: offerings and changes
CREATE TABLE IF NOT EXISTS offerings (
    subject TEXT, number TEXT, term TEXT, n_sections INTEGER, instructors TEXT, online_share REAL,
    PRIMARY KEY (subject, number, term)
);
CREATE TABLE IF NOT EXISTS offering_pattern (
    subject TEXT, number TEXT, label TEXT, next_term TEXT, likelihood TEXT, reason TEXT,
    PRIMARY KEY (subject, number)
);
CREATE TABLE IF NOT EXISTS course_changes (
    subject TEXT, number TEXT, term TEXT, field TEXT, old TEXT, new TEXT, summary TEXT
);

-- Phase 5: exam / grading format
CREATE TABLE IF NOT EXISTS exam_format (
    instructor_key TEXT, subject TEXT, number TEXT, profile_json TEXT,
    PRIMARY KEY (instructor_key, subject, number)
);
"""


def connect(path: Path | str = DB_PATH) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(availability)")}
    if "since" not in cols:  # databases built before seat history existed
        conn.execute("ALTER TABLE availability ADD COLUMN since TEXT")
    return conn


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (key, value))
