// The arguments of each question, in one place: the MCP server's tools (server.ts) and the HTTP API (api/) accept and
// describe exactly these, so a field means the same thing in both.
import { z } from "zod";
import { GENED_HELP, PRESET_HELP, PRESET_IDS } from "./tools";

const clock = z.string().describe("A time like '10am', '2:30pm' or '14:30'");
const weight = z.number().int().min(0).max(3).optional();

export const SEARCH_ARGS = {
  query: z.string().optional().describe("Course code, nickname or title words, e.g. 'CS 124', 'intro psychology'"),
  subject: z.string().optional().describe("Subject code, e.g. 'CS', 'MATH'"),
  gened: z.array(z.string()).optional().describe(`Gen-ed requirements; a course must meet all of them. Codes: ${GENED_HELP}`),
  credits: z.number().optional().describe("Courses that can give this many credit hours"),
  min_gpa: z.number().min(0).max(4).optional().describe("Lowest recent average GPA, e.g. 3.5"),
  offered: z.enum(["next", "current", "either", "any"]).optional().describe("'next': has sections next term; 'current': this term; 'either'; 'any' (default) also finds courses not offered now"),
  sort: z.enum(["relevance", "gpa", "code"]).optional().describe("Default: relevance with a query, else code"),
  limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
};

/** get_course's options; `course` is the code (in the API, the path). */
export const COURSE_OPTIONS = {
  term: z.string().optional().describe("Term id like '2027-sp' (from term_info). Default: next term, else this term"),
  lectures_only: z.boolean().optional().describe("Leave out discussions and labs"),
  max_sections: z.number().int().min(1).max(300).optional().describe("Default 100"),
};

export const COURSE_ARGS = {
  course: z.string().describe("Course code, e.g. 'CS 124' or 'MATH221'"),
  ...COURSE_OPTIONS,
};

export const GENED_ARGS = {
  gened: z.array(z.string()).optional().describe(`Gen-ed requirements; a course must meet all of them. Codes: ${GENED_HELP}`),
  credits: z.number().optional().describe("Courses that can give this many credit hours"),
  open_only: z.boolean().optional().describe("Only courses with an open lecture next term (default true)"),
  min_gpa_students: z.number().int().min(0).optional().describe("Fewest graded students behind the GPA (default 200; 0 to turn off)"),
  min_rmp: z.number().min(1).max(5).optional().describe("Lowest Rate My Professors quality of the best lecturer"),
  two_or_more_categories: z.boolean().optional().describe("Only courses that count for two or more gen-ed categories"),
  sort: z.enum(["score", "gpa", "pctA", "rmp", "open"]).optional().describe("Default 'score' (best pick)"),
  limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
};

export const BUILD_ARGS = {
  courses: z.array(z.string()).min(1).max(10).describe("Course codes, e.g. ['CS 124', 'MATH 231', 'RHET 105']"),
  term: z.string().optional().describe("Term id like '2027-sp' (from term_info). Default: next term"),
  locked_crns: z
    .array(z.string().regex(/^\d{5}$/))
    .optional()
    .describe("CRNs of sections that must be in every schedule (a lecture, discussion or lab the student already chose)"),
  no_classes_before: clock.optional().describe("No class may start before this, e.g. '10am' (no 8am classes: '9am')"),
  done_by: clock.optional().describe("No class may end after this, e.g. '5pm'"),
  days_off: z.array(z.string()).optional().describe("Weekdays to keep free: 'M', 'T', 'W', 'R' (Thursday), 'F' or day names"),
  lunch_break: z
    .union([z.boolean(), z.object({ from: clock.optional(), to: clock.optional(), minutes: z.number().int().min(5).max(240).optional() })])
    .optional()
    .describe("A lunch break on every day with class. true: at least 45 minutes free between 11am and 2pm; or set the window and length"),
  blocked_times: z
    .array(z.object({ days: z.string().describe("e.g. 'TR' or 'MWF'"), from: clock, to: clock }))
    .optional()
    .describe("Times with no class, like work or practice: [{days: 'TR', from: '5pm', to: '7pm'}]"),
  open_sections_only: z.boolean().optional().describe("Skip sections that were Closed at the last seat check (locked ones are kept). Default false"),
  include_special_sections: z.boolean().optional().describe("Allow sections that look reserved for a program (odd codes, notes). Default false"),
  no_rushed_walks: z.boolean().optional().describe("Skip schedules where the walk to the next class takes longer than the time between them. Default false"),
  what_matters: z
    .object({
      preset: z.enum(PRESET_IDS).optional().describe(`A starting point: ${PRESET_HELP}. The numbers below change it`),
      gpa: weight.describe("Higher expected GPA, 0 (off) to 3 (high). Default 2"),
      best_professor: weight.describe("Each lecture taught by the course's best-pick professor. Default 2"),
      professor_ratings: weight.describe("Better Rate My Professors ratings. Default 1"),
      open_seats: weight.describe("Sections open right now. Default 1"),
      more_days_off: weight.describe("More weekdays without class. Default 1"),
      fewer_gaps: weight.describe("Fewer gaps between classes. Default 1"),
      avoid_early: weight.describe("Avoid classes before too_early_before. Default 1"),
      avoid_late: weight.describe("Avoid classes after too_late_after. Default 0"),
      short_walks: weight.describe("Avoid rushed walks across campus between back-to-back classes. Default 1"),
      too_early_before: clock.optional().describe("Default '10am'"),
      too_late_after: clock.optional().describe("Default '5pm'"),
    })
    .optional()
    .describe("What matters to the student, used to rank the schedules that fit"),
  limit: z.number().int().min(1).max(10).optional().describe("How many top schedules to return. Default 3"),
};

type Shape = z.ZodRawShape;

/** Checks `input` against `shape`, refusing unknown fields (a typo shouldn't be silently ignored). */
export function check<S extends Shape>(shape: S, input: unknown): { ok: true; value: z.output<z.ZodObject<S>> } | { ok: false; message: string } {
  const r = z.strictObject(shape).safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, message: z.prettifyError(r.error) };
}

/** The JSON Schema of `shape`'s input, for the API's OpenAPI description. */
export function jsonSchema(shape: Shape): { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[] } {
  const { $schema: _, ...schema } = z.toJSONSchema(z.strictObject(shape), { io: "input" }) as Record<string, unknown>;
  return schema as ReturnType<typeof jsonSchema>;
}
