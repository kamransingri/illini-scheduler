import { describe, expect, it, vi } from "vitest";
import { cisUrl, dataUrl, daysStr, fmtDate, fmtDelta, fmtGpa, fmtTime, gpaRelease, rmpRateUrl, termLabel, termOrder, treLabel } from "@/lib/format";
import { decodeCart, encodeCart } from "@/lib/cart";

describe("format", () => {
  it("data URLs: this site's /data, or NEXT_PUBLIC_DATA_URL on the Cloudflare build", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/illini-scheduler");
    expect(dataUrl("course/CS/124.json")).toBe("/illini-scheduler/data/course/CS/124.json");
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", "https://kamransingri.github.io/illini-scheduler/data");
    expect(dataUrl("meta.json")).toBe("https://kamransingri.github.io/illini-scheduler/data/meta.json");
    vi.unstubAllEnvs();
  });
  it("RMP rating link: RMP's add-a-rating page for a numeric id, else the profile", () => {
    const url = "https://www.ratemyprofessors.com/professor/209729";
    expect(rmpRateUrl({ id: "209729", url })).toBe("https://www.ratemyprofessors.com/add/professor-rating/209729");
    expect(rmpRateUrl({ id: "VGVhY2hlci0yMDk3Mjk=", url })).toBe(url);
    expect(rmpRateUrl({ id: "", url })).toBe(url);
  });
  it("terms", () => {
    expect(termLabel("2027-sp")).toBe("Spring 2027");
    expect(termOrder("2026-fa")).toBeGreaterThan(termOrder("2026-sp"));
    expect(treLabel("2024-fa Excellent")).toBe("Fall 2024, Excellent");
    expect(treLabel("2022-sp Outstanding")).toBe("Spring 2022, Outstanding");
    expect(treLabel("something else")).toBe("something else");
    expect(fmtDate("2026-11-16")).toBe("Nov 16, 2026"); // a calendar day stays that day
    expect(fmtDate("2026-11-16T03:00:00+00:00")).toBe("Nov 15, 2026"); // a timestamp is shown in Chicago time
  });
  it("times and days", () => {
    expect(fmtTime(540)).toBe("9:00am");
    expect(fmtTime(780)).toBe("1:00pm");
    expect(fmtTime(720)).toBe("12:00pm");
    expect(daysStr(21)).toBe("MWF");
  });
  it("numbers never show NaN", () => {
    expect(fmtGpa(null)).toBe("–");
    expect(fmtGpa(NaN)).toBe("–");
    expect(fmtDelta(0.001)).toBe("±0.00");
    expect(fmtDelta(-0.13)).toBe("−0.13");
  });
  it("course explorer links", () => {
    expect(cisUrl("2027-sp", "CS", "124", "71571")).toBe("https://courses.illinois.edu/schedule/2027/spring/CS/124?sectionId=71571");
  });
  it("cart round trip", () => {
    const items = [
      { s: "CS", n: "124", locked: [] },
      { s: "MATH", n: "231", locked: ["12345"] },
    ];
    expect(decodeCart(encodeCart(items))).toEqual(items);
    expect(decodeCart("cs124,junk,CS124")).toEqual([{ s: "CS", n: "124", locked: [] }]);
  });
});

import { hasPrefParams, prefsFromParams, prefsToParams } from "@/lib/prefs";
import { DEFAULT_PREFS } from "@/lib/schedule";

describe("prefs in the URL", () => {
  it("round trip", () => {
    const p = {
      ...DEFAULT_PREFS,
      earliest: 540,
      latest: 1080,
      daysOff: 17,
      lunch: true,
      lunchFrom: 690,
      lunchTo: 810,
      lunchMin: 60,
      openOnly: true,
      includeSpecial: true,
      softEarly: 540,
      softLate: 960,
      blocked: [{ d: 10, s: 900, e: 1080 }],
      weights: { ...DEFAULT_PREFS.weights, gpa: 3, walking: 0, late: 2, open: 3 },
    };
    const params = new URLSearchParams();
    prefsToParams(p, params);
    expect(hasPrefParams(params)).toBe(true);
    expect(prefsFromParams(params)).toEqual(p);
  });
  it("a lunch window too short for its own break falls back to 11am-2pm, 45 minutes (#56)", () => {
    const p = prefsFromParams(new URLSearchParams("lu=1&lf=720&lt=750&lm=60"));
    expect([p.lunch, p.lunchFrom, p.lunchTo, p.lunchMin]).toEqual([true, 660, 840, 45]);
    expect(prefsFromParams(new URLSearchParams("lm=60")).lunchMin).toBe(60);
  });
  it("links from before v0.4.0 still open: nf=1 is Friday off, 6-digit weights keep the new ones at default", () => {
    const p = prefsFromParams(new URLSearchParams("nf=1&w=300000"));
    expect(p.daysOff).toBe(16);
    expect(p.weights).toEqual({ ...DEFAULT_PREFS.weights, gpa: 3, rmp: 0, early: 0, daysOff: 0, compact: 0, walking: 0 });
  });
  it("8-digit weights from before Best professor keep its default; 9 digits carry it (#49)", () => {
    expect(prefsFromParams(new URLSearchParams("w=30000000")).weights).toEqual({ ...DEFAULT_PREFS.weights, gpa: 3, rmp: 0, early: 0, daysOff: 0, compact: 0, walking: 0, late: 0, open: 0 });
    const p = { ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights, prof: 0 } };
    const params = new URLSearchParams();
    prefsToParams(p, params);
    expect(params.get("w")).toMatch(/^\d{9}$/);
    expect(prefsFromParams(params).weights.prof).toBe(0);
    expect(prefsFromParams(new URLSearchParams("w=3000000009")).weights).toEqual(DEFAULT_PREFS.weights); // 10 digits: ignored
  });
  it("defaults add nothing", () => {
    const params = new URLSearchParams();
    prefsToParams(DEFAULT_PREFS, params);
    expect(params.toString()).toBe("");
  });
});

import { fmtAgo, seatVerb } from "@/lib/format";

describe("seat history helpers", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("fmtAgo", () => {
    expect(fmtAgo("2026-11-05T01:00:00Z", now)).toBe("today");
    expect(fmtAgo("2026-11-04T06:00:00Z", now)).toBe("yesterday");
    expect(fmtAgo("2026-11-02T12:00:00Z", now)).toBe("3 days ago");
    expect(fmtAgo("", now)).toBe("");
  });
  it("seatVerb", () => {
    expect(seatVerb("Closed", "Open")).toBe("opened");
    expect(seatVerb("Closed", "CrossListOpen (Restricted)")).toBe("opened");
    expect(seatVerb("Open", "Closed")).toBe("closed");
    expect(seatVerb("Open", "Open (Restricted)")).toBe("changed");
  });
});

it("gpaRelease names FOIA before Spring 2025 and EP.25.072 from then (#193)", () => {
  expect(gpaRelease("2021-fa", "2024-fa")).toBe("released through FOIA requests");
  expect(gpaRelease("2025-sp", "2026-sp")).toBe("released under Senate item EP.25.072");
  expect(gpaRelease("2022-fa", "2026-sp")).toContain("FOIA requests before Spring 2025 and under Senate item EP.25.072");
});
