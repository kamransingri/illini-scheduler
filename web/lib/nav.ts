import type { IconName } from "@/components/ui/Icon";

/** Every page, in two words, in the order a student uses them (site header and footer). */
export const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Course search", icon: "search" },
  { href: "/geneds/", label: "Gen-ed finder", icon: "layers" },
  { href: "/summer/", label: "Summer courses", icon: "sun" },
  { href: "/degree/", label: "Degree checklist", icon: "cap" },
  { href: "/opened/", label: "Just opened", icon: "bolt" },
  { href: "/schedule/", label: "Schedule builder", icon: "calendar" },
];
