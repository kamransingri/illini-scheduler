// The API's OpenAPI description, built from the same argument schemas the API checks requests against
// (mcp/src/schemas.ts), so the description can't drift from what the API accepts.
import { BUILD_ARGS, COURSE_OPTIONS, GENED_ARGS, jsonSchema, SEARCH_ARGS } from "../../mcp/src/schemas";
import { CHECK_NOTE } from "../../mcp/src/tools";

type Shape = Parameters<typeof jsonSchema>[0];

/** Each argument of `shape` as a query parameter; lists are comma-separated (repeating the parameter works too). */
function queryParams(shape: Shape, rename: Record<string, string> = {}) {
  return Object.entries(jsonSchema(shape).properties).map(([name, { description, ...schema }]) => ({
    name: rename[name] ?? name,
    in: "query",
    required: false,
    ...(description ? { description } : {}),
    schema,
    ...(schema.type === "array" ? { style: "form", explode: false } : {}),
  }));
}

const answer = (description: string) => ({
  description,
  content: { "application/json": { schema: { type: "object", description: "Every answer has `data`: when the data was built (`built_at`), the term where one applies, and a note to confirm in Course Explorer." } } },
});
const errors = { "400": { $ref: "#/components/responses/BadRequest" }, "429": { $ref: "#/components/responses/TooMany" }, "502": { $ref: "#/components/responses/DataDown" } };

export function openApi(version: string, origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Illini Scheduler API",
      version,
      description:
        "Read-only answers over Illini Scheduler's public data for the University of Illinois Urbana-Champaign: course search, one course's sections and professors, the gen-ed finder, and the schedule builder. " +
        "The same answers as the site and its MCP server. No key is needed; each address gets 60 requests a minute. For bulk use, download the JSON files instead (https://github.com/kamransingri/illini-scheduler/blob/main/docs/API.md). " +
        CHECK_NOTE,
      license: { name: "Data credits and terms", url: "https://kamransingri.github.io/illini-scheduler/terms/" },
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/terms": {
        get: {
          operationId: "termInfo",
          summary: "The current and next term, their dates, and how fresh the data is",
          responses: { "200": answer("Terms, instruction dates and breaks, when sections and seats were last read, and the GPA data's window"), ...errors },
        },
      },
      "/v1/courses": {
        get: {
          operationId: "searchCourses",
          summary: "Search courses by code, nickname, title words, subject, gen-ed, credit hours, GPA and when they're offered",
          parameters: queryParams(SEARCH_ARGS, { query: "q" }),
          responses: { "200": answer("Matching courses, and professors when the text names one"), ...errors },
        },
      },
      "/v1/courses/{subject}/{number}": {
        get: {
          operationId: "getCourse",
          summary: "One course: description, GPA, professors, and every section of a term with CRNs, times, rooms, seats and restrictions",
          parameters: [
            { name: "subject", in: "path", required: true, schema: { type: "string" }, example: "CS" },
            { name: "number", in: "path", required: true, schema: { type: "string" }, example: "124" },
            ...queryParams(COURSE_OPTIONS),
          ],
          responses: { "200": answer("The course; `renumbered` says when an old number led to it"), "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
      },
      "/v1/geneds": {
        get: {
          operationId: "findGeneds",
          summary: "The gen-ed finder: next term's courses that count for every gen-ed asked for, ranked like the site",
          parameters: queryParams(GENED_ARGS),
          responses: { "200": answer("Ranked gen-ed courses"), ...errors },
        },
      },
      "/v1/schedules": {
        post: {
          operationId: "buildSchedules",
          summary: "The schedule builder: the best conflict-free schedules of up to 10 courses, with must-haves and priorities",
          requestBody: { required: true, content: { "application/json": { schema: jsonSchema(BUILD_ARGS) } } },
          responses: { "200": answer("The top schedules, each with its CRNs, sections, warnings and a link that opens it on the site"), ...errors },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "object", required: ["status", "message"], properties: { status: { type: "integer" }, message: { type: "string" } } } },
        },
      },
      responses: {
        BadRequest: { description: "A parameter is unknown, missing or out of range; the message names it", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "No such course in the data", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        TooMany: { description: "More than 60 requests in a minute from this address", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        DataDown: { description: "The site's data couldn't be read; try again later", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}
