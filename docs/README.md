# Docs

| File | What's in it |
| --- | --- |
| [LIMITATIONS.md](LIMITATIONS.md) | What the site can't do yet, and why |
| [IDEAS.md](IDEAS.md) | What we'd like to build next: student reviews and rankings, seat alerts, better degree planning |
| [DECISIONS.md](DECISIONS.md) | Every judgment call, numbered (D13 for the redesign and degree planner) |
| [DESIGN.md](DESIGN.md) | Design audit, direction, tokens and shared components |
| [DEGREE-DATA.md](DEGREE-DATA.md) | The `data/degrees/*.yaml` format and the catalog importer |
| [PROGRESS.md](PROGRESS.md) | What was built and verified, phase by phase |
| [screenshots/](screenshots/) | `before/` (2026-11-16 baseline) and `after/` (v0.3.0) at desktop and phone width |

Screenshots come from `web/scripts/screenshots.mjs` with the static build served on :4173 (capped at 4,000 px tall on
desktop and 8,000 px on a phone), then reduced to 256 colours to keep the repo small:

```sh
(cd web && node scripts/screenshots.mjs ../docs/screenshots/after)
python -c "from PIL import Image; import glob; [Image.open(f).convert('RGB').quantize(256, dither=0).save(f, optimize=True) for f in glob.glob('docs/screenshots/after/*.png')]"
```
