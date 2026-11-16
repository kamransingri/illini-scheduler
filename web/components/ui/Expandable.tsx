"use client";
import { useId, useState } from "react";
import Icon from "./Icon";

/** A button that shows and hides a panel (aria-expanded + aria-controls). Controlled when `open` is passed. */
export default function Expandable({
  summary,
  children,
  open: openProp,
  onToggle,
  defaultOpen = false,
  className = "",
  buttonClassName = "",
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOwn(!open);
          onToggle?.(!open);
        }}
        className={`inline-flex items-center gap-1.5 font-semibold text-action hover:underline ${buttonClassName}`}
      >
        <Icon name="chevronDown" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        {summary}
      </button>
      <div id={id} hidden={!open} className="mt-2">
        {open && children}
      </div>
    </div>
  );
}
