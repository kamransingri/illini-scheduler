"use client";
// The MapLibre part of a day's map (#95). Loaded with next/dynamic only when someone opens a map, so MapLibre's code
// and styles never load on a page where no map is opened. Tiles: OpenFreeMap (free, no key), credited on the map.

import { useEffect, useRef, useState } from "react";
import type { MapStop, Place } from "@/lib/commute";
import { actionColor, maplibregl, newMap, pinElement as pin } from "@/lib/maplibre";

/** `route`: a bus line to draw instead of the walk between stops, from its boarding stop ("B") on (#216). */
export default function DayMapCanvas({
  stops,
  home,
  label,
  route,
}: {
  stops: MapStop[];
  home: Place | null;
  label: string;
  route?: { path: [number, number][]; color: string };
}) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!box.current || !stops.length) return;
    let map: maplibregl.Map;
    try {
      map = newMap(box.current, [stops[0].lon, stops[0].lat], 15);
    } catch {
      setFailed(true); // no WebGL: the list next to the map still has everything
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    const line: [number, number][] = [];
    if (home) {
      new maplibregl.Marker({ element: pin("H", true) }).setLngLat([home.lon, home.lat]).addTo(map);
      bounds.extend([home.lon, home.lat]);
    }
    for (const s of stops) {
      new maplibregl.Marker({ element: pin(String(s.n)) }).setLngLat([s.lon, s.lat]).addTo(map);
      bounds.extend([s.lon, s.lat]);
      line.push([s.lon, s.lat]);
    }
    if (route?.path.length) {
      new maplibregl.Marker({ element: pin("B", true) }).setLngLat(route.path[0]).addTo(map);
      for (const p of route.path) bounds.extend(p);
    }
    map.on("load", () => {
      if (route && route.path.length > 1) {
        map.addSource("bus", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.path } } });
        map.addLayer({ id: "bus", type: "line", source: "bus", paint: { "line-color": route.color || actionColor(), "line-width": 5, "line-opacity": 0.85 } });
      } else if (line.length > 1) {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": actionColor(), "line-width": 3, "line-dasharray": [2, 1.5] },
        });
      }
      box.current?.setAttribute("data-ready", "1");
    });
    map.on("error", () => box.current?.setAttribute("data-tile-error", "1"));
    // extra room at the bottom: the map's credit line stays visible (OpenStreetMap asks for that) and pins stay clear of it
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: 40, right: 56, bottom: 100, left: 40 }, maxZoom: 17, duration: 0 });
    return () => map.remove();
  }, [stops, home, route]);

  if (failed) return <p className="text-sm text-muted">This browser can&rsquo;t draw the map; the stops are listed here.</p>;
  return <div ref={box} role="img" aria-label={label} className="h-80 w-full overflow-hidden rounded border border-line" data-testid="day-map-canvas" />;
}
