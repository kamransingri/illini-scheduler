// Instruction dates for the .ics export, copied by hand from the Office of the Registrar's academic calendar for each
// term the site loads (`source`, read on `read_on`). `breaks` are days with no classes inside the term: all-campus
// holidays and breaks, from the same page. A term the Registrar hasn't published yet gets `estimated: true` and dates
// from the usual pattern; the builder and the exported events say so. Update these at each term rollover.
export type TermDates = {
  start: string; // first day of instruction (POT 1 and POT A)
  end: string; // last day of instruction (POT 1 and POT B)
  aEnd: string; // last day of POT A (first 8 weeks)
  bStart: string; // first day of POT B (second 8 weeks)
  breaks: [string, string, string][]; // [first day, last day, name]
  source: string;
  read_on: string;
  estimated?: boolean;
};

export const TERM_DATES: Record<string, TermDates> = {
  "2026-fa": {
    start: "2026-08-24",
    end: "2026-12-09",
    aEnd: "2026-10-16",
    bStart: "2026-10-19",
    breaks: [
      ["2026-09-07", "2026-09-07", "Labor Day"],
      ["2026-11-21", "2026-11-29", "Fall Break"],
    ],
    source: "https://registrar.illinois.edu/fall-2026-academic-calendar/",
    read_on: "2026-11-17",
  },
  "2027-sp": {
    start: "2027-01-19", // Martin Luther King Jr. Day (Jan 18) is the day before
    end: "2027-05-05",
    aEnd: "2027-03-12",
    bStart: "2027-03-22", // POT B starts after Spring Break
    breaks: [["2027-03-13", "2027-03-21", "Spring Break"]],
    source: "https://registrar.illinois.edu/faculty-staff/calendars/academic-calendars/academic-calendars-archive/spring-academic-calendar-27/",
    read_on: "2026-11-17",
  },
};

/** "Labor Day and Fall Break" */
export function breakNames(dates: TermDates): string {
  const names = dates.breaks.map(([, , name]) => name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
}

const SEASONS = ["sp", "su", "fa"] as const;
/** The term after `t` ("2026-fa" -> "2027-sp"), skipping winter. */
export function termAfter(t: string): string {
  const [y, s] = t.split("-");
  const i = SEASONS.indexOf(s as (typeof SEASONS)[number]);
  return i < 0 || i === 2 ? `${Number(y) + 1}-sp` : `${y}-${SEASONS[i + 1]}`;
}

/** Course pages' term tabs (#140): this term, next term, and the next summer and fall after this term, in order. */
export function tabTerms(current: string): string[] {
  const out = [current, termAfter(current)];
  let t = out[1];
  while (!out.some((x) => x.endsWith("-su") && x !== current) || !out.some((x) => x.endsWith("-fa") && x !== current)) {
    t = termAfter(t);
    out.push(t);
  }
  return out;
}

/** When Course Explorer usually posts a term's sections, where we know it ("March" for fall: #140). */
export const POSTED_IN: Record<string, string> = { fa: "March" };
