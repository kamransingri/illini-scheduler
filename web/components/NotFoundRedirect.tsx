"use client";
import { useEffect } from "react";
import { basePath } from "@/lib/format";

/** /course/cs/124 -> /course/CS/124/ (course URLs are upper-case). */
export default function NotFoundRedirect() {
  useEffect(() => {
    const bp = basePath();
    const path = window.location.pathname.slice(bp.length);
    const m = /^\/course\/([A-Za-z]{2,5})\/(\d{3})\/?$/.exec(path);
    if (m && m[1] !== m[1].toUpperCase()) window.location.replace(`${bp}/course/${m[1].toUpperCase()}/${m[2]}/`);
  }, []);
  return null;
}
