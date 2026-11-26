// The MCP server: five read-only tools over Illini Scheduler's public data (#99). Nothing is written anywhere and no
// student data is sent: each call reads the site's JSON (cached) and answers from it. The arguments (schemas.ts) and
// the answers (answers.ts) are shared with the HTTP API in api/, so both say the same thing.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as answers from "./answers";
import type { DataSource } from "./source";
import { BUILD_ARGS, COURSE_ARGS, GENED_ARGS, SEARCH_ARGS } from "./schemas";
import { CHECK_NOTE } from "./tools";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function result(a: answers.Answer): CallToolResult {
  return a.ok ? { content: [{ type: "text", text: JSON.stringify(a.value, null, 1) }] } : { isError: true, content: [{ type: "text", text: a.message }] };
}

export function createServer(src: DataSource, version = "0.0.0"): McpServer {
  const asker: answers.Asker = { src, search: "search_courses" };
  const server = new McpServer(
    { name: "illini-scheduler", title: "Illini Scheduler", version },
    {
      instructions:
        "Course data for the University of Illinois Urbana-Champaign (UIUC) from Illini Scheduler, an unofficial planner. " +
        "Call term_info first to learn the current and next term. To plan a week of classes, use build_schedules and give the student each schedule's open_on_site link. Answer from the tools, not from memory, and say which term and build date an answer comes from (each result's `data`). " +
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
    async () => result(await answers.terms(asker)),
  );

  server.registerTool(
    "search_courses",
    {
      title: "Search courses",
      description:
        "Find UIUC courses by text (a code like 'CS 124' or 'cs124', a nickname like 'calc 2', or title words), subject, gen-ed, credit hours, average GPA and when they're offered. " +
        "Returns up to `limit` courses: code, title, credit_hours (as printed: '3', '3 OR 4'), gen_eds, average_gpa (recent average GPA on the 4.0 scale, null without grade data), offered_next_term / offered_this_term, and the course page url. " +
        "A text query that matches a professor also returns `instructors` with the courses they teach next term. Use get_course for sections, professors and seats.",
      inputSchema: SEARCH_ARGS,
      annotations: READ_ONLY,
    },
    async (args) => result(await answers.search(asker, args)),
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
      inputSchema: COURSE_ARGS,
      annotations: READ_ONLY,
    },
    async (args) => result(await answers.course(asker, args)),
  );

  server.registerTool(
    "find_geneds",
    {
      title: "Find gen-ed courses",
      description:
        "The site's gen-ed finder for next term: courses that count for every gen-ed asked for, ranked like the site (by default the best-pick score, 0-100). " +
        "Each result has the gen-eds it counts for, credit hours, average_gpa with gpa_students (how many grades it rests on), percent_A, lectures and open lectures next term, the best professor, and the best Rate My Professors quality. " +
        "By default only courses with an open lecture (or any lecture before seats are published) and at least 200 graded students are shown, like the site.",
      inputSchema: GENED_ARGS,
      annotations: READ_ONLY,
    },
    async (args) => result(await answers.geneds(asker, args)),
  );

  server.registerTool(
    "build_schedules",
    {
      title: "Build schedules",
      description:
        "The site's schedule builder: every conflict-free combination of the courses' sections (each lecture with the discussion or lab linked to it) that keeps the must-haves, ranked by what matters to the student exactly as the site ranks them. " +
        "Returns the top schedules (3 by default), each with a summary, expected GPA, credit hours, days off, first and last class, gaps, how many sections are open, finals, the CRNs to register with, every section's times, room, instructors and seats, warnings (closed or restricted sections, credit-hour limits, exam conflicts), and `open_on_site`: a link that opens that schedule in the site's builder. Give the student that link so they check the schedule there before registering. " +
        "`cannot_schedule` says why a course has no section that fits, and `why_no_schedule` why no schedule fits at all (two courses that always overlap, a locked section, too many must-haves). " +
        "Must-haves are hard rules: a schedule that breaks one is never shown. Priorities (what_matters) only change the order.",
      inputSchema: BUILD_ARGS,
      annotations: READ_ONLY,
    },
    async (args) => result(await answers.schedules(asker, args)),
  );

  return server;
}
