// Shapes of the JSON written by pipeline/export.py.

export type Pct = { A: number | null; B: number | null; C: number | null; DF: number | null; W: number | null };

export type Meeting = { d: number; s: number | null; e: number | null; b: string; r: string };

export type Section = {
  crn: string;
  code: string;
  type: string;
  type_name: string;
  component: string; // "primary" or the secondary type (DIS, LAB, ...)
  group: string; // link group; "*" = pairs with any
  part: string; // part of term: "1" full, "A" first half, "B" second half
  status: string;
  status_code: string;
  credits: string;
  title: string;
  text: string;
  meetings: Meeting[];
  instructors: string[];
  instructors_raw: string[];
};

export type TermBlock = {
  label: string;
  checked_at: string;
  source: string;
  status_known: boolean;
  n_primary: number;
  n_open: number | null;
  sections: Section[];
};

export type GpaBlock = {
  avg: number | null;
  recent: number | null;
  students: number;
  recent_students: number;
  terms_covered: number;
  first_term: string;
  last_term: string;
  recent_terms: string[];
  pct: Pct;
  by_term: { term: string; gpa: number | null; students: number; pct: Pct }[];
};

export type InstructorGpa = {
  avg: number | null;
  recent: number | null;
  students: number;
  n_terms: number;
  first_term: string;
  last_term: string;
  delta: number | null;
  limited: boolean;
  pct: Pct;
};

export type Rmp = {
  id: string;
  url: string;
  rating: number | null;
  difficulty: number | null;
  would_take_again: number | null;
  num_ratings: number;
  tags: string[];
  reviews: { text: string; course: string; date: string }[];
  fetched_at: string;
};

export type ExamField = {
  value: string | number | string[];
  agree: number;
  total: number;
  evidence: { source: string; quote: string }[];
};
export type ExamProfile = Record<string, ExamField>;

export type Instructor = {
  name: string;
  teaching: string[];
  gpa: InstructorGpa | null;
  rmp: Rmp | null;
  exam: ExamProfile | null;
  tre: string[];
  in_gpa_dataset: boolean;
};

export type Change = { term: string; field: string; summary: string };

export type Course = {
  subject: string;
  number: string;
  title: string;
  subject_name: string;
  credits: string;
  credit_range: [number, number];
  description: string;
  prereq: string;
  section_info: string;
  schedule_info: string;
  latest_term: string | null;
  geneds: { codes: string[]; categories: string[] };
  gpa: GpaBlock | null;
  pattern: { label: string; target: string; likelihood: string; reason: string } | null;
  history: { term: string; n_sections: number; online_share: number | null; instructors: string[] }[];
  terms: Record<string, TermBlock>;
  instructors: Record<string, Instructor>;
  changes: Change[];
  biggest_change: Change | null;
  exam_course: ExamProfile | null;
  notes: { instructor: string; term: string; text: string; source: string }[];
};

export type SearchCourse = { s: string; n: string; t: string; c: string; g: string[]; gpa: number | null; nx: number; cu: number };
export type SearchInstructor = { name: string; k: string; c: string[] };
export type SearchIndex = { courses: SearchCourse[]; instructors: SearchInstructor[] };

export type GenedRow = {
  s: string;
  n: string;
  t: string;
  codes: string[];
  cats: string[];
  cr: [number, number];
  gpa: number | null;
  gpaN: number;
  pctA: number | null;
  nSec: number;
  nOpen: number | null;
  statusKnown: boolean;
  best: { key: string; name: string; gpa: number; students: number } | null;
  rmp: number | null;
  opts: [number, number, number][]; // [earliest start, day mask, all-online]
};

export type Meta = {
  built_at: string;
  current_term: string;
  next_term: string;
  terms: Record<string, { label: string; source: string; checked_at: string }>;
  gpa: { window: string[]; recent: string[]; snapshot: string };
  geneds_snapshot: string;
  rmp_status: string;
  match_report: Record<string, unknown>;
  repo_url: string;
  n_courses: number;
  history_terms: string[];
};
