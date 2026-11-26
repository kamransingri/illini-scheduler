# Docs

Start with **LIMITATIONS** (what to keep in mind when using the site). Planned work and open checks are
[GitHub issues](https://github.com/kamransingri/illini-scheduler/issues), labelled by area. The rest is reference for whoever works on the code.

| File | What's in it | Read it when |
| --- | --- | --- |
| [LIMITATIONS.md](LIMITATIONS.md) | What the site can't do yet, or does only approximately, and why | Before trusting a number, or before filing a bug |
| [Issues](https://github.com/kamransingri/illini-scheduler/issues) | What we'd like to build next and what's left to check, labelled by area (`degree-planner`, `seats`, `rmp`, `needs-backend`, `needs-human`…) | Picking the next thing to build |
| [DECISIONS.md](DECISIONS.md) | Every judgment call, numbered by phase (D13 redesign and degree planner, D14 v0.4.0, D15 v0.5.0, D16 AP credit) | Wondering why something works the way it does |
| [DESIGN.md](DESIGN.md) | Design audit, direction, tokens, shared components, the logo and navigation | Changing anything people see |
| [DEGREE-DATA.md](DEGREE-DATA.md) | The `data/degrees/*.yaml` format and the catalog importer | Fixing or adding a degree program |
| [REDDIT.md](REDDIT.md) | The r/UIUC signal (#14): what's built, how to switch it on (Reddit API access, secrets), and the labelled check | Switching it on, or changing how comments are matched |
| [API.md](API.md) | Every public JSON file and field, units, refresh times and the data format version | Reading the data from code or an AI tool, or adding a field to the export |
| [AP-CREDIT.md](AP-CREDIT.md) | The `data/ap-credit/*.yaml`, `data/ib-credit/*.yaml` and `data/test-credit/*.yaml` (SAT and ACT) formats, where CITL's tables are, and the corrections made to them | Adding next year's AP or IB table or fixing one |
| [BACKEND.md](BACKEND.md) | The HTTP API in `api/` as a Supabase Edge Function (no database): running it, deploying it, and its CPU limits | Adding an endpoint or anything server-side (live seats, push alerts) |
| [CLOUDFLARE.md](CLOUDFLARE.md) | The second copy of the site on Cloudflare's free plan, with data read from GitHub Pages, and how to switch its deploy on | Deploying to Cloudflare, or when its build goes over the file cap |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version, newest first | Seeing what a release brought |
| [ISSUES-AND-PRS.md](ISSUES-AND-PRS.md) | How to write an issue (task, parent, data, bug) and a pull request: titles, templates, labels, milestones, assignees | Before opening your first issue or pull request |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Branches, commits, pull requests, versions and how a release is made | Before your first pull request or release |

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
