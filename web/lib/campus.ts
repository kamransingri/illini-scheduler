// Small building -> campus-area lookup for "walking risk" (back-to-back classes in different areas).
// Areas are coarse on purpose: Engineering (north), Main Quad, South (ACES/Armory/Business), East (KCPA).

const AREAS: [string, string[]][] = [
  [
    "Engineering",
    [
      "siebel", "campus instructional facility", "digital computer", "engineering hall", "everitt", "electrical & computer",
      "electrical and computer", "grainger", "loomis", "talbot", "mechanical engr", "mechanical engineering", "sidney lu",
      "materials science", "newmark", "transportation", "beckman", "coordinated science", "supercomputing", "nuclear",
      "micro and nanotech", "micro & nano", "ceramics", "kenney", "civil eng", "hydrosystems", "engineering student",
    ],
  ],
  [
    "Main Quad",
    [
      "lincoln hall", "gregory hall", "english building", "davenport", "foreign languages", "literatures, cultures",
      "altgeld", "illini union", "noyes", "smith memorial", "david kinley", "henry admin", "coble", "main library",
      "psychology", "natural history", "burrill", "morrill", "chemical and life", "chemical & life", "roger adams",
      "chemistry annex", "harker", "education building", "school of social work", "medical sciences", "animal sciences lab",
      "levis", "loomis lab", "everitt lab",
    ],
  ],
  [
    "South",
    [
      "business instructional", "wohlers", "armory", "bevier", "aces library", "turner hall", "agricultural engr",
      "agricultural bioprocess", "animal sciences", "mumford", "huff", "freer", "flagg", "temple hoyne buell", "art and design",
      "music building", "smith music", "plant sciences", "edward r madigan", "madigan", "stock pavilion", "vet med",
      "veterinary", "library information science", "irwin", "intramural", "campus rec",
    ],
  ],
  ["East", ["krannert", "kcpa", "lincoln avenue", "allen hall", "busey", "speech & hearing", "speech and hearing"]],
];

export function areaOf(building: string): string {
  const b = (building || "").toLowerCase();
  if (!b) return "?";
  for (const [area, keys] of AREAS) if (keys.some((k) => b.includes(k))) return area;
  return "?";
}
