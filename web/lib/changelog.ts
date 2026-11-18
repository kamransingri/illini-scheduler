// CHANGELOG.md as data, for the Versions page (read at build time by lib/data.ts getReleases).
// The file follows Keep a Changelog; tools/release.py writes the version headings.

export type ReleaseGroup = { title: string; items: string[] };
/** One `## [version] - date` section; "Unreleased" has no date. */
export type Release = { version: string; date: string | null; groups: ReleaseGroup[] };

const HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;
const LINK_REF = /^\[[^\]]+\]: https?:\/\//;

/** Releases newest first (the file's order), each with its "Added" / "Changed" / "Fixed"... bullet lists. */
export function parseChangelog(text: string): Release[] {
  const out: Release[] = [];
  let rel: Release | null = null;
  let group: ReleaseGroup | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (LINK_REF.test(line)) break; // the compare links at the end
    const h = HEADING.exec(line);
    if (h) {
      rel = { version: h[1], date: h[2] ?? null, groups: [] };
      out.push(rel);
      group = null;
      continue;
    }
    if (!rel) continue; // the intro above the first version
    const g = /^### (.+)$/.exec(line);
    if (g) {
      group = { title: g[1].trim(), items: [] };
      rel.groups.push(group);
    } else if (line.startsWith("- ")) {
      if (!group) rel.groups.push((group = { title: "", items: [] }));
      group.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line) && group?.items.length) {
      group.items[group.items.length - 1] += ` ${line.trim()}`; // a bullet's wrapped lines
    }
  }
  for (const r of out) r.groups = r.groups.filter((x) => x.items.length);
  return out.filter((r) => r.groups.length);
}

export type Inline = { kind: "text" | "code" | "strong" | "issue"; text: string } | { kind: "link"; text: string; href: string };

const TOKEN = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![\w/&])#(\d+)\b/g;

/** The little Markdown a changelog line uses: `code`, **bold**, [links](https://...) and #123 issue numbers. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "strong", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "link", text: m[3], href: m[4] });
    else out.push({ kind: "issue", text: m[5] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}
