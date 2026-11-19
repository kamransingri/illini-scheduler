// The MCP server: four read-only tools over Illini Scheduler's public data (#99). Nothing is written anywhere and no
// student data is sent: each call reads the site's JSON (cached) and answers from it.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { parseCode } from "../../web/lib/search";
import type { Course, GenedRow, Meta, SearchIndex } from "../../web/lib/types";
import { NotFound, type DataSource } from "./data";
import { CHECK_NOTE, findGeneds, GENED_HELP, getCourse, searchCourses, termInfo } from "./tools";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 1) }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function guarded(src: DataSource, run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof NotFound) return fail(`Not in the data: ${e.message}. Use search_courses to find the right code.`);
    return fail(`Couldn't read Illini Scheduler's data from ${src.root}: ${(e as Error).message}`);
  }
}

export function createServer(src: DataSource, version = "0.1.0"): McpServer {
  const server = new McpServer(
    { name: "illini-scheduler", title: "Illini Scheduler", version },
    {
      instructions:
        "Course data for the University of Illinois Urbana-Champaign (UIUC) from Illini Scheduler, an unofficial planner. " +
        "Call term_info first to learn the current and next term. Answer from the tools, not from memory, and say which term and build date an answer comes from (each result's `data`). " +
        "Times are local Central time; days are M T W R F (R is Thursday). " +
        `${CHECK_NOTE} Link the course page (url) so the student can check it there.`,
    },
  );

  server.registerTool(
    "term_info",
    {
      title: "Terms and data freshness",
      description:
        "The current term and the next term (the one students register for), each with first and last day of instruction, the half-term dates and breaks, and when its sections and seats were last read. " +
        "Also: when the data was built, which terms the GPA data covers (`gpa_data.recent` is the window behind every 'recent GPA'), and whether Rate My Professors data is available.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => guarded(src, async () => ok(termInfo(await src.read<Meta>("meta.json"), src.site))),
  );

  server.registerTool(
    "search_courses",
    {
      title: "Search courses",
      description:
        "Find UIUC courses by text (a code like 'CS 124' or 'cs124', a nickname like 'calc 2', or title words), subject, gen-ed, credit hours, average GPA and when they're offered. " +
        "Returns up to `limit` courses: code, title, credit_hours (as printed: '3', '3 OR 4'), gen_eds, average_gpa (recent average GPA on the 4.0 scale, null without grade data), offered_next_term / offered_this_term, and the course page url. " +
        "A text query that matches a professor also returns `instructors` with the courses they teach next term. Use get_course for sections, professors and seats.",
      inputSchema: {
        query: z.string().optional().describe("Course code, nickname or title words, e.g. 'CS 124', 'intro psychology'"),
        subject: z.string().optional().describe("Subject code, e.g. 'CS', 'MATH'"),
        gened: z.array(z.string()).optional().describe(`Gen-ed requirements; a course must meet all of them. Codes: ${GENED_HELP}`),
        credits: z.number().optional().describe("Courses that can give this many credit hours"),
        min_gpa: z.number().min(0).max(4).optional().describe("Lowest recent average GPA, e.g. 3.5"),
        offered: z.enum(["next", "current", "either", "any"]).optional().describe("'next': has sections next term; 'current': this term; 'either'; 'any' (default) also finds courses not offered now"),
        sort: z.enum(["relevance", "gpa", "code"]).optional().describe("Default: relevance with a query, else code"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
      },
      annotations: READ_ONLY,
    },
    async (args) =>
      guarded(src, async () => {
        const [index, meta] = await Promise.all([src.read<SearchIndex>("search.json"), src.read<Meta>("meta.json")]);
        return ok(searchCourses(index, meta, src.site, args));
      }),
  );

  server.registerTool(
    "get_course",
    {
      title: "Course details, sections and professors",
      description:
        "Everything about one course: description, prerequisites, gen-eds, average GPA and grade shares, when it's usually offered, and for one term (next term by default) every section. " +
        "Each section has its CRN (what students register with), type, meeting days (M T W R F, R = Thursday) and times, building and room, instructors, seat status ('Open', 'Closed', 'Open (Restricted)', ...; 'not published yet' before registration), restriction sentences in Course Explorer's words, and final exams. " +
        "Sections with taken_with_a_lecture are discussions or labs: a student takes one with a lecture of the same link_group ('any' pairs with every group). " +
        "`instructors` lists professors (this term's first) with their GPA in this course (vs_course_average: their GPA minus the course's) and Rate My Professors quality and difficulty (1 to 5) with the rating count.",
      inputSchema: {
        course: z.string().describe("Course code, e.g. 'CS 124' or 'MATH221'"),
        term: z.string().optional().describe("Term id like '2027-sp' (from term_info). Default: next term, else this term"),
        lectures_only: z.boolean().optional().describe("Leave out discussions and labs"),
        max_sections: z.number().int().min(1).max(300).optional().describe("Default 100"),
      },
      annotations: READ_ONLY,
    },
    async (args) =>
      guarded(src, async () => {
        const code = parseCode(args.course);
        if (!code) return fail(`'${args.course}' isn't a course code. Use a code like 'CS 124', or search_courses.`);
        const meta = await src.read<Meta>("meta.json");
        let renamed: string | null = null;
        let course: Course;
        try {
          course = await src.read<Course>(`course/${code.subject}/${code.number}.json`);
        } catch (e) {
          if (!(e instanceof NotFound)) throw e;
          const moved = (await src.read<Record<string, string>>("renumbered.json").catch(() => ({}) as Record<string, string>))[`${code.subject} ${code.number}`];
          if (!moved) return fail(`No course ${code.subject} ${code.number} in the data (it isn't offered this term or next and has no recent grades). Use search_courses.`);
          const [s, n] = moved.split(" ");
          course = await src.read<Course>(`course/${s}/${n}.json`);
          renamed = `${code.subject} ${code.number} is now ${moved}`;
        }
        return ok({ ...(renamed ? { renumbered: renamed } : {}), ...getCourse(course, meta, src.site, args) });
      }),
  );

  server.registerTool(
    "find_geneds",
    {
      title: "Find gen-ed courses",
      description:
        "The site's gen-ed finder for next term: courses that count for every gen-ed asked for, ranked like the site (by default the best-pick score, 0-100). " +
        "Each result has the gen-eds it counts for, credit hours, average_gpa with gpa_students (how many grades it rests on), percent_A, lectures and open lectures next term, the best professor, and the best Rate My Professors quality. " +
        "By default only courses with an open lecture (or any lecture before seats are published) and at least 200 graded students are shown, like the site.",
      inputSchema: {
        gened: z.array(z.string()).optional().describe(`Gen-ed requirements; a course must meet all of them. Codes: ${GENED_HELP}`),
        credits: z.number().optional().describe("Courses that can give this many credit hours"),
        open_only: z.boolean().optional().describe("Only courses with an open lecture next term (default true)"),
        min_gpa_students: z.number().int().min(0).optional().describe("Fewest graded students behind the GPA (default 200; 0 to turn off)"),
        min_rmp: z.number().min(1).max(5).optional().describe("Lowest Rate My Professors quality of the best lecturer"),
        two_or_more_categories: z.boolean().optional().describe("Only courses that count for two or more gen-ed categories"),
        sort: z.enum(["score", "gpa", "pctA", "rmp", "open"]).optional().describe("Default 'score' (best pick)"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
      },
      annotations: READ_ONLY,
    },
    async (args) =>
      guarded(src, async () => {
        const [rows, meta] = await Promise.all([src.read<GenedRow[]>("geneds.json"), src.read<Meta>("meta.json")]);
        return ok(findGeneds(rows, meta, src.site, args));
      }),
  );

  return server;
}
