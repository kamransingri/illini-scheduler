"use client";
import { useEffect, useRef } from "react";

/** A short notice that goes away on its own (DESIGN.md Part 5, "one banner at a time"). Hovering or focusing it holds it. */
export default function Toast({ children, onDone, ms = 6000 }: { children: React.ReactNode; onDone: () => void; ms?: number }) {
  const done = useRef(onDone);
  done.current = onDone;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => done.current(), ms);
  };
  const hold = () => clearTimeout(timer.current);
  useEffect(() => {
    start();
    return hold;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded bg-navy px-4 py-3 text-white shadow-lg"
      onMouseEnter={hold}
      onMouseLeave={start}
      onFocus={hold}
      onBlur={start}
      data-testid="toast"
    >
      {children}
    </div>
  );
}
