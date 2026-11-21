// Prerequisites (#21; DECISIONS.md D49): the catalog's prerequisite sentence read into an AND/OR tree, then checked
// against My courses. Wrong is worse than missing: anything not read with confidence becomes "can't tell" (`other`),
// and the catalog text is always shown next to the answer.
import type { CourseStatus } from "./mycourses";

export type PreNode =
  | { k: "course"; code: string; with?: boolean } // with: "credit or concurrent enrollment" (may be taken alongside)
  | { k: "all"; of: PreNode[] }
  | { k: "any"; of: PreNode[] }
  | { k: "consent" } // consent of the instructor or department
  | { k: "other" }; // something the site can't check: "or equivalent", standing, GPA, "knowledge of R", a clause it couldn't read

/** `tree` null: nothing required. `more`: the catalog says a term or topic may add prerequisites. */
export type Prereq = { tree: PreNode | null; more: boolean };

const OTHER: PreNode = { k: "other" };
const CONSENT_NODE: PreNode = { k: "consent" };

// ---------- reading the text ----------

const CODE = /\b([A-Z]{2,5}) (\d{3})\b/;
const SKIP_SENTENCE = /^(restricted to|not intended|not open|open only|priority|prioriti|for .*majors only$)|cannot be taken|may not be taken|not be taken concurrently|credit is not given|no credit (is|will be) given/i;
const MORE = /additional prerequisites|may require additional|see section|section (text|information)|see (class )?schedule|as specified for each/i;
const SOFT = /recommend|encourag|preferred/i;

type Tok =
  | { t: "course"; code: string; with: boolean; qualified: boolean }
  | { t: "other"; bare: boolean; text: string }
  | { t: "consent" }
  | { t: "sep"; v: "," | "and" | "or" }
  | { t: "oneof" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "conc" }
  | { t: "grade" }
  | { t: "combo" };

const LEX: [RegExp, (m: RegExpExecArray) => Tok | null][] = [
  [/\(/y, () => ({ t: "lp" })],
  [/\)/y, () => ({ t: "rp" })],
  [/[A-Z]{2,5} \d{3}\b/y, (m) => ({ t: "course", code: m[0], with: false, qualified: false })],
  [
    /(?:credit (?:for |in )?or concurrent (?:registration|enrollment) in|concurrent (?:registration|enrollment) or credit in|completion of or concurrent (?:registration|enrollment) in|concurrent (?:registration|enrollment) in)\b/iy,
    () => ({ t: "conc" }),
  ],
  [/(?:(?:the )?(?:consent|permission|approval) of (?:the )?[a-z ]*?(?:instructor|department|faculty|advisor|program director|program)|(?:instructor|department(?:al)?|faculty) (?:consent|approval|permission))\b/iy, () => ({ t: "consent" })],
  [/with an? [A-F][+-]? or (?:higher|better|above)\b/iy, () => ({ t: "grade" })],
  [/(?:one of:?|either)(?=\s|$)/iy, () => ({ t: "oneof" })],
  [/,/y, () => ({ t: "sep", v: "," })],
  [/and\/or\b/iy, () => ({ t: "sep", v: "or" })],
  [/(?:and|with)\b/iy, () => ({ t: "sep", v: "and" })],
  [/or\b/iy, () => ({ t: "sep", v: "or" })],
  // words that add nothing to the rule
  [/a combination of\b/iy, () => ({ t: "combo" })],
  [/(?:completion of|completed|credit (?:in|for)|(?:is|are) required|required|both|successful)\b/iy, () => null],
  [/[:.]/y, () => null],
  // anything else is a word the reader doesn't know: runs of them become one "can't tell" item
  [/[A-Za-z0-9'+&./-]+/y, (m) => ({ t: "other", bare: /^(equivalent|its|an|the)$/i.test(m[0]), text: m[0] })],
];

function lex(clause: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < clause.length) {
    if (/\s/.test(clause[i])) {
      i++;
      continue;
    }
    let hit = false;
    for (const [re, make] of LEX) {
      re.lastIndex = i;
      const m = re.exec(clause);
      if (!m) continue;
      const tok = make(m);
      if (tok) out.push(tok);
      i += m[0].length;
      hit = true;
      break;
    }
    if (!hit) i++; // stray punctuation
  }
  // join runs of unknown words; "equivalent" alone (or "its equivalent") is bare
  const joined: Tok[] = [];
  for (const tok of out) {
    const last = joined[joined.length - 1];
    if (tok.t === "other" && last?.t === "other") joined[joined.length - 1] = { t: "other", bare: last.bare && tok.bare, text: `${last.text} ${tok.text}` };
    else joined.push(tok);
  }
  // consent swallows words next to it ("Chemistry faculty approval", "by consent")
  const merged = joined.filter((tok, k) => !(tok.t === "other" && (joined[k + 1]?.t === "consent" || joined[k - 1]?.t === "consent")));
  // "credit or concurrent enrollment in" covers the courses after it, up to consent or the end of the clause
  let conc = false;
  const res: Tok[] = [];
  for (const tok of merged) {
    if (tok.t === "conc") conc = true;
    else if (tok.t === "consent") {
      conc = false;
      res.push(tok);
    }
    else if (tok.t === "course") res.push({ ...tok, with: conc });
    else res.push(tok);
  }
  // a word run or a grade right next to a course qualifies it ("an honors section of MATH 347", "CHEM 104 with a B-")
  const final: Tok[] = [];
  for (let k = 0; k < res.length; k++) {
    const tok = res[k];
    // "knowledge equivalent to the coverage of ACE 360": the course is a yardstick, not a requirement
    if (tok.t === "other" && /equivalent|coverage|similar|comparable/i.test(tok.text) && res[k + 1]?.t === "course") {
      final.push(tok);
      k++;
      continue;
    }
    if ((tok.t === "other" || tok.t === "grade") && (res[k + 1]?.t === "course" || final[final.length - 1]?.t === "course")) {
      const target = res[k + 1]?.t === "course" ? (res[k + 1] as Tok & { t: "course" }) : (final[final.length - 1] as Tok & { t: "course" });
      target.qualified = true;
      continue;
    }
    if (tok.t === "grade") return null;
    final.push(tok);
  }
  return final;
}

class Bail extends Error {}

function courseNode(tok: Tok & { t: "course" }): PreNode {
  const c: PreNode = tok.with ? { k: "course", code: tok.code, with: true } : { k: "course", code: tok.code };
  return tok.qualified ? { k: "all", of: [c, OTHER] } : c;
}

/** One clause (no semicolons): items joined by commas, "and" and "or", with "one of" lists and parentheses. */
function parseClause(toks: Tok[]): PreNode {
  let pos = 0;
  const peek = (o = 0) => toks[pos + o];

  const primary = (): PreNode => {
    const tok = toks[pos];
    if (!tok) throw new Bail();
    if (tok.t === "lp") {
      pos++;
      const start = pos;
      let depth = 1;
      while (pos < toks.length && depth) {
        if (toks[pos].t === "lp") depth++;
        if (toks[pos].t === "rp") depth--;
        pos++;
      }
      if (depth) throw new Bail();
      return parseClause(toks.slice(start, pos - 1));
    }
    if (tok.t === "combo") {
      // "a combination of CS 233 and CS 340": a group of its own
      pos++;
      const of = [primary()];
      while (peek()?.t === "sep" && (peek() as { v: string }).v === "and" && (peek(1)?.t === "course" || peek(1)?.t === "lp")) {
        pos++;
        of.push(primary());
      }
      return { k: "all", of };
    }
    if (tok.t === "oneof") {
      pos++;
      const of = [primary()];
      for (;;) {
        const a = peek(),
          b = peek(1),
          c = peek(2);
        const isCourse = (x?: Tok) => x?.t === "course" || x?.t === "lp";
        if (a?.t === "sep" && (a.v === "," || a.v === "or") && isCourse(b)) pos += 1;
        else if (a?.t === "sep" && a.v === "," && b?.t === "sep" && b.v === "or" && isCourse(c)) pos += 2;
        else break;
        of.push(primary());
      }
      return { k: "any", of };
    }
    pos++;
    if (tok.t === "course") return courseNode(tok);
    if (tok.t === "consent") return CONSENT_NODE;
    if (tok.t === "other") return OTHER;
    throw new Bail();
  };

  // "…, or equivalent" at the end: an alternative to the whole clause (D49.2)
  let wrap = false;
  const last = toks[toks.length - 1];
  if (last?.t === "other" && last.bare && toks[toks.length - 2]?.t === "sep" && (toks[toks.length - 2] as { v: string }).v === "or") {
    toks = toks.slice(0, toks[toks.length - 3]?.t === "sep" && (toks[toks.length - 3] as { v: string }).v === "," ? -3 : -2);
    wrap = true;
  }
  if (!toks.length) return OTHER;

  // segments between top-level commas, each with the conjunction that opens it and the ones inside it
  type Seg = { lead: "and" | "or" | null; items: PreNode[]; seps: ("and" | "or")[] };
  const segs: Seg[] = [{ lead: null, items: [], seps: [] }];
  let want = true;
  while (pos < toks.length) {
    const seg = segs[segs.length - 1];
    const tok = toks[pos];
    if (tok.t === "sep") {
      pos++;
      if (tok.v === ",") {
        if (want) throw new Bail();
        segs.push({ lead: null, items: [], seps: [] });
      } else if (want) {
        // ", and X" / ", or X": the conjunction leads the new segment
        if (seg.items.length || seg.lead) throw new Bail();
        seg.lead = tok.v;
      } else seg.seps.push(tok.v);
      want = true;
      continue;
    }
    if (!want) throw new Bail(); // two items with nothing between them
    seg.items.push(primary());
    want = false;
  }
  if (want) throw new Bail();

  const one = (s: Seg): PreNode => {
    if (s.items.length === 1) return s.items[0];
    if (s.seps.every((x) => x === "or")) return { k: "any", of: s.items };
    if (s.seps.every((x) => x === "and")) return { k: "all", of: s.items };
    throw new Bail(); // "A and B or C"
  };
  let node: PreNode;
  if (segs.length === 1) node = one(segs[0]);
  else {
    const leads = segs.slice(1).map((s) => s.lead);
    const lastLead = leads[leads.length - 1];
    const inner = segs.map((s) => s.seps);
    const singleBeforeLast = segs.slice(0, -1).every((s) => s.items.length === 1);
    // "A or B, C, or D" could be "(A or B) and C, or D": an "or" inside an earlier item makes the list ambiguous
    if (lastLead === "or" && inner.slice(0, -1).some((s) => s.includes("or"))) throw new Bail();
    if (lastLead === "or" && leads.slice(0, -1).every((l) => l === null || l === "or")) node = { k: "any", of: segs.map(one) };
    else if (lastLead === "and" && leads.slice(0, -1).every((l) => l === null || l === "and")) node = { k: "all", of: segs.map(one) };
    else if (leads.every((l) => l === null)) {
      const lastSeps = inner[inner.length - 1];
      if (singleBeforeLast && lastSeps.length && lastSeps.every((x) => x === "or")) node = { k: "any", of: segs.flatMap((s) => s.items) }; // "A, B or C"
      else if (singleBeforeLast && lastSeps.length && lastSeps.every((x) => x === "and")) node = { k: "all", of: segs.flatMap((s) => s.items) }; // "A, B and C"
      else if (inner.slice(0, -1).some((s) => s.length)) node = { k: "all", of: segs.map(one) }; // "A or B, C, D or E"
      else if (!inner.some((s) => s.length) && wrap) node = { k: "any", of: segs.flatMap((s) => s.items) }; // "A, B, C or equivalent"
      else throw new Bail();
    } else throw new Bail();
  }
  return wrap ? { k: "any", of: [node, OTHER] } : node;
}

/** Flatten nested groups of the same kind, merge repeated "can't tell", unwrap single children. */
function simplify(n: PreNode): PreNode {
  if (n.k !== "all" && n.k !== "any") return n;
  const of: PreNode[] = [];
  for (const c of n.of.map(simplify)) {
    const parts = c.k === n.k ? (c as { of: PreNode[] }).of : [c];
    for (const p of parts) if (!(p.k === "other" && of.some((o) => o.k === "other"))) of.push(p);
  }
  return of.length === 1 ? of[0] : { k: n.k, of };
}

/** Read a catalog prerequisite sentence. */
export function parsePrereq(text: string | undefined): Prereq {
  let t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { tree: null, more: false };
  // parentheses: "(same as BIOC 446)" and remarks without a course go; "(… may be taken concurrently)" marks the clause
  t = t.replace(/\(([^()]*)\)/g, (_, inner: string) => (/concurrent/i.test(inner) ? " ~CONC~ " : /^same as/i.test(inner.trim()) || !CODE.test(inner) ? " " : `(${inner})`));
  // "MATH 220/MATH 221", "MATH 220/221": either one
  t = t.replace(/\b([A-Z]{2,5}) (\d{3})((?:\s*\/\s*(?:[A-Z]{2,5} )?\d{3}\b)+)/g, (_, subj: string, num: string, rest: string) => {
    const alts = rest.split("/").slice(1).map((x) => x.trim()).map((x) => (/^\d/.test(x) ? `${subj} ${x}` : x));
    return `(${[`${subj} ${num}`, ...alts].join(" or ")})`;
  });
  let more = false;
  const sentences: PreNode[] = [];
  for (const raw of t.split(/(?<=\.)\s+(?=[A-Z(])/)) {
    const s = raw.replace(/\.$/, "").trim();
    if (!s) continue;
    if (MORE.test(s)) {
      more = true;
      continue;
    }
    if (SKIP_SENTENCE.test(s)) continue;
    if (SOFT.test(s) && !/requir/i.test(s)) continue; // "MATH 231 is recommended."
    // clauses: ";" is AND, a clause opening with "or" is an alternative to everything before it
    const alts: PreNode[] = [];
    let cur: PreNode[] = [];
    for (let c of s.split(";").map((x) => x.trim())) {
      if (!c || /^(for .*majors only|restricted to|open only to)/i.test(c)) continue;
      const isAlt = /^or\b/i.test(c);
      c = c.replace(/^(or|and)\b\s*/i, "");
      // "STAT 410 preferred", "MATH 225 highly recommended": not requirements
      c = c.replace(/,?\s*(?:and\s+)?[^,;]*\b(?:preferred|recommended|encouraged)\b[^,;]*/gi, "");
      const conc = c.includes("~CONC~");
      c = c.replace(/~CONC~/g, " ");
      let node: PreNode;
      try {
        const toks = lex(c);
        if (!toks) throw new Bail();
        if (conc) for (const tok of toks) if (tok.t === "course") tok.with = true;
        node = parseClause(toks);
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        node = OTHER; // a clause it can't read: can't tell, never a guess
      }
      if (isAlt && cur.length) {
        alts.push({ k: "all", of: cur });
        cur = [];
      }
      cur.push(node);
    }
    if (cur.length) alts.push({ k: "all", of: cur });
    if (alts.length) sentences.push({ k: "any", of: alts });
  }
  if (!sentences.length) return { tree: more ? OTHER : null, more };
  return { tree: simplify({ k: "all", of: sentences }), more };
}

const cache = new Map<string, Prereq>();
/** parsePrereq, remembered: a checklist reads the same few hundred sentences on every render. */
export function prereqOf(text: string | undefined): Prereq {
  const key = text ?? "";
  let p = cache.get(key);
  if (!p) cache.set(key, (p = parsePrereq(key)));
  return p;
}

/** "(CS 125 | CS 128) & CS 225~": the tree in a short form, for tests and the labelled sample. */
export function renderPrereq(n: PreNode | null): string {
  if (!n) return "NONE";
  const go = (x: PreNode, top: boolean): string => {
    if (x.k === "course") return x.code + (x.with ? "~" : "");
    if (x.k === "consent") return "consent";
    if (x.k === "other") return "?";
    const s = x.of.map((c) => go(c, false)).join(x.k === "all" ? " & " : " | ");
    return top ? s : `(${s})`;
  };
  return go(n, true);
}

// ---------- checking it against My courses ----------

/**
 * met: done; with: met if you take the listed courses in the same term; no: something's missing; unclear: it rests on
 * something the site can't check (consent, "or equivalent", standing…).
 */
export type PreStatus = "met" | "with" | "no" | "unclear";
export type PreCheck = { status: PreStatus; missing: string; alongside: string[]; consent: boolean };

/** Check a prerequisite against the courses you have (completed, credit, or in progress, which will be done by then). */
export function checkPrereq(p: Prereq, have: Map<string, CourseStatus> | Set<string>): PreCheck {
  const has = (c: string) => have.has(c);
  const status = (n: PreNode): PreStatus => {
    switch (n.k) {
      case "course":
        return has(n.code) ? "met" : n.with ? "with" : "no";
      case "consent":
      case "other":
        return "unclear";
      case "all": {
        const s = n.of.map(status);
        return s.includes("no") ? "no" : s.includes("unclear") ? "unclear" : s.includes("with") ? "with" : "met";
      }
      case "any": {
        const s = n.of.map(status);
        return s.includes("met") ? "met" : s.includes("with") ? "with" : s.includes("unclear") ? "unclear" : "no";
      }
    }
  };
  // what's missing, in words: the unmet parts of the tree
  const words = (n: PreNode): string => {
    if (n.k === "course") return n.code;
    if (n.k === "consent") return "consent of the instructor";
    if (n.k === "other") return "something the site can't check";
    if (n.k === "any") {
      const parts = n.of.map(words);
      return parts.length === 2 ? `${parts[0]} or ${parts[1]}` : `one of ${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
    }
    const unmet = n.of.filter((c) => status(c) !== "met");
    return unmet.map((c) => (unmet.length > 1 && c.k === "any" && c.of.length > 1 ? `(${words(c)})` : words(c))).join(" and ");
  };
  const alongside: string[] = [];
  const collect = (n: PreNode) => {
    if (n.k === "course" && n.with && !has(n.code)) alongside.push(n.code);
    if (n.k === "all") n.of.forEach(collect);
    if (n.k === "any" && status(n) === "with") {
      const first = n.of.find((c) => status(c) === "with");
      if (first) collect(first);
    }
  };
  const consentIn = (n: PreNode): boolean => n.k === "consent" || ((n.k === "any" || n.k === "all") && n.of.some(consentIn));
  if (!p.tree) return { status: "met", missing: "", alongside: [], consent: false };
  const s = status(p.tree);
  if (s === "with") collect(p.tree);
  return { status: s, missing: s === "no" || s === "unclear" ? words(p.tree) : "", alongside, consent: consentIn(p.tree) };
}
