# Hosting the site on Cloudflare (free plan)

GitHub Pages stays the main host and keeps serving everything, data included. Cloudflare serves a second copy of the
site's pages, on the free Workers plan, with static assets only and no Worker script.

| | GitHub Pages | Cloudflare |
| --- | --- | --- |
| URL | `https://kamransingri.github.io/illini-scheduler/` | `https://illini-scheduler.<account>.workers.dev/` (or a custom domain) |
| Pages, scripts, `llms.txt`, `push.json` | Yes | Yes, at the root (no `/illini-scheduler` prefix) |
| `data/` (course JSON, degrees, search…) | Yes | No: pages fetch it from GitHub Pages |

## Why data stays on GitHub

Cloudflare's free plan allows 20,000 files per deploy. A full build is about 21,900 files: 7,128 courses each have
an `index.html`, an `index.txt` (Next's client navigation payload) and a `data/course/…json`, plus about 430 other
data files. Without `data/`, the build is about 14,300 files.

Pages read data through `dataUrl()` in `web/lib/format.ts`. The Cloudflare build sets `NEXT_PUBLIC_DATA_URL` to
GitHub Pages' `/data`, which sends `Access-Control-Allow-Origin: *`, so the browser can read it from another site.
Data and pages come from the same nightly run, and the Cloudflare deploy waits until GitHub Pages has deployed.

## Files

| File | What it does |
| --- | --- |
| `web/wrangler.jsonc` | The Worker's name, `out/` as its static assets, trailing-slash URLs, `404.html` for unknown paths |
| `web/scripts/cloudflare-build.mjs` | Checks every course has its data file, builds with `BASE_PATH=""` and `DATA_URL`, deletes `out/data/`, and fails if `out/` has more than 19,000 files (`CF_MAX_FILES`) |
| `.github/workflows/pages.yml` | After the GitHub Pages build: the Cloudflare build (step "Build for Cloudflare") and the `cloudflare` job that deploys it. Both are skipped until the `CLOUDFLARE_API_TOKEN` secret exists |

## First deploy from a laptop

You need the full data in `web/public/data` first (`make data`). The build stops if a course in `search.json` has no
course file, since its page would say "not found". For a quick try with `make data-quick`, set `PAGES_LIMIT`.

```sh
cd web
npx wrangler login       # opens the browser once
npm run cf:build         # PAGES_LIMIT=50 npm run cf:build for a quick try
npm run cf:deploy        # prints the workers.dev URL
```

## Nightly deploys from GitHub Actions

1. In the Cloudflare dashboard, go to **My Profile → API Tokens → Create Token** and use the **Edit Cloudflare
   Workers** template. Its account resources are your account.
2. Copy the **Account ID** from the dashboard's Workers & Pages overview.
3. In the repository, go to **Settings → Secrets and variables → Actions** and add the secrets `CLOUDFLARE_API_TOKEN`
   and `CLOUDFLARE_ACCOUNT_ID`.
4. Run **Refresh data and deploy to GitHub Pages** (Actions → Run workflow), or wait for the nightly run.

Removing the secret turns the Cloudflare steps off again. GitHub Pages doesn't depend on any of it.

## If the build goes over the cap

`cloudflare-build.mjs` fails before deploying, the `cloudflare` job is skipped, and GitHub Pages still deploys. The
next file to leave out would be the course pages' `index.txt` (about 7,100 files). Without them, links to course pages
do a full page load instead of a client-side navigation.
