# Hosting the site on Cloudflare (free plan)

GitHub Pages stays the main host and keeps serving everything, data included. Cloudflare serves a second copy of the
site's pages, on the free Workers plan, with static assets only and no Worker script.

| | GitHub Pages | Cloudflare |
| --- | --- | --- |
| URL | `https://kamransingri.github.io/illini-scheduler/` | `https://illini-scheduler.kamransingri.workers.dev/` |
| Pages, scripts, `llms.txt`, `push.json` | Yes | Yes, at the root (no `/illini-scheduler` prefix) |
| `data/` (course JSON, degrees, search, feeds…) | Yes | No: pages fetch it from GitHub Pages, and `/data/*` redirects there |

## Why data stays on GitHub

Cloudflare's free plan allows 20,000 files per deploy. A full build is about 21,900 files: 7,128 courses each have
an `index.html`, an `index.txt` (Next's client navigation payload) and a `data/course/…json`, plus about 430 other
data files. Without `data/`, the build is about 14,300 files.

Pages read data through `dataUrl()` in `web/lib/format.ts`. The Cloudflare build sets `NEXT_PUBLIC_DATA_URL` to
GitHub Pages' `/data`, which sends `Access-Control-Allow-Origin: *`, so the browser can read it from another site.
Data and pages come from the same nightly run, and the Cloudflare deploy waits until GitHub Pages has deployed.
