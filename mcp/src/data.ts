// Where the server reads Illini Scheduler's public JSON (docs/API.md): the live site by default, or a local folder
// (web/public/data after `make data`, or the test fixtures). Files are cached in memory; the site rebuilds nightly.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SITE_URL = "https://kamransingri.github.io/illini-scheduler";
const TTL_MS = 30 * 60 * 1000;

export class NotFound extends Error {}

export type DataSource = {
  /** the data folder or URL, for messages */
  root: string;
  /** the site the links in answers point to */
  site: string;
  read<T>(file: string): Promise<T>;
};

/** `root`: a URL (`https://.../data`) or a folder. ILLINI_SCHEDULER_DATA sets it; the live site is the default. */
export function dataSource(
  root: string = process.env.ILLINI_SCHEDULER_DATA || `${SITE_URL}/data`,
  { ttlMs = TTL_MS, fetchFn = fetch, now = Date.now }: { ttlMs?: number; fetchFn?: typeof fetch; now?: () => number } = {},
): DataSource {
  const remote = /^https?:\/\//.test(root);
  const base = root.replace(/\/+$/, "");
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  async function load(file: string): Promise<unknown> {
    if (!remote) {
      try {
        return JSON.parse(await readFile(path.join(base, file), "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFound(file);
        throw e;
      }
    }
    const url = `${base}/${file}`;
    const res = await fetchFn(url, { headers: { "User-Agent": "illini-scheduler-mcp" } });
    if (res.status === 404) throw new NotFound(file);
    if (!res.ok) throw new Error(`HTTP ${res.status} reading ${url}`);
    return res.json();
  }

  return {
    root: base,
    site: remote ? base.replace(/\/data$/, "") : SITE_URL,
    read<T>(file: string): Promise<T> {
      const hit = cache.get(file);
      if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
      const value = load(file);
      cache.set(file, { at: now(), value });
      value.catch(() => cache.delete(file)); // a failed read is retried next time
      return value as Promise<T>;
    },
  };
}
