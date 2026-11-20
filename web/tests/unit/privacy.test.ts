import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STORED } from "@/lib/privacy";

// The privacy page (#142) lists every browser storage key the site writes. This reads the code: each
// `setItem(<key>, ...)` call's key, either a string or a constant defined as one, has to be on the page, and every
// key on the page has to be written somewhere.
const ROOT = path.join(__dirname, "..", "..");
const DIRS = ["lib", "components", "app"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const files = DIRS.flatMap((d) => sources(path.join(ROOT, d))).map((p) => ({ p, text: readFileSync(p, "utf8") }));
const constant = (name: string, text: string) => new RegExp(`(?:export )?const ${name} = "([^"]+)"`).exec(text)?.[1];

function writtenKeys(): Map<string, string> {
  const out = new Map<string, string>(); // key -> file that writes it
  for (const { p, text } of files) {
    for (const m of text.matchAll(/\.setItem\(\s*("([^"]+)"|[A-Za-z_][A-Za-z0-9_]*)/g)) {
      const key = m[2] ?? constant(m[1], text) ?? files.map((f) => constant(m[1], f.text)).find(Boolean);
      expect(key, `${path.relative(ROOT, p)} writes ${m[1]}, which isn't a string this test can read`).toBeTruthy();
      out.set(key!, path.relative(ROOT, p));
    }
  }
  return out;
}

describe("the privacy page's list of what's stored", () => {
  it("lists every key the code writes, and nothing it doesn't", () => {
    const written = writtenKeys();
    const listed = new Set(STORED.map((s) => s.key));
    for (const [key, file] of written) expect(listed.has(key), `${file} writes "${key}": add it to STORED in lib/privacy.ts`).toBe(true);
    for (const key of listed) expect(written.has(key), `"${key}" is on the privacy page, but nothing writes it`).toBe(true);
    expect(written.size).toBe(STORED.length);
  });

  it("never uses sessionStorage or IndexedDB, which the page doesn't mention", () => {
    for (const { p, text } of files) expect(/sessionStorage|indexedDB/.test(text), path.relative(ROOT, p)).toBe(false);
  });
});
