"use client";
import { useEffect } from "react";
import { basePath, dataUrl } from "@/lib/format";

/**
 * /course/cs/124 -> /course/CS/124/ (course URLs are upper-case), and a renumbered course's old URL -> its page
 * (/course/SPAN/200/ -> /course/SPAN/210/, from data/renumbered.json, #29).
 */
export default function NotFoundRedirect() {
  useEffect(() => {
    const bp = basePath();
    const path = window.location.pathname.slice(bp.length);
    const m = /^\/course\/([A-Za-z]{2,5})\/(\d{3})\/?$/.exec(path);
    if (!m) return;
    const subject = m[1].toUpperCase();
    const go = (s: string, n: string) => window.location.replace(`${bp}/course/${s}/${n}/`);
    const renumbered: Promise<Record<string, string>> = fetch(dataUrl("renumbered.json"))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    renumbered.then((map) => {
      const to = map[`${subject} ${m[2]}`];
      if (to) go(...(to.split(" ") as [string, string]));
      else if (m[1] !== subject) go(subject, m[2]);
    });
  }, []);
  return null;
}
