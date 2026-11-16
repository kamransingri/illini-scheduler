"use client";
import { useState } from "react";
import Icon from "./ui/Icon";

/** Copies text (a CRN) to the clipboard; the label stays the value so the column still reads as data. */
export default function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded border border-line bg-white px-1.5 leading-7 font-semibold tnum text-ink hover:border-action hover:text-action ${className}`}
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
      <Icon name={done ? "check" : "copy"} className={done ? "text-action" : "text-muted"} />
    </button>
  );
}
