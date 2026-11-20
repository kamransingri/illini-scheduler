"use client";
import { useState } from "react";
import { clearEverything } from "@/lib/privacy";
import Icon from "./ui/Icon";

/** The privacy page's "delete everything" (#142): two presses, so one stray click can't wipe a student's plans. */
export default function ClearData() {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const [count, setCount] = useState(0);
  if (step === "done")
    return (
      <p className="flex items-start gap-2" role="status" data-testid="cleared">
        <Icon name="check" className="mt-1 text-heading" />
        Done: {count ? `${count} saved item${count === 1 ? "" : "s"} deleted` : "nothing was saved in this browser"}, and seat alerts are off.
        Reload any open tab of this site so it forgets them too.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {step === "idle" ? (
        <button type="button" className="rounded border border-action bg-white px-3 py-1.5 font-semibold text-action hover:bg-action-tint" onClick={() => setStep("confirm")}>
          Delete everything this site saved in this browser
        </button>
      ) : (
        <>
          <span className="font-semibold">Your courses, plans, My courses, watched sections and settings will be gone.</span>
          <button
            type="button"
            className="rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark"
            onClick={async () => {
              setCount(await clearEverything());
              setStep("done");
            }}
          >
            Yes, delete it all
          </button>
          <button type="button" className="rounded px-3 py-1.5 font-semibold text-action underline" onClick={() => setStep("idle")}>
            Keep it
          </button>
        </>
      )}
    </div>
  );
}
