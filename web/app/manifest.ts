import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Lets the site open from a phone's Home Screen as an app of its own. On iPhone and iPad that's the only way to get
// seat alerts with the site closed (Web Push, #90).
export default function manifest(): MetadataRoute.Manifest {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    name: "Illini Scheduler",
    short_name: "Illini Sched",
    description: "Unofficial UIUC course planner: professors, sections, gen-eds, a degree checklist and a schedule builder.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#13294b",
    icons: [{ src: `${base}/icon.svg`, sizes: "any", type: "image/svg+xml" }],
  };
}
