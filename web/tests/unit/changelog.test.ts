import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChangelog, parseInline } from "@/lib/changelog";
import pkg from "../../package.json";

const SAMPLE = `# Changelog

Intro with a [link](https://example.com).

## [Unreleased]

## [1.1.0] - 2026-11-17

### Added

- One line.
- A line that wraps
  onto the next one.

### Fixed

- Fixed \`x\`.

## [1.0.0] - 2026-11-01

### Added

- First.

[Unreleased]: https://github.com/o/r/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/o/r/compare/v1.0.0...v1.1.0
`;

describe("CHANGELOG.md for the Versions page", () => {
  it("reads versions, dates, groups and wrapped bullets; an empty Unreleased is left out", () => {
    expect(parseChangelog(SAMPLE)).toEqual([
      { version: "1.1.0", date: "2026-11-17", groups: [{ title: "Added", items: ["One line.", "A line that wraps onto the next one."] }, { title: "Fixed", items: ["Fixed `x`."] }] },
      { version: "1.0.0", date: "2026-11-01", groups: [{ title: "Added", items: ["First."] }] },
    ]);
    expect(parseChangelog(SAMPLE.replace(/\n/g, "\r\n"))).toEqual(parseChangelog(SAMPLE));
  });
  it("the repo's own CHANGELOG.md has the site's version, dated, with notes", () => {
    const rels = parseChangelog(fs.readFileSync(path.join(__dirname, "../../../CHANGELOG.md"), "utf8"));
    const cur = rels.find((r) => r.version === pkg.version);
    expect(cur?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cur?.groups.flatMap((g) => g.items).length).toBeGreaterThan(0);
    expect(rels.filter((r) => r.version !== "Unreleased").every((r) => r.date)).toBe(true);
  });
  it("inline Markdown: code, bold, links and issue numbers, and nothing else", () => {
    expect(parseInline("See `fit=1`, **new**, [docs](https://x.org/a) and #30.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "code", text: "fit=1" },
      { kind: "text", text: ", " },
      { kind: "strong", text: "new" },
      { kind: "text", text: ", " },
      { kind: "link", text: "docs", href: "https://x.org/a" },
      { kind: "text", text: " and " },
      { kind: "issue", text: "30" },
      { kind: "text", text: "." },
    ]);
    expect(parseInline("a/#3 and [x](javascript:alert(1))")).toEqual([{ kind: "text", text: "a/#3 and [x](javascript:alert(1))" }]);
  });
});
