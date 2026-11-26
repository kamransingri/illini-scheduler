// What each question answers, read from the data the same way for the MCP server (server.ts turns an answer into a tool
// result) and the HTTP API (api/ turns it into a JSON response). Nothing here imports Node, so the API bundles it.
import { parseCode } from "../../web/lib/search";
import type { Course, GenedRow, Meta, SearchIndex } from "../../web/lib/types";
import { setBuildings, type Point } from "../../web/lib/walk";
import { NotFound, type DataSource } from "./source";
import { buildSchedules, findGeneds, getCourse, searchCourses, termInfo, type BuildArgs, type CourseArgs, type GenedArgs, type Loaded, type SearchArgs } from "./tools";

/** 400: the question can't be answered as asked; 404: no such course; 502: the data couldn't be read. */
export type Answer = { ok: true; value: unknown } | { ok: false; status: 400 | 404 | 502; message: string };

/** Where the data comes from, and how to search in this interface ("search_courses", "GET /v1/courses?q="), for messages. */
export type Asker = { src: DataSource; search: string };

const ok = (value: unknown): Answer => ({ ok: true, value });
const fail = (status: 400 | 404 | 502, message: string): Answer => ({ ok: false, status, message });

async function guarded({ src, search }: Asker, run: () => Promise<Answer>): Promise<Answer> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof NotFound) return fail(404, `Not in the data: ${e.message}. Use ${search} to find the right code.`);
    return fail(502, `Couldn't read Illini Scheduler's data from ${src.root}: ${(e as Error).message}`);
  }
}

/** A course by code, following a renumbering (renumbered.json); null when the data doesn't have it. */
async function readCourse(src: DataSource, code: { subject: string; number: string }): Promise<{ course: Course; renamed: string | null } | null> {
  try {
    return { course: await src.read<Course>(`course/${code.subject}/${code.number}.json`), renamed: null };
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
    const moved = (await src.read<Record<string, string>>("renumbered.json").catch(() => ({}) as Record<string, string>))[`${code.subject} ${code.number}`];
    if (!moved) return null;
    const [s, n] = moved.split(" ");
    return { course: await src.read<Course>(`course/${s}/${n}.json`), renamed: `${code.subject} ${code.number} is now ${moved}` };
  }
}

export function terms(a: Asker): Promise<Answer> {
  return guarded(a, async () => ok(termInfo(await a.src.read<Meta>("meta.json"), a.src.site)));
}

export function search(a: Asker, args: SearchArgs): Promise<Answer> {
  return guarded(a, async () => {
    const [index, meta] = await Promise.all([a.src.read<SearchIndex>("search.json"), a.src.read<Meta>("meta.json")]);
    return ok(searchCourses(index, meta, a.src.site, args));
  });
}

export function course(a: Asker, args: CourseArgs & { course: string }): Promise<Answer> {
  return guarded(a, async () => {
    const code = parseCode(args.course);
    if (!code) return fail(400, `'${args.course}' isn't a course code. Use a code like 'CS 124', or ${a.search}.`);
    const [meta, found] = await Promise.all([a.src.read<Meta>("meta.json"), readCourse(a.src, code)]);
    if (!found) return fail(404, `No course ${code.subject} ${code.number} in the data (it isn't offered this term or next and has no recent grades). Use ${a.search}.`);
    return ok({ ...(found.renamed ? { renumbered: found.renamed } : {}), ...getCourse(found.course, meta, a.src.site, args) });
  });
}

export function geneds(a: Asker, args: GenedArgs): Promise<Answer> {
  return guarded(a, async () => {
    const [rows, meta] = await Promise.all([a.src.read<GenedRow[]>("geneds.json"), a.src.read<Meta>("meta.json")]);
    return ok(findGeneds(rows, meta, a.src.site, args));
  });
}

export function schedules(a: Asker, args: BuildArgs): Promise<Answer> {
  return guarded(a, async () => {
    const meta = await a.src.read<Meta>("meta.json");
    const codes = args.courses.map((raw) => ({ raw, code: parseCode(raw) }));
    const read = await Promise.all(codes.map(({ code }) => (code ? readCourse(a.src, code) : null)));
    const found: Loaded[] = [];
    const missing: string[] = [];
    codes.forEach(({ raw, code }, i) => {
      const r = read[i];
      if (!code) missing.push(`courses: '${raw}' isn't a course code, so it's left out. Use ${a.search} to find the code.`);
      else if (!r) missing.push(`courses: there's no ${code.subject} ${code.number} in the data, so it's left out. Use ${a.search}.`);
      else if (!found.some((f) => f.course.subject === r.course.subject && f.course.number === r.course.number))
        found.push({ course: r.course, ...(r.renamed ? { renumbered: r.renamed } : {}) });
    });
    if (!found.length) return fail(400, `None of the courses could be read. ${missing.join(" ")}`);
    // walking times between buildings, as the builder uses them (#94); without them walks fall back to campus areas
    setBuildings((await a.src.read<{ buildings: Record<string, Point> }>("buildings.json").catch(() => null))?.buildings);
    return ok(buildSchedules(found, missing, meta, a.src.site, args));
  });
}
