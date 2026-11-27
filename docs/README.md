# Docs

Start with **LIMITATIONS** (what to keep in mind when using the site). Planned work and open checks are
[GitHub issues](https://github.com/kamransingri/illini-scheduler/issues), labelled by area. The rest is reference for
whoever works on the code. Setup and commands are in the [README](../README.md).

## Using the site and its data

| File | What's in it | Read it when |
| --- | --- | --- |
| [LIMITATIONS.md](LIMITATIONS.md) | What the site can't do yet, or does only approximately, and why | Before trusting a number, or before filing a bug |
| [API.md](API.md) | Every public JSON file and field, units, refresh times, the data format version and the HTTP API | Reading the data from code or an AI tool, or adding a field to the export |
| [../mcp/README.md](../mcp/README.md) | The MCP server: its five tools, setting it up in Claude Desktop, Claude Code and other apps, and working on it | Using the data from an AI app |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version, newest first | Seeing what a release brought |

## How it's built

| File | What's in it | Read it when |
| --- | --- | --- |
| [DECISIONS.md](DECISIONS.md) | Every judgment call, numbered D0 to D65 in the order they were made, each with its date, issue and reasons | Wondering why something works the way it does, or making a new call |
| [DESIGN.md](DESIGN.md) | Design audit, direction, tokens, shared components, the logo and navigation, and how much each page may hold (Part 5) | Changing anything people see |
| [DEGREE-DATA.md](DEGREE-DATA.md) | The `data/degrees/*.yaml` format, the catalog importer, tracks, minors' rules and certificates | Fixing or adding a degree program |
| [AP-CREDIT.md](AP-CREDIT.md) | The `data/ap-credit/`, `data/ib-credit/` and `data/test-credit/` (SAT and ACT) formats, where CITL's tables are, the weekly check and the corrections made to them | Adding next year's table or fixing one |
| [BACKEND.md](BACKEND.md) | The HTTP API and hosted MCP server in `api/` as a Supabase Edge Function (no database): running it, deploying it, and its CPU limits | Adding an endpoint or anything server-side |
| [PUSH.md](PUSH.md) | Seat alerts with the site closed (Web Push, #16): what's built, what the alert server must do, and how to switch it on | Working on seat alerts |
| [REDDIT.md](REDDIT.md) | The r/UIUC signal (#14): what's built, how to switch it on (Reddit API access, secrets), and the labelled check | Switching it on, or changing how comments are matched |
| [CLOUDFLARE.md](CLOUDFLARE.md) | A second copy of the site on Cloudflare's free plan. Not deployed, and planned for removal (#245) | Only if #245 is reversed |
| [../fixtures/README.md](../fixtures/README.md) | The real data the tests read instead of the network, when each file was saved and how to refresh it | Refreshing fixtures or adding a test that needs source data |

## Working together

| File | What's in it | Read it when |
| --- | --- | --- |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Branches, commits, pull requests, versions and how a release is made | Before your first pull request or release |
| [ISSUES-AND-PRS.md](ISSUES-AND-PRS.md) | How to write an issue (task, parent, data, bug) and a pull request: titles, templates, labels, milestones, assignees | Before opening your first issue or pull request |
| [AI-USE.md](AI-USE.md) | How AI tools are used to build the site, what the site sends to them (nothing), and how AI tools may read its data | Before using an AI coding tool here |
| [../AGENTS.md](../AGENTS.md) | The instructions AI coding tools read, copied to `CLAUDE.md` for Claude Code | Changing how AI tools should work in this repository |

## Releases

Every version, with what changed, is in [CHANGELOG.md](../CHANGELOG.md) and on the repository's Releases page. How a
release is made: [CONTRIBUTING.md](../CONTRIBUTING.md#releasing).

## Screenshots

The repository keeps no screenshots: nothing uses them, and every version would stay in git history (#181). For a
design review, serve the static build on :4173 and run `web/scripts/screenshots.mjs`. It writes the main pages at
desktop and phone width to `web/screenshots/`, which git ignores:

```sh
(cd web && node scripts/screenshots.mjs)
```

## Writing docs

- Change a doc in the same pull request as the behaviour it describes. [AGENTS.md](../AGENTS.md#5-keep-the-docs-true)
  has a table of which doc goes with which kind of change.
- Short, plain sentences in sentence case. Say what changes for students, name the files and fields, and give
  numbers rather than adjectives. No emoji or em dashes.
- `docs/API.md` is checked by `python -m tools.api_docs`: every exported field needs a row.
