// Instruction dates used for the .ics export. These are ESTIMATES based on UIUC's usual academic calendar
// (the calendar page was not reachable during the build); the UI tells students to verify them.
export type TermDates = { start: string; end: string; aEnd: string; bStart: string; breaks: [string, string][] };

export const TERM_DATES: Record<string, TermDates> = {
  "2026-fa": { start: "2026-08-24", end: "2026-12-09", aEnd: "2026-10-16", bStart: "2026-10-19", breaks: [["2026-11-21", "2026-11-29"]] },
  "2027-sp": { start: "2027-01-19", end: "2027-05-05", aEnd: "2027-03-12", bStart: "2027-03-22", breaks: [["2027-03-13", "2027-03-21"]] },
};
