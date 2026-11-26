// Where the server reads Illini Scheduler's public JSON (docs/API.md): the live site by default, or a local folder
// (web/public/data after `make data`, or the test fixtures). Files are cached in memory; the site rebuilds nightly.
// The cache and the remote reader are in source.ts, which the HTTP API (api/) shares; this file adds local folders.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cachedSource, NotFound, remoteSource, SITE_URL, TTL_MS, type DataSource } from "./source";

export { NotFound, SITE_URL, type DataSource } from "./source";

/** `root`: a URL (`https://.../data`) or a folder. ILLINI_SCHEDULER_DATA sets it; the live site is the default. */
export function dataSource(
  root: string = process.env.ILLINI_SCHEDULER_DATA || `${SITE_URL}/data`,
  { ttlMs = TTL_MS, fetchFn = fetch, now = Date.now }: { ttlMs?: number; fetchFn?: typeof fetch; now?: () => number } = {},
): DataSource {
  if (/^https?:\/\//.test(root)) return remoteSource(root, { ttlMs, fetchFn, now });
  const base = root.replace(/\/+$/, "");
  return cachedSource(
    base,
    SITE_URL,
    async (file) => {
      try {
        return JSON.parse(await readFile(path.join(base, file), "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFound(file);
        throw e;
      }
    },
    { ttlMs, now },
  );
}
