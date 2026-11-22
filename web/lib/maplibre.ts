"use client";
// MapLibre, set up once for every map on the site (#95 day maps, #96 drop a pin). Only modules loaded with
// next/dynamic import this, so MapLibre's code, CSS and worker load only when someone opens a map.
// Tiles: OpenFreeMap (free, no key), credited by the map itself (DECISIONS.md D48).

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export { maplibregl };

export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const CAMPUS_CENTER: [number, number] = [-88.2272, 40.1092]; // Illini Union, [lon, lat]

// MapLibre 6 finds its worker next to its own module, which the bundler moves; this makes the bundler copy the worker
// file into the build and gives MapLibre its address.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** The site's action colour (globals.css); MapLibre can't read CSS variables. */
export function actionColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-action").trim() || "#1d58a7";
}

/** A round pin with a number or letter, in the site's colours. Hidden from screen readers: a list says the same. */
export function pinElement(label: string, home = false): HTMLElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.setAttribute("aria-hidden", "true");
  el.className = `grid size-7 place-items-center rounded-full border-2 border-white text-sm font-bold shadow ${home ? "bg-navy text-white" : "bg-action text-white"}`;
  return el;
}

export function newMap(container: HTMLElement, center: [number, number], zoom: number): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center,
    zoom,
    attributionControl: { compact: true },
    cooperativeGestures: true, // a page scroll doesn't get stuck in the map
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}
