"use client";
// About you (#80): level and standing saved in this browser, major and minor from the degree checklist
// (lib/mycourses.ts). Shared by the schedule builder and course pages; nothing leaves the browser.
import { useEffect, useMemo, useState } from "react";
import type { DegreeIndex } from "./degree";
import { dataUrl } from "./format";
import { onMineChange, readMine } from "./mycourses";
import { NOBODY, readAboutYou, writeAboutYou, type AboutYou } from "./restrictions";

type LevelStanding = Pick<AboutYou, "level" | "standing">;

let indexPromise: Promise<DegreeIndex> | null = null;
const loadIndex = () =>
  (indexPromise ??= fetch(dataUrl("degrees/index.json"))
    .then((r) => (r.ok ? (r.json() as Promise<DegreeIndex>) : []))
    .catch(() => []));

export function useAboutYou(): { me: AboutYou; about: LevelStanding; setAbout: (k: keyof LevelStanding, v: string) => void } {
  const [about, setAboutState] = useState<LevelStanding>({ level: "", standing: "" });
  const [mine, setMine] = useState({ program: "", minor: "" });
  const [programs, setPrograms] = useState<DegreeIndex | null>(null);
  useEffect(() => {
    setAboutState(readAboutYou());
    const read = () => {
      const m = readMine();
      setMine({ program: m.program, minor: m.minor });
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("about-you")) setAboutState(readAboutYou());
    };
    window.addEventListener("storage", onStorage);
    const off = onMineChange(read);
    return () => {
      off();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if ((mine.program || mine.minor) && !programs) loadIndex().then(setPrograms);
  }, [mine.program, mine.minor, programs]);
  const me = useMemo<AboutYou>(() => {
    const prog = programs?.find((p) => p.id === mine.program);
    const minor = programs?.find((p) => p.id === mine.minor);
    return { ...NOBODY, ...about, program: prog ? { name: prog.program, college: prog.college } : null, minor: minor ? { name: minor.program } : null };
  }, [about, mine, programs]);
  const setAbout = (k: keyof LevelStanding, v: string) =>
    setAboutState((a) => {
      const next = { ...a, [k]: v } as LevelStanding;
      writeAboutYou(next);
      return next;
    });
  return { me, about, setAbout };
}
