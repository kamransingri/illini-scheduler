"use client";
// The student's "best pick" weights live in localStorage (like the cart), shared by every page that ranks things.
import { useEffect, useState } from "react";
import { DEFAULT_WEIGHTS, type ScoreWeights } from "./score";

const KEY = "illini-score-weights";
const EVENT = "illini-weights-change";
const MAX = 3;

export function readWeights(): ScoreWeights {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ScoreWeights> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_WEIGHTS;
    const out = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(out) as (keyof ScoreWeights)[]) {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) out[k] = Math.min(MAX, Math.max(0, Math.round(v)));
    }
    return out;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function writeWeights(w: ScoreWeights): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* private mode: weights just don't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Current weights; defaults during server rendering and until localStorage has been read. */
export function useWeights(): ScoreWeights {
  const [w, setW] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  useEffect(() => {
    const sync = () => setW(readWeights());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return w;
}
