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
| [AP-CREDIT.md](AP-CREDIT.md) | The `data/ap-credit/*.yaml` and `data/ib-credit/*.yaml` formats, where CITL's tables are, and the corrections made to them | Adding next year's AP or IB table or fixing one |
| [CLOUDFLARE.md](CLOUDFLARE.md) | The second copy of the site on Cloudflare's free plan, with data read from GitHub Pages, and how to switch its deploy on | Deploying to Cloudflare, or when its build goes over the file cap |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version, newest first | Seeing what a release brought |
| [ISSUES-AND-PRS.md](ISSUES-AND-PRS.md) | How to write an issue (task, parent, data, bug) and a pull request: titles, templates, labels, milestones, assignees | Before opening your first issue or pull request |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Branches, commits, pull requests, versions and how a release is made | Before your first pull request or release |
| [screenshots/](screenshots/) | `before/` (2026-11-16 baseline) and `after/` (v0.4.0) at desktop and phone width | Seeing the site without running it |

## Releases

Every version, with what changed, is in [CHANGELOG.md](../CHANGELOG.md) and on the repository's Releases page. How a
release is made: [CONTRIBUTING.md](../CONTRIBUTING.md#releasing).

## Screenshots

Screenshots come from `web/scripts/screenshots.mjs` with the static build served on :4173 (capped at 4,000 px tall on
desktop and 8,000 px on a phone), then reduced to 256 colours to keep the repo small:

```sh
(cd web && node scripts/screenshots.mjs ../docs/screenshots/after)
python -c "from PIL import Image; import glob; [Image.open(f).convert('RGB').quantize(256, dither=0).save(f, optimize=True) for f in glob.glob('docs/screenshots/after/*.png')]"
```
