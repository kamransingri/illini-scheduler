# Docs

Start with **LIMITATIONS** (what to keep in mind when using the site) and **IDEAS** (where it could go). The rest is
reference for whoever works on the code.

| File | What's in it | Read it when |
| --- | --- | --- |
| [LIMITATIONS.md](LIMITATIONS.md) | What the site can't do yet, or does only approximately, and why | Before trusting a number, or before filing a bug |
| [IDEAS.md](IDEAS.md) | What we'd like to build next: student reviews and rankings, course and professor feedback from Reddit, seat alerts, better degree planning, AP credit from CITL in the degree checklist (built in v0.6.0) | Picking the next thing to build |
| [DECISIONS.md](DECISIONS.md) | Every judgment call, numbered by phase (D13 redesign and degree planner, D14 v0.4.0, D15 v0.5.0, D16 AP credit) | Wondering why something works the way it does |
| [DESIGN.md](DESIGN.md) | Design audit, direction, tokens, shared components, the logo and navigation | Changing anything people see |
| [DEGREE-DATA.md](DEGREE-DATA.md) | The `data/degrees/*.yaml` format and the catalog importer | Fixing or adding a degree program |
| [AP-CREDIT.md](AP-CREDIT.md) | The `data/ap-credit/*.yaml` format, where CITL's tables are, and the corrections made to them | Adding next year's AP table or fixing one |
| [PROGRESS.md](PROGRESS.md) | What was built and how it was checked, release by release, newest summary first | Checking what's been verified |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version, newest first | Seeing what a release brought |
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
