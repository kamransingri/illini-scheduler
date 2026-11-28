"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CartCount from "./CartCount";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import { NAV } from "@/lib/nav";
import Icon from "./ui/Icon";

function isCurrent(path: string, href: string): boolean {
  const p = path.endsWith("/") ? path : `${path}/`;
  if (href === "/") return p === "/" || p.startsWith("/course/");
  return p.startsWith(href);
}

type Panel = "menu" | "search" | null;

/** Typing in a field, a select or an editable area: the "/" shortcut leaves those alone. */
const typing = (el: Element | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);

/**
 * The site header: logo, the three main pages, and a search that works from every page (the header critique, Nov 2026).
 * It stays reachable on long pages: it slides away while you scroll down and comes back as soon as you scroll up, and
 * it publishes its visible height as `--site-header` so sticky bars below it (the course page's "On this page") sit
 * underneath instead of being covered. Escape or a tap outside closes the menu or the search and returns focus to the
 * button that opened it; "/" opens the search from anywhere that isn't a text field.
 */
export default function SiteNav({ nextTerm, winter = false }: { nextTerm: string; winter?: boolean }) {
  const path = usePathname() ?? "/";
  const home = path === "/";
  const [panel, setPanel] = useState<Panel>(null);
  const [hidden, setHidden] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const searchBtn = useRef<HTMLButtonElement>(null);
  const deskSearchBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setPanel(null), [path]);

  const close = (refocus: boolean) => {
    const was = panel;
    setPanel(null);
    if (!refocus) return;
    const desk = deskSearchBtn.current?.offsetParent ? deskSearchBtn.current : null;
    (was === "menu" ? menuBtn.current : (desk ?? searchBtn.current))?.focus();
  };

  // Escape, a tap outside, and the "/" shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panel) {
        e.preventDefault();
        close(true);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(document.activeElement)) {
        e.preventDefault();
        setHidden(false);
        if (home) document.getElementById("q")?.focus();
        else setPanel("search");
      }
    };
    const onDown = (e: PointerEvent) => {
      if (panel && header.current && !header.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, home]);

  // Hide while scrolling down, show on any scroll up (and near the top, and whenever a panel is open)
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 120) setHidden(false);
      else if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const away = hidden && !panel;

  // Tell sticky bars below how much of the screen the header covers right now
  useEffect(() => {
    const root = document.documentElement;
    const set = () => root.style.setProperty("--site-header", away || !header.current ? "0px" : `${header.current.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    if (header.current) ro.observe(header.current);
    return () => ro.disconnect();
  }, [away, panel]);

  const item = (n: (typeof NAV)[number], mobile: boolean) => {
    const cur = isCurrent(path, n.href);
    return (
      <Link
        href={n.href}
        aria-current={cur ? "page" : undefined}
        className={
          mobile
            ? `flex min-h-12 items-center gap-3 px-4 py-3 ${cur ? "bg-white/10 font-semibold shadow-[inset_4px_0_0_var(--color-orange)]" : "hover:bg-white/5"}`
            : `flex h-full items-center gap-2 px-3 whitespace-nowrap xl:px-4 ${cur ? "bg-white/10 font-semibold shadow-[inset_0_-4px_0_var(--color-orange)]" : "hover:bg-white/5 hover:underline"}`
        }
      >
        <Icon name={n.icon} className={cur ? "text-white" : "text-white/70"} />
        {n.label}
        {n.href === "/schedule/" && <CartCount />}
      </Link>
    );
  };

  const toggle = (p: Exclude<Panel, null>) => setPanel((v) => (v === p ? null : p));
  const btn = "inline-flex min-h-11 items-center gap-2 rounded border border-white/40 px-3 font-semibold hover:bg-white/10";

  return (
    <header
      ref={header}
      className={`site-header sticky top-0 z-40 border-b-4 border-orange bg-navy text-white transition-transform duration-200 ease-out motion-reduce:transition-none ${away ? "-translate-y-full" : ""}`}
      onFocusCapture={() => setHidden(false)}
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-between gap-2 px-4">
        <Link href="/" className="flex items-center py-3 no-underline" aria-label="Illini Scheduler, home">
          <Logo />
        </Link>
        <div className="hidden items-stretch lg:flex">
          <nav aria-label="Main">
            <ul className="flex h-full divide-x divide-white/25 border-x border-white/25">
              {NAV.map((n) => (
                <li key={n.href}>{item(n, false)}</li>
              ))}
            </ul>
          </nav>
          {/* a cell at the end of the tab strip, not a boxed button beside it; "/" still opens it, without a hint (D66) */}
          {!home && (
            <button
              ref={deskSearchBtn}
              type="button"
              className={`flex h-full items-center gap-2 border-r border-white/25 px-3 whitespace-nowrap xl:px-4 ${panel === "search" ? "bg-white/10 font-semibold shadow-[inset_0_-4px_0_var(--color-orange)]" : "hover:bg-white/5 hover:underline"}`}
              aria-expanded={panel === "search"}
              aria-controls="site-search"
              aria-keyshortcuts="/"
              onClick={() => toggle("search")}
            >
              <Icon name={panel === "search" ? "x" : "search"} className={panel === "search" ? "text-white" : "text-white/70"} />
              <span className="sr-only xl:not-sr-only">Search</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          {!home && (
            <button
              ref={searchBtn}
              type="button"
              className={`${btn} min-w-11 justify-center px-0`}
              aria-expanded={panel === "search"}
              aria-controls="site-search"
              onClick={() => toggle("search")}
            >
              <Icon name={panel === "search" ? "x" : "search"} />
              <span className="sr-only">Search</span>
            </button>
          )}
          <button ref={menuBtn} type="button" className={btn} aria-expanded={panel === "menu"} aria-controls="mobile-nav" onClick={() => toggle("menu")}>
            <Icon name={panel === "menu" ? "x" : "rows"} />
            Menu
            <CartCount withIcon />
          </button>
        </div>
      </div>
      <nav id="mobile-nav" aria-label="Main" hidden={panel !== "menu"} className="border-t border-white/25 lg:hidden">
        <ul className="mx-auto max-w-6xl divide-y divide-white/20">
          {NAV.map((n) => (
            <li key={n.href}>{item(n, true)}</li>
          ))}
        </ul>
      </nav>
      {!home && (
        <div id="site-search" role="search" aria-label="Search the site" hidden={panel !== "search"} className="border-t border-white/25 bg-panel text-ink">
          <div className="mx-auto max-w-3xl px-4 py-3">
            {panel === "search" && <SearchBox nextTerm={nextTerm} winter={winter} id="site-search-q" compact autoFocus />}
          </div>
        </div>
      )}
    </header>
  );
}
