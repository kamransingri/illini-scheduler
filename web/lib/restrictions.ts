// Section restrictions (#78-#81, DECISIONS.md D38): Course Explorer's "Restricted to ..." / "Not intended for ..."
// sentences, read from each section's text, checked against what the student says about themselves ("About you").
// Only a clear mismatch says "no"; anything the parser can't read, or the student hasn't said, is "maybe".

export type Level = "undergrad" | "graduate" | "professional";
export type Standing = "freshman" | "sophomore" | "junior" | "senior" | "graduate";

export type ClauseKind = "level" | "standing" | "first-time" | "college" | "major" | "department" | "grad-program" | "other";
export type Clause = { not: boolean; text: string; kind: ClauseKind; levels?: Level[]; standings?: Standing[]; names?: string[] };

/** Every "Restricted to ..." and "Not intended for ..." sentence in a section's text, read into a rule. */
export function parseRestrictions(text: string): Clause[] {
  const out: Clause[] = [];
  for (const m of (text || "").matchAll(/(Restricted to|Not intended for)\s+(.+?)(?:\.(?=\s|$)|$)/g)) {
    const not = m[1] === "Not intended for";
    const body = m[2].trim();
    out.push({ not, text: `${m[1]} ${body}.`, ...readBody(body) });
  }
  return out;
}

const STANDINGS: [RegExp, Standing][] = [
  [/\bfreshm[ae]n\b|\bfr\b/i, "freshman"],
  [/\bsophomores?\b|\bso\b/i, "sophomore"],
  [/\bjuniors?\b|\bjr\b/i, "junior"],
  [/\bseniors?\b|\bsr\b/i, "senior"],
  [/\bgraduate\b/i, "graduate"],
];

/** Graduate and professional degree programs ("MS: Civil Engr - Online - UIUC", "online MCS", "PHD:Information Sciences"). */
const GRAD_PROGRAM = /^(?:online\s+)?(?:non-degree|MS|MA|MBA|PHD|MEng|ME|MSA|MAS|CAS|MFA|MUP|MPH|MSW|LLM|JD|DMA|EDM|EDD|MCS|MHA|MSCE|MSEE|MSAE|MSME|MSIE|MSCEE|AUD|DNP|MD|DVM|MACC|MSTM|MSF|MSBA|MSPH|MLA|MARCH|MCS)\b/i;

/** Banner program codes before a colon: graduate, professional and non-degree ("NDEG:Accountancy Online -UIUC"). */
const GRAD_CODE = /^(PHD|MS|MA|CAS|MBA|MEng|MCS|MHRIR|NDEG|MSW|LLM|JD|MUP|MPH|MFA|MAS|MACC|MSA|EDM|EDD|AUD|DNP|MD|DVM|MSTM|MSBA|MLA|MARCH|DMA)\s*:/i;
/** Undergraduate programs by Banner code: the major's name between the colon and " - UIUC". */
const UG_CODE = /^B[A-Z]{1,4}\s*:\s*(.+?)\s*-\s*UIUC$/i;

/** Banner college names -> words in the catalog's college names (`data/degrees/*.yaml` `college`). */
const COLLEGES: [RegExp, RegExp][] = [
  [/^gies college of business$|^business$/i, /gies/i],
  [/^liberal arts (&|and) sciences$/i, /liberal arts and sciences/i],
  [/^grainger engineering$|^engineering$/i, /grainger/i],
  [/^fine (&|and) applied arts$/i, /fine and applied arts/i],
  [/^education$/i, /college of education/i],
  [/^agr, consumer, (&|and) env sciences$/i, /agricultural, consumer and environmental/i],
  [/^applied health sciences$/i, /applied health/i],
  [/^(college of )?media$/i, /college of media/i],
  [/^social work$/i, /social work/i],
  [/^information sciences$/i, /information sciences/i],
  [/^labor (&|and) employment relations$/i, /labor and employment/i],
  [/^division of exploratory ?studies$|^general studies$/i, /^$/], // no catalog program belongs to it
];

function splitNames(s: string): string[] {
  return s
    .split(/\s*,\s*(?:or\s+)?|\s+or\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function readBody(body: string): Omit<Clause, "not" | "text"> {
  const b = body.replace(/\s+/g, " ");
  // level: "Undergrad - Urbana-Champaign", "Graduate - Urbana-Champaign", "undergraduate students only", professional schools
  if (/^undergrad(uate)?( - urbana-champaign| students only)?$/i.test(b)) return { kind: "level", levels: ["undergrad"] };
  if (/^grad(uate)?( - urbana-champaign| students only)?$/i.test(b)) return { kind: "level", levels: ["graduate"] };
  if (/^(medicine|vetmed|law) - urbana-champaign$/i.test(b)) return { kind: "level", levels: ["professional"] };
  // class standing: "students with Junior or Senior class standing"
  const st = /^students with (.+) class standing$/i.exec(b);
  if (st) return { kind: "standing", standings: STANDINGS.filter(([re]) => re.test(st[1])).map(([, s]) => s) };
  if (/^first time freshman students$/i.test(b)) return { kind: "first-time" };
  // departments: "students in the Music department"
  const dep = /^students in the (.+) department$/i.exec(b);
  if (dep) return { kind: "department", names: splitNames(dep[1]) };
  // majors, minors, concentrations: "Computer Science or Bioinformatics major(s)", "CS and blended CS majors students"
  if (/^cs and blended cs majors students$/i.test(b)) return { kind: "major", names: ["Computer Science"] };
  const maj = /^(.+?) (major\(s\)(?: or minor\(s\))?|minor\(s\)|concentration\(s\))$/i.exec(b);
  if (maj) return { kind: "major", names: splitNames(maj[1]) };
  // graduate, professional and non-degree programs only: an undergraduate in a regular major isn't in them
  const items = splitNames(b.replace(/ students$/i, ""));
  if (items.length && items.every((x) => GRAD_PROGRAM.test(x) || GRAD_CODE.test(x))) return { kind: "grad-program" };
  // undergraduate degree programs by Banner code: "BSW: Social Work - UIUC", "BME:Music Education -UIUC"
  const ug = items.map((x) => UG_CODE.exec(x)?.[1]);
  if (items.length && ug.every((x) => !!x)) return { kind: "major", names: ug as string[] };
  if (COLLEGES.some(([re]) => re.test(b))) return { kind: "college", names: [b] };
  const cols = b.split(/\s+or\s+/); // college names can contain commas ("Agr, Consumer, & Env Sciences")
  if (cols.length > 1 && cols.every((x) => COLLEGES.some(([re]) => re.test(x)))) return { kind: "college", names: cols };
  return { kind: "other" };
}

// --------------------------------------------------------------------------------------------------------------
// The student
// --------------------------------------------------------------------------------------------------------------

export type AboutYou = {
  level: Level | "";
  standing: Standing | "";
  /** the major picked in the degree checklist, with its catalog college */
  program: { name: string; college: string } | null;
  /** the minors picked in the degree checklist */
  minors: { name: string }[];
};
export const NOBODY: AboutYou = { level: "", standing: "", program: null, minors: [] };

const STOP = new Set(["and", "of", "the", "in", "for", "a", "bs", "ba", "bslas", "balas", "bfa", "bmus", "bmed", "bsed", "minor", "major", "majors", "program", "students", "dept"]);
const ALIAS: Record<string, string[]> = {
  cs: ["computer", "science"],
  ds: ["data", "science"],
  eng: ["engineering"],
  engr: ["engineering"],
  engrg: ["engineering"],
  engineerng: ["engineering"],
  sci: ["science"],
  mgmt: ["management"],
  admin: ["administration"],
  env: ["environmental"],
  econ: ["economics"],
  intl: ["international"],
  bio: ["biology"],
  st: ["studies"],
};

function tokens(name: string): string[] {
  const t = name
    .toLowerCase()
    .replace(/,\s*(bs|ba|bslas|balas|bfa|bmus|bmed|bsed|bsw|bs las)\b.*$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter((x) => x && x !== "+" && !STOP.has(x));
  return t.flatMap((x) => ALIAS[x] ?? [x]);
}
const tokMatch = (a: string, b: string) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
/** "Computer Science" fits "Computer Science + Economics, BSLAS"; "Electrical & Computer Eng" fits "Electrical Engineering, BS". */
export function nameFits(listed: string, mine: string): boolean {
  const a = tokens(listed);
  const b = tokens(mine);
  if (!a.length || !b.length) return false;
  return a.every((x) => b.some((y) => tokMatch(x, y))) || b.every((y) => a.some((x) => tokMatch(x, y)));
}
/** A department fits a major when they share a meaningful word ("Electrical & Computer Eng" and "Computer Engineering"). */
function deptFits(dept: string, mine: string): boolean {
  const a = tokens(dept).filter((x) => x.length > 3);
  const b = tokens(mine);
  return a.some((x) => b.some((y) => tokMatch(x, y)));
}

type V = "ok" | "no" | "maybe";

function judge(c: Clause, me: AboutYou): V {
  const level: Level | "" = me.level || (me.standing === "graduate" ? "graduate" : me.standing ? "undergrad" : "");
  switch (c.kind) {
    case "level":
      return !level ? "maybe" : c.levels!.includes(level) ? "ok" : "no";
    case "standing":
      if (!me.standing) return level === "graduate" && !c.standings!.includes("graduate") ? "no" : "maybe";
      return c.standings!.includes(me.standing) ? "ok" : "no";
    case "first-time":
      // first-time freshmen: a freshman may be one; anyone further along isn't
      if (me.standing && me.standing !== "freshman") return "no";
      return level === "graduate" ? "no" : "maybe";
    case "grad-program":
      return level === "undergrad" ? "no" : "maybe";
    case "college": {
      if (!me.program) return "maybe";
      const col = me.program.college;
      const fit = c.names!.some((n) => COLLEGES.some(([re, cat]) => re.test(n) && cat.source !== "^$" && cat.test(col)));
      return fit ? "ok" : "no";
    }
    case "major": {
      if (!me.program && !me.minors.length) return "maybe";
      const mine = [me.program?.name, ...(/minor/i.test(c.text) ? me.minors.map((m) => m.name) : [])].filter((x): x is string => !!x);
      if (c.names!.some((n) => mine.some((m) => nameFits(n, m)))) return "ok";
      // a concentration we can't see from the program name alone
      return /concentration/i.test(c.text) ? "maybe" : "no";
    }
    case "department":
      if (!me.program) return "maybe";
      return c.names!.some((n) => deptFits(n, me.program!.name)) ? "ok" : "maybe";
    default:
      return "maybe";
  }
}

export type Eligibility = {
  status: "open" | "ok" | "no" | "maybe";
  /** the sentences that decide it, in Course Explorer's words */
  because: string[];
};

/**
 * Can this student register for a section? "open": no restriction; "ok": restricted, and they fit it; "no": a clear
 * mismatch; "maybe": a restriction we can't read, or they haven't said enough. "Not intended for" sentences count
 * against a student who fits them; one we can't read doesn't flag the section.
 */
export function eligibility(text: string, status: string, me: AboutYou): Eligibility {
  const clauses = parseRestrictions(text);
  if (!clauses.length) return /restricted/i.test(status) ? { status: "maybe", because: ["Course Explorer marks this section Restricted without saying for whom."] } : { status: "open", because: [] };
  const verdicts = clauses.map((c) => {
    const v = judge(c, me);
    if (!c.not) return v;
    if (c.kind === "other") return "ok";
    return v === "ok" ? "no" : v === "no" ? "ok" : "maybe";
  });
  const pick = (v: V) => clauses.filter((_, i) => verdicts[i] === v).map((c) => c.text);
  if (verdicts.includes("no")) return { status: "no", because: pick("no") };
  if (verdicts.includes("maybe")) return { status: "maybe", because: pick("maybe") };
  return { status: "ok", because: clauses.map((c) => c.text) };
}

// --------------------------------------------------------------------------------------------------------------
// Storage: level and standing (major and minor come from the degree checklist, lib/mycourses.ts)
// --------------------------------------------------------------------------------------------------------------

const KEY = "illini-scheduler:about-you:v1";

export function readAboutYou(): Pick<AboutYou, "level" | "standing"> {
  if (typeof window === "undefined") return { level: "", standing: "" };
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<AboutYou>;
    const level = (["undergrad", "graduate", "professional"] as const).find((x) => x === v.level) ?? "";
    const standing = (["freshman", "sophomore", "junior", "senior", "graduate"] as const).find((x) => x === v.standing) ?? "";
    return { level, standing };
  } catch {
    return { level: "", standing: "" };
  }
}

export function writeAboutYou(v: Pick<AboutYou, "level" | "standing">): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: kept for this page only */
  }
}
