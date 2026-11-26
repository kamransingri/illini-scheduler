// Reading Illini Scheduler's public JSON (docs/API.md) with a small in-memory cache. Nothing here imports Node, so the
// HTTP API's Worker (api/) reads the data the same way the MCP server does. data.ts adds reading a local folder.

export const SITE_URL = "https://kamransingri.github.io/illini-scheduler";
export const TTL_MS = 30 * 60 * 1000;

export class NotFound extends Error {}

export type DataSource = {
  /** the data folder or URL, for messages */
  root: string;
  /** the site the links in answers point to */
  site: string;
  read<T>(file: string): Promise<T>;
};

export type CacheOptions = { ttlMs?: number; now?: () => number };

/** Each file is read once per `ttlMs` (the site rebuilds nightly). A failed read isn't cached, so it's retried. */
export function cachedSource(root: string, site: string, load: (file: string) => Promise<unknown>, { ttlMs = TTL_MS, now = Date.now }: CacheOptions = {}): DataSource {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();
  return {
    root,
    site,
    read<T>(file: string): Promise<T> {
      const hit = cache.get(file);
      if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
      const value = load(file);
      cache.set(file, { at: now(), value });
      value.catch(() => cache.delete(file));
      return value as Promise<T>;
    },
  };
}

/** The data under a URL such as `https://kamransingri.github.io/illini-scheduler/data`. */
export function remoteSource(
  root: string,
  { fetchFn = fetch, userAgent = "illini-scheduler-mcp", ...cache }: CacheOptions & { fetchFn?: typeof fetch; userAgent?: string } = {},
): DataSource {
  const base = root.replace(/\/+$/, "");
  return cachedSource(
    base,
    base.replace(/\/data$/, ""),
    async (file) => {
      const url = `${base}/${file}`;
      const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
      if (res.status === 404) throw new NotFound(file);
      if (!res.ok) throw new Error(`HTTP ${res.status} reading ${url}`);
      return res.json();
    },
    cache,
  );
}
