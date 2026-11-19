"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CartCount from "./CartCount";
import Logo from "./Logo";
import { NAV } from "@/lib/nav";
import Icon from "./ui/Icon";

function isCurrent(path: string, href: string): boolean {
  const p = path.endsWith("/") ? path : `${path}/`;
  if (href === "/") return p === "/" || p.startsWith("/course/");
  return p.startsWith(href);
}

export default function SiteNav() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const item = (n: (typeof NAV)[number], mobile: boolean) => {
    const cur = isCurrent(path, n.href);
    return (
      <Link
        href={n.href}
        aria-current={cur ? "page" : undefined}
        className={
          mobile
            ? `flex items-center gap-3 px-4 py-3 ${cur ? "bg-white/10 font-semibold shadow-[inset_4px_0_0_var(--color-orange)]" : "hover:bg-white/5"}`
            : `flex h-full items-center gap-2 px-3 whitespace-nowrap xl:px-4 ${cur ? "bg-white/10 font-semibold shadow-[inset_0_-4px_0_var(--color-orange)]" : "hover:bg-white/5 hover:underline"}`
        }
      >
        {/* five labels fit a 1024px header with their icons (DECISIONS D39.3) */}
        <Icon name={n.icon} className={cur ? "text-white" : "text-white/70"} />
        {n.label}
        {n.href === "/schedule/" && <CartCount />}
      </Link>
    );
  };

  return (
    <header className="border-b-4 border-orange bg-navy text-white">
      <div className="mx-auto flex max-w-6xl items-stretch justify-between px-4">
        <Link href="/" className="flex items-center py-3 no-underline" aria-label="Illini Scheduler, home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex h-full divide-x divide-white/25 border-x border-white/25">
            {NAV.map((n) => (
              <li key={n.href}>{item(n, false)}</li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="my-2 inline-flex items-center gap-2 rounded border border-white/40 px-3 font-semibold hover:bg-white/10 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "x" : "rows"} />
          Menu
          <CartCount />
        </button>
      </div>
      <nav id="mobile-nav" aria-label="Main" hidden={!open} className="border-t border-white/25 lg:hidden">
        <ul className="mx-auto max-w-6xl divide-y divide-white/20">
          {NAV.map((n) => (
            <li key={n.href}>{item(n, true)}</li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
