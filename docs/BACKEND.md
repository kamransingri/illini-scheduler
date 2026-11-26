# The backend

Illini Scheduler is a static site on GitHub Pages. What has to run on a server lives in [`api/`](../api/) and is
deployed as a Supabase Edge Function (#150). Today that's the public HTTP API (#157, #158), documented in
[API.md](API.md#http-api). The project doesn't use Cloudflare (#245).

**The API needs no database.** It reads the site's public JSON from GitHub Pages, which GitHub Actions rebuilds every
night, and answers with the MCP server's code: `mcp/src/schemas.ts` has the arguments and `mcp/src/answers.ts` the
answers. So the API, the MCP server and the site agree, and `api/test/api.test.ts` asks each endpoint and the
matching MCP tool the same question. Supabase is only where the code runs. Its database is for what students write
later: accounts (#151), push subscriptions (#91) and reviews (#128).

## The code

- `api/src/index.ts`: the routes, as one `fetch(request)` handler that only uses web standards (Request, Response,
  fetch), so it runs on Supabase (Deno) and in Node for the tests.
- `api/src/supabase.ts`: the Edge Function. Supabase puts the function's name in front of every path (`/api/v1/terms`)
  and sets `SUPABASE_URL`; `DATA_URL` (a function secret) points it at another copy of the data.
- `api/src/limit.ts`: 60 requests a minute per address, counted in each running instance's memory. Instances count
  separately, so it stops a script in a loop, not a determined caller.
- `npm run bundle` builds all of it, zod and `web/lib` included, into one file with no imports,
  `supabase/functions/api/bundle.js` (git ignores it). `supabase/functions/api/index.ts` serves that file, and
  `supabase/config.toml` makes the function public (`verify_jwt = false`).

## Running it

```sh
(cd mcp && npm ci)   # the API bundles mcp/src, which uses mcp's zod
cd api && npm ci
npm test             # Vitest on the MCP server's saved data (mcp/test/fixtures)
npm run dev          # the bundled function on http://localhost:8787/api/, reading the live site's data
```

Then try `http://localhost:8787/api/v1/courses?q=cs%20124` or `http://localhost:8787/api/v1/openapi.json`.
`DATA_URL=<url> npm run dev` reads another copy, such as a local `make data` export served over HTTP. `npm run dev`
runs the bundle in Node, so it needs neither Docker nor the Supabase CLI.

## Deploying

`.github/workflows/api.yml` runs the tests, bundles the function and loads the bundle on every pull request that
touches `api/`, `supabase/`, `mcp/src/` or `web/lib/`. On `main` it also deploys with
`supabase functions deploy api --no-verify-jwt`, then checks that `/health` and `/v1/terms` answer.

The deploy needs, once, from whoever owns the Supabase project (the same project as accounts, #149):

1. A Supabase project. Its reference is the `<ref>` in `https://<ref>.supabase.co`.
2. A personal access token (Supabase dashboard, Account, Access Tokens) as the Actions secret `SUPABASE_ACCESS_TOKEN`.
3. The project reference as the Actions variable `SUPABASE_PROJECT_REF` (Settings, Secrets and variables, Actions,
   Variables). The deploy job is skipped until it's set.

The API is then at `https://<ref>.supabase.co/functions/v1/api`, for example `.../functions/v1/api/v1/terms`.

## Limits

Supabase's free plan gives an Edge Function at most 2 s of CPU, 256 MB of memory and 150 s of wall-clock time per
request ([Edge Functions limits](https://supabase.com/docs/guides/functions/limits), read on 2026-11-25). Requests
that wait on the network, like reading the data, don't use CPU.

Measured on the 2026-11-25 data, once the files are in memory:

| Endpoint | CPU, typical |
| --- | --- |
| `/health`, `/v1/openapi.json` | under 1 ms |
| `/v1/terms`, `/v1/courses/{subject}/{number}` | 3 to 6 ms |
| `/v1/geneds` | about 13 ms |
| `/v1/courses?q=` | 30 to 50 ms |
| `POST /v1/schedules`, 5 courses | about 500 ms; up to about 1.5 s with 6 |

The first request in a new instance also parses the files it reads (`search.json` alone takes about 14 ms). All of it
fits under 2 s except, possibly, a schedule with close to the 10-course maximum; Supabase stops that request with an
error, and the caller can try fewer courses.

## Adding to it

- Put a new endpoint's arguments in `mcp/src/schemas.ts` and its answer in `mcp/src/answers.ts` when the MCP server
  should offer it too. Otherwise keep it in `api/src/`.
- Nothing behind a NetID login, ever, and nothing about the person asking is stored.
- Secrets the function needs go in Supabase with `supabase secrets set`, never in the repository.
