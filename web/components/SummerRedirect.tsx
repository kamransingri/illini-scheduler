"use client";
import { useEffect } from "react";
import { basePath } from "@/lib/format";
import { summerRedirect } from "@/lib/summer";

/** /summer/?gened=HP&online=1 -> /geneds/?term=summer&gened=HP&online=1 (#124). */
export default function SummerRedirect() {
  useEffect(() => {
    window.location.replace(`${basePath()}${summerRedirect(window.location.search)}`);
  }, []);
  return null;
}
