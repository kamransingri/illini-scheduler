// Search by CRN. The index (data/crns.json, pipeline/export.py crn_index) is ~190 KB gzipped (about the size of search.json), so the search box only
// downloads it once someone types digits.

/** {term: {crn: [subject, number, section code, type name]}}, next term first. */
export type CrnIndex = Record<string, Record<string, [string, string, string, string]>>;

export type CrnHit = { crn: string; term: string; s: string; n: string; code: string; type: string; exact: boolean };

/** True for a query that can only be (part of) a CRN: 3 to 5 digits, spaces allowed, optional "crn" prefix. */
export function looksLikeCrn(q: string): boolean {
  return /^\s*(crn\s*:?\s*)?\d{3,5}\s*$/i.test(q);
}

export function crnDigits(q: string): string {
  return q.replace(/\D/g, "");
}

/** Sections whose CRN is or starts with the digits typed: exact match first, the next term before the current one. */
export function searchCrn(index: CrnIndex, q: string, limit = 8): CrnHit[] {
  if (!looksLikeCrn(q)) return [];
  const d = crnDigits(q);
  const out: CrnHit[] = [];
  const terms = Object.keys(index);
  for (const term of terms) {
    const rows = index[term];
    const exact = rows[d];
    if (exact) out.push({ crn: d, term, s: exact[0], n: exact[1], code: exact[2], type: exact[3], exact: true });
  }
  if (d.length < 5) {
    for (const term of terms)
      for (const [crn, r] of Object.entries(index[term])) {
        if (out.length >= limit * 3) break;
        if (crn !== d && crn.startsWith(d)) out.push({ crn, term, s: r[0], n: r[1], code: r[2], type: r[3], exact: false });
      }
  }
  const order = new Map(terms.map((t, i) => [t, i]));
  return out
    .sort((a, b) => Number(b.exact) - Number(a.exact) || (order.get(a.term) ?? 0) - (order.get(b.term) ?? 0) || a.crn.localeCompare(b.crn))
    .slice(0, limit);
}
