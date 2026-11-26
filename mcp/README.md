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

You need [Node.js](https://nodejs.org) 20 or newer. Every release of the site comes with the server as a package, and
`npx` (part of Node.js) downloads and starts it, so there's nothing else to install. The link below always points to
the newest release:

```text
https://github.com/kamransingri/illini-scheduler/releases/latest/download/illini-scheduler-mcp.tgz
```

**Claude Code**

```sh
claude mcp add illini-scheduler -- npx -y https://github.com/kamransingri/illini-scheduler/releases/latest/download/illini-scheduler-mcp.tgz
claude mcp get illini-scheduler     # should say "Connected"
```

On Windows (not WSL), put `cmd /c` before `npx`. Add `--scope user` to have it in every project, not just the
current folder.

**Claude Desktop.** Open Settings, then Developer, then **Edit Config**. That opens `claude_desktop_config.json`:
`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS. Add this and restart Claude Desktop:

```json
{
  "mcpServers": {
    "illini-scheduler": {
      "command": "npx",
      "args": ["-y", "https://github.com/kamransingri/illini-scheduler/releases/latest/download/illini-scheduler-mcp.tgz"]
    }
  }
}
```

**Other apps** (Cursor, VS Code, ...) take the same command, `npx -y` and the link, in their MCP settings. Apps that
only accept a URL need the hosted server, which comes later (#102).

**A fixed version.** Each release on the [releases page](https://github.com/kamransingri/illini-scheduler/releases)
also has `illini-scheduler-mcp-X.Y.Z.tgz`; use its link instead to stay on that version. npx keeps the copy it
downloaded, so if the server misbehaves after the site changes, delete npx's folder (`~/.npm/_npx`, or
`%LocalAppData%\npm-cache\_npx` on Windows) and restart your app to get the newest one.

**From a copy of the repository**, to try changes before they're released:

```sh
git clone https://github.com/kamransingri/illini-scheduler
cd illini-scheduler/mcp
npm ci
npm run build        # writes dist/index.js
```

Then use `node /full/path/to/illini-scheduler/mcp/dist/index.js` as the command instead of `npx -y` and the link.
On Windows, write the path in Claude Desktop's config with forward slashes (`C:/Users/you/illini-scheduler/mcp/dist/index.js`)
or doubled backslashes.

## Options

| Environment variable | Default | What it does |
| --- | --- | --- |
| `ILLINI_SCHEDULER_DATA` | `https://kamransingri.github.io/illini-scheduler/data` | Where to read the data: another URL, or a local folder such as `../web/public/data` after `make data` |

Files are cached in memory for 30 minutes. The site rebuilds once a night.

## Working on it

- `src/tools.ts` builds each tool's answer from the JSON. The search, the gen-ed filters, the best-pick score and the
  schedule generator are imported from `web/lib`, so the server always ranks things the way the site does.
- `src/server.ts` registers the tools and their descriptions with the MCP SDK. Each tool's arguments are in
  `src/schemas.ts`, and `src/answers.ts` reads the files and answers. The HTTP API in [`api/`](../docs/BACKEND.md)
  uses the same two files, so the API and the server always give the same answers.
- `src/source.ts` fetches and caches the files and imports nothing from Node, so the API's Edge Function can use it;
  `src/data.ts` adds reading a local folder.
- `npm test` builds `dist/index.js` and runs Vitest against the saved data in `test/fixtures/data`, including a run of
  the built server over stdio. `npx tsc --noEmit` type-checks. `make test` and `make lint` at the repo root run both.
- `node scripts/make-fixtures.mjs` refreshes the saved data from the live site (or pass a folder). Do it when the data
  format changes (`format_version` in `meta.json`).
- `npm run smoke` is the package as people get it: it packs it, installs it into an empty folder, starts it with
  `npx` against the saved data and calls every tool once. CI runs it.
- Releases: the package has the site's version (`tools.release` moves `package.json` with the rest) and is one file,
  `dist/index.js`, with no dependencies to install. The Release workflow builds it from the tagged commit and attaches
  it to the GitHub release; it also publishes it to npm once the repository has an `NPM_TOKEN` secret.
