import type { IconName } from "@/components/ui/Icon";

/** The main pages, in two words, in the order a student uses them (site header). Summer classes are in the gen-ed
 * finder, course pages and search, not a page of their own (#121). Just opened is back in the header (redesign, after
 * the header critique): it's the page students need most during registration, often on a phone. */
export const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Course search", icon: "search" },
  { href: "/geneds/", label: "Gen-ed finder", icon: "layers" },
  { href: "/degree/", label: "Degree checklist", icon: "cap" },
  { href: "/schedule/", label: "Schedule builder", icon: "calendar" },
  { href: "/opened/", label: "Just opened", icon: "bolt" },
];

/** The footer's link groups. External links start with https. */
export const FOOTER: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Plan",
    links: NAV.map(({ href, label }) => ({ href, label })),
  },
  {
    title: "More",
    links: [
      { href: "/ai/", label: "Use it from your AI app" },
      { href: "/data-sources/", label: "Data sources" },
      { href: "/versions/", label: "What's new" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/privacy/", label: "Privacy" },
      { href: "/terms/", label: "Terms of use" },
      // the AI use policy is a doc in the repository (#144), so contributors and students read the same text
      { href: "https://github.com/kamransingri/illini-scheduler/blob/main/docs/AI-USE.md", label: "AI use policy" },
    ],
  },
];
