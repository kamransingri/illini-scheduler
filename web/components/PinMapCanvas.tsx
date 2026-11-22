"use client";
// The map for dropping a pin on where you live (#96). Click or tap to put the pin, drag it to move it, or pan the map
// and use "Put the pin in the middle of the map" (keyboard users can pan with the arrow keys). Loaded only when the
// picker is opened.

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/commute";
import { CAMPUS_CENTER, maplibregl, newMap, pinElement } from "@/lib/maplibre";

export default function PinMapCanvas({ start, onPick }: { start: Place | null; onPick: (lat: number, lon: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const toCenter = useRef<(() => void) | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map;
    try {
      map = newMap(box.current, start ? [start.lon, start.lat] : CAMPUS_CENTER, start ? 16 : 14.5);
    } catch {
      setFailed(true); // no WebGL
      return;
    }
    let marker: maplibregl.Marker | null = null;
    const place = (lng: number, lat: number) => {
      if (!marker) {
        marker = new maplibregl.Marker({ element: pinElement("H", true), draggable: true }).setLngLat([lng, lat]).addTo(map);
        marker.on("dragend", () => {
          const p = marker!.getLngLat();
          pickRef.current(p.lat, p.lng);
        });
      } else marker.setLngLat([lng, lat]);
      pickRef.current(lat, lng);
    };
    if (start) place(start.lon, start.lat);
    map.on("click", (e) => place(e.lngLat.lng, e.lngLat.lat));
    map.on("load", () => box.current?.setAttribute("data-ready", "1"));
    toCenter.current = () => {
      const c = map.getCenter();
      place(c.lng, c.lat);
    };
    return () => {
      toCenter.current = null;
      map.remove();
    };
    // the map is made once per opening; `start` is only where it begins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <p className="text-sm text-muted">This browser can&rsquo;t draw the map. Pick a hall or building, or use where you are now.</p>;
  return (
    <div className="space-y-2">
      <div
        ref={box}
        role="application"
        aria-label="Map for dropping a pin on where you live. Click or tap to put the pin; drag it to move it."
        className="h-80 w-full overflow-hidden rounded border border-line"
        data-testid="pin-map-canvas"
      />
      <button type="button" className="text-sm font-semibold text-action underline" onClick={() => toCenter.current?.()}>
        Put the pin in the middle of the map
      </button>
    </div>
  );
}
