"use client";
import { useState } from "react";

export default function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`rounded border border-line px-1.5 py-0.5 font-mono text-xs hover:bg-panel ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      aria-label={`Copy ${label ?? text}`}
    >
      {done ? "Copied" : (label ?? text)}
    </button>
  );
}
