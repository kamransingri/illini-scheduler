# AI use policy

How AI tools are used to build Illini Scheduler, what the site does (and doesn't) send to them, and how AI tools may
read its data. Last updated 2026-11-26. Change this page in the same pull request as anything it describes.

## Building the site

- **AI coding tools are allowed** for code, tests, docs and issues.
- **A person is responsible for every change.** A person reviews and merges every pull request, and the checks
  (`test`, `versions`, `e2e`) have to pass, whoever or whatever wrote it ([CONTRIBUTING.md](../CONTRIBUTING.md)).
- **Start every session from the latest `main`.** Before an AI tool edits anything, pull `main` and bring it into your
  branch (`git switch main && git pull`, then `git switch <your-branch> && git merge main`). A tool working from an
  old copy rebuilds on code that has since changed, and its pull request brings back what `main` already fixed or
  removed. [AGENTS.md](../AGENTS.md) tells AI tools to do this first; check they did.
- **Say so.** When an AI tool wrote most of a pull request, the pull request says so in one line. The reviewer reads it
  as closely as any other.
- **Facts come from sources, not models.** Data the site shows as fact (degree requirements, AP, IB and test credit
  tables, restrictions, sections, grades) is copied word for word from its source or parsed by tested code
  ([ISSUES-AND-PRS.md](ISSUES-AND-PRS.md#data)). It's never written or filled in by a model. A model may write the
  parser, and the tests prove what it reads.

## Students' data

- **The site never sends anything to an AI service.** Everything a student enters stays in their browser
  ([privacy page](https://kamransingri.github.io/illini-scheduler/privacy/)), and no page calls an AI API.
- **"Ask your AI" buttons (#103), when they arrive, only copy text the student has seen first.** The student pastes it
  into their own AI app themselves, under that app's policy.

## AI tools reading the site

- The site is made to be read by AI tools: [`llms.txt`](../web/public/llms.txt), the [JSON data API](API.md) and the
  [MCP server](../mcp/README.md).
- Each of them says the data is unofficial and can be out of date, and tells the AI tool to have students confirm
  sections, seats and restrictions in Course Explorer and Self-Service before registering.
- Reusing the data means crediting its sources, as the [terms of use](https://kamransingri.github.io/illini-scheduler/terms/)
  and [API.md](API.md#where-the-data-comes-from) say. Course reviews posted on the site (#128), once they exist, may
  not be used to train AI models.

Questions or something this page gets wrong: open an issue.
