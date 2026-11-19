# Illini Scheduler MCP server

Ask your own AI app about UIUC courses and get answers from Illini Scheduler's data instead of the model's memory. It
works with Claude Desktop, Claude Code and any other [MCP](https://modelcontextprotocol.io) client that can start a
local server. Try asking:

- "Find me a 3-credit Humanities gen-ed that's also Non-Western, with a high GPA and open seats next term."
- "Which CS 124 lectures are open for Spring 2027, and who teaches them?"
- "Compare the professors for STAT 100 by GPA and Rate My Professors."
- "Build me a Spring 2027 schedule with CS 124, MATH 231 and RHET 105: nothing before 10am, Fridays off, and a lunch break."

It's read-only. It reads the site's public JSON ([docs/API.md](../docs/API.md)) from GitHub Pages, the same files the
site loads in your browser, and never registers you for anything or changes anything. The data is unofficial and can be
out of date, so check sections, seats and restrictions in Course Explorer and Self-Service before you register.

## Tools

| Tool | What it answers |
| --- | --- |
| `term_info` | The current and next term, first and last day of classes, breaks, and when the data was built |
| `search_courses` | Courses by code, nickname or title words, subject, gen-ed, credit hours, average GPA and term; professors by name |
| `get_course` | One course: description, prerequisites, gen-eds, GPA, when it's offered, and every section of a term (CRN, times, room, instructors, seats, restrictions, finals) with each professor's GPA and Rate My Professors ratings |
| `find_geneds` | The site's gen-ed finder: courses that count for the gen-eds you name, ranked by the site's best-pick score |
| `build_schedules` | The site's schedule builder: the top conflict-free schedules for a list of courses, with locked CRNs, must-haves (earliest start, latest end, days off, lunch break, blocked times, open sections only) and what matters to you. Each schedule has its CRNs, sections, warnings and a link that opens it in the builder; when nothing fits, it says why |

Every answer includes the term it covers and when the data was built (`data.built_at`). `build_schedules` ranks the
way the site does for someone who just opened it: default best-pick weights, and no About you, so restrictions are
only checked once the student opens the link.

## Set it up

You need [Node.js](https://nodejs.org) 20 or newer and a copy of this repository.

```sh
git clone https://github.com/kamransingri/illini-scheduler
cd illini-scheduler/mcp
npm ci
npm run build        # writes dist/index.js
```

Then add it to your app, using the full path to `dist/index.js`.

**Claude Code**

```sh
claude mcp add illini-scheduler -- node /full/path/to/illini-scheduler/mcp/dist/index.js
claude mcp get illini-scheduler     # should say "Connected"
```

Add `--scope user` to have it in every project, not just the current folder.

**Claude Desktop.** Open Settings, then Developer, then **Edit Config**. That opens `claude_desktop_config.json`:
`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS. Add this and restart Claude Desktop:

```json
{
  "mcpServers": {
    "illini-scheduler": {
      "command": "node",
      "args": ["/full/path/to/illini-scheduler/mcp/dist/index.js"]
    }
  }
}
```

On Windows, write the path with forward slashes (`C:/Users/you/illini-scheduler/mcp/dist/index.js`) or doubled
backslashes.

**Other apps** (Cursor, VS Code, ...) take the same command, `node /full/path/to/mcp/dist/index.js`, in their MCP
settings. Apps that only accept a URL need the hosted server, which comes later (#102).

## Options

| Environment variable | Default | What it does |
| --- | --- | --- |
| `ILLINI_SCHEDULER_DATA` | `https://kamransingri.github.io/illini-scheduler/data` | Where to read the data: another URL, or a local folder such as `../web/public/data` after `make data` |

Files are cached in memory for 30 minutes. The site rebuilds once a night.

## Working on it

- `src/tools.ts` builds each tool's answer from the JSON. The search, the gen-ed filters, the best-pick score and the
  schedule generator are imported from `web/lib`, so the server always ranks things the way the site does.
- `src/server.ts` registers the tools and their descriptions with the MCP SDK. `src/data.ts` reads and caches the
  files.
- `npm test` builds `dist/index.js` and runs Vitest against the saved data in `test/fixtures/data`, including a run of
  the built server over stdio. `npx tsc --noEmit` type-checks. `make test` and `make lint` at the repo root run both.
- `node scripts/make-fixtures.mjs` refreshes the saved data from the live site (or pass a folder). Do it when the data
  format changes (`format_version` in `meta.json`).
