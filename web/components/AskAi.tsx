"use client";
// "Ask your AI" (#103): shows exactly the text that will be copied, so the student can paste it into any AI app.
// Nothing is sent anywhere by the site.

import Link from "next/link";
import { useId, useState } from "react";
import CopyButton from "./CopyButton";
import Icon from "./ui/Icon";

export default function AskAi({ text, what }: { text: string; what: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div data-testid="ask-ai">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 font-semibold leading-9 hover:border-action hover:text-action"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "chevronUp" : "chevronDown"} />
        Ask your AI
      </button>
      {open && (
        <div id={id} className="mt-2 max-w-3xl space-y-2 rounded border border-line p-3">
          <p className="text-sm">
            Copy this summary of {what} and paste it into ChatGPT, Claude or any AI app. This is exactly what gets copied; the site doesn&rsquo;t send it
            anywhere.
          </p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel p-2 text-sm" data-testid="ask-ai-text">
            {text}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={text} label="summary" className="!px-3 !leading-9" />
            <span className="text-sm text-muted">
              Want your AI to look things up itself?{" "}
              <Link href="/ai/" className="text-action underline">
                Connect it to Illini Scheduler
              </Link>
              .
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
