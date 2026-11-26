/**
 * At most `limit` requests per `periodMs` from each address, counted in this instance's memory. Every running instance
 * counts on its own, so it's a guard against a script calling in a loop, not an exact quota. At `maxKeys` addresses
 * the expired ones are dropped first, then all of them.
 */
export function memoryLimiter(limit = 60, periodMs = 60_000, now: () => number = Date.now, maxKeys = 10_000): (key: string) => boolean {
  const seen = new Map<string, { start: number; n: number }>();
  return (key) => {
    const t = now();
    let e = seen.get(key);
    if (!e || t - e.start >= periodMs) {
      if (!e && seen.size >= maxKeys) {
        for (const [k, v] of seen) if (t - v.start >= periodMs) seen.delete(k);
        if (seen.size >= maxKeys) seen.clear();
      }
      e = { start: t, n: 0 };
      seen.set(key, e);
    }
    e.n += 1;
    return e.n <= limit;
  };
}
