// Score import (#198): reads AP scores copied off College Board's score page and IB results copied off the IB's candidate
// results site, in the browser only, into the same ApScore and IbScore lists the "Add an AP or IB exam" form fills.
import type { ApExam, ApScore, ApYear, IbLevel, IbScore } from "./apcredit";

export type ScoreKind = "AP" | "IB";
export type ApImport = { found: ApScore[]; unknown: string[]; notes: string[] };
export type IbImport = { found: IbScore[]; unknown: string[]; notUsed: string[]; notes: string[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Old and short names students see on their score pages, normalized, to the table's exam id
const AP_ALIAS: Record<string, string> = {
  "calc ab": "CALCAB",
  "calc bc": "CALCBC",
  "physics c e and m": "PHYSCEM",
  "physics c e m": "PHYSCEM",
  "physics c electricity magnetism": "PHYSCEM",
  "physics c mech": "PHYSCM",
  "physics 1 algebra based": "PHYS1",
  "physics 2 algebra based": "PHYS2",
  "us history": "USHIST",
  "apush": "USHIST",
  "us government and politics": "GOVUS",
  "us gov": "GOVUS",
  "government and politics united states": "GOVUS",
  "government and politics comparative": "GOVCOMP",
  "world history modern": "WORLDHIST",
  "macro": "MACRO",
  "micro": "MICRO",
  "economics macro": "MACRO",
  "economics micro": "MICRO",
  "comp sci a": "CSA",
  "csa": "CSA",
  "csp": "CSP",
  "studio art 2 d design": "ART2D",
  "studio art 3 d design": "ART3D",
  "studio art drawing": "DRAWING",
  "art and design drawing": "DRAWING",
  "stats": "STAT",
  "psych": "PSYC",
  "apes": "ENVSCI",
  "lang": "ENGLANG",
  "lit": "ENGLIT",
};
const IB_ALIAS: Record<string, string> = {
  "mathematics applications and interpretation": "MATHAI",
  "mathematics analysis and approaches": "MATHAA",
  "math aa": "MATHAA",
  "math ai": "MATHAI",
  "environmental systems and societies": "ESS",
  "ess": "ESS",
  "itgs": "INFOTECH",
  "information technology in a global society": "INFOTECH",
};

function lookup(exams: ApExam[], alias: Record<string, string>): Map<string, string> {
  const ids = new Set(exams.map((e) => e.id));
  const m = new Map<string, string>();
  for (const e of exams) {
    const n = norm(e.name);
    m.set(n, e.id);
    m.set(n.replace(/ and (culture|composition)$/, ""), e.id);
  }
  for (const [k, v] of Object.entries(alias)) if (ids.has(v) && !m.has(k)) m.set(k, v);
  return m;
}

// A subscore line belongs to the exam just read
const SUB_LINE: Record<string, RegExp> = { CALCBC: /\bab\s*sub-?score\b/i, MUSTH: /\baural\s*sub-?score\b/i };
const ANY_SUB = /sub-?score/i;
const YEAR = /\b(19|20)\d{2}\b/;

/** Exams, scores and subscores from text copied off College Board's score page (My AP). Retakes keep the highest score. */
export function parseApScores(text: string, year: ApYear): ApImport {
  const names = lookup(year.exams, AP_ALIAS);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  type Take = ApScore & { when: string };
  const takes: Take[] = [];
  const unknown: string[] = [];
  let when = "";
  let last: Take | null = null;

  const scoreAt = (rest: string, i: number, max: number): [number | null, number] => {
    const m = /(?:^|\D)([1-9])\s*$/.exec(rest);
    if (m) return [Number(m[1]) <= max ? Number(m[1]) : null, i];
    const next = lines[i + 1] ?? "";
    const n = /^(?:score\s*:?\s*)?([1-9])$/i.exec(next);
    return n && Number(n[1]) <= max ? [Number(n[1]), i + 1] : [null, i];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (last && ANY_SUB.test(line)) {
      if (SUB_LINE[last.exam]?.test(line)) {
        const [s, j] = scoreAt(line.replace(SUB_LINE[last.exam], ""), i, 5);
        if (s !== null) last.sub = s;
        i = j;
      }
      continue;
    }
    const y = YEAR.exec(line);
    if (y && line.replace(YEAR, "").replace(/scores?|exams?|administration|[^a-z]/gi, "") === "") {
      when = y[0];
      continue;
    }
    const isAp = /^ap\b/i.test(line);
    const body = line.replace(/^ap\b\s*/i, "").replace(YEAR, "");
    const full = norm(body).replace(/ exam$/, "");
    const short = full.replace(/\s*(score\s*)?[1-9]$/, "").replace(/ exam$/, "");
    const whole = names.get(full);
    const id = whole ?? names.get(short);
    if (!id) {
      if (isAp && short && !/^(scores?|exams?|potential|number)\b/.test(short)) unknown.push(line);
      continue;
    }
    const [s, j] = scoreAt(whole ? "" : full, i, 5);
    i = j;
    if (s === null) continue;
    last = { exam: id, score: s, sub: null, when: y?.[0] ?? when };
    takes.push(last);
  }

  const byExam = new Map<string, Take[]>();
  for (const t of takes) byExam.set(t.exam, [...(byExam.get(t.exam) ?? []), t]);
  const notes: string[] = [];
  const found = [...byExam.values()].map((list) => {
    const best = list.reduce((a, b) => (b.score > a.score || (b.score === a.score && (b.sub ?? 0) > (a.sub ?? 0)) ? b : a));
    if (list.length > 1) {
      const nm = year.exams.find((e) => e.id === best.exam)?.name ?? best.exam;
      notes.push(`AP ${nm} was taken ${list.length} times (${list.map((t) => (t.when ? `${t.score} in ${t.when}` : t.score)).join(", ")}). The highest score, ${best.score}, is kept.`);
    }
    return { exam: best.exam, score: best.score, sub: best.sub };
  });
  return { found, unknown, notes };
}

const CORE = /theory of knowledge|\btok\b|extended essay|\bee\b|creativity|\bcas\b|diploma|total points|bonus points|core points/i;
const LEVEL = /\b(HL|SL|higher level|standard level)\b/i;

/** Subjects, levels and grades from text copied off the IB's candidate results site. The diploma core is listed apart. */
export function parseIbResults(text: string, year: ApYear): IbImport {
  const names = lookup(year.exams, IB_ALIAS);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = new Map<string, IbScore>();
  const unknown: string[] = [];
  const notUsed: string[] = [];
  const notes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CORE.test(line)) {
      notUsed.push(line);
      continue;
    }
    const lv = LEVEL.exec(line);
    if (!lv) continue;
    const level: IbLevel = /^(hl|higher)/i.test(lv[1]) ? "HL" : "SL";
    const subject = line.slice(0, lv.index).replace(/\bin (english|spanish|french)\b/i, "");
    let grade = /\b([1-7])\s*$/.exec(line.slice(lv.index + lv[0].length));
    if (!grade && /^[1-7]$/.test(lines[i + 1] ?? "")) grade = /([1-7])/.exec(lines[++i]);
    const n = norm(subject);
    const id = names.get(n) ?? names.get(n.replace(/\s*\(.*$/, ""));
    if (!id || !grade) {
      if (n) unknown.push(line);
      continue;
    }
    const score = Number(grade[1]);
    const seen = out.get(id);
    if (seen) notes.push(`IB ${year.exams.find((e) => e.id === id)?.name ?? id} appears twice. The higher grade is kept.`);
    if (!seen || score > seen.score) out.set(id, { exam: id, level, score });
  }
  return { found: [...out.values()], unknown, notUsed, notes };
}

/** IB results name levels (HL, SL) and the diploma core; College Board's page names AP exams. */
export function detectKind(text: string): ScoreKind {
  const ib = (text.match(/\b(HL|SL)\b/g)?.length ?? 0) + (CORE.test(text) ? 2 : 0);
  const ap = text.match(/\bAP\b|college board/gi)?.length ?? 0;
  return ib > ap ? "IB" : "AP";
}
