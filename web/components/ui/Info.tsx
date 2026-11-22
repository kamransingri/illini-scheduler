"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";

/**
 * An (i) button that shows where a number comes from: source, term range, sample size, method.
 * Opens on hover, keyboard focus and tap (phones have no hover); Escape or a click elsewhere closes it.
 * The text is also tied to the button with aria-describedby so screen readers announce it.
 */
export default function Info({ children, label = "Source and details", className = "" }: { children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [offset, setOffset] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), setPinned(false));
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Keep the panel inside the viewport (16px gutter), whatever side of the screen the button is on.
  useLayoutEffect(() => {
    if (!open || !wrap.current || !panel.current) return;
    const r = wrap.current.getBoundingClientRect();
    const w = panel.current.offsetWidth;
    const left = Math.min(Math.max(r.left - 8, 16), window.innerWidth - 16 - w);
    setOffset(left - r.left);
  }, [open]);

  return (
    <span
      ref={wrap}
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
      onFocus={() => setOpen(true)}
      // stays open while focus moves to a link inside the panel
      onBlur={(e) => !pinned && !wrap.current?.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex size-6 items-center justify-center rounded text-muted hover:text-action focus-visible:text-action"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          setPinned(!open || !pinned);
          setOpen(!(open && pinned));
        }}
      >
        <Icon name="info" />
      </button>
      <span
        ref={panel}
        id={id}
        role="tooltip"
        style={open ? { left: offset } : undefined}
        className={
          open
            ? "absolute top-full z-40 mt-1 block w-max max-w-[min(20rem,calc(100vw-2rem))] rounded bg-ink px-3 py-2 text-left text-sm font-normal leading-snug text-white shadow-lg"
            : "sr-only"
        }
      >
        {children}
      </span>
    </span>
  );
}
