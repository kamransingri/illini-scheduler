"use client";
// "Drop a pin" for where you live (#96): a map to put a pin on, then Use this spot. The map (MapLibre) loads only
// when the picker opens. The pin is saved rounded to about 100 m (lib/commute.ts encodePin).

import dynamic from "next/dynamic";
import { useState } from "react";
import { encodePin, type Place } from "@/lib/commute";

const PinMapCanvas = dynamic(() => import("./PinMapCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-80 w-full place-items-center rounded border border-line text-muted">Loading the map…</div>,
});

export default function PinPicker({ start, onSave, onCancel }: { start: Place | null; onSave: (pin: string) => void; onCancel: () => void }) {
  const [spot, setSpot] = useState<{ lat: number; lon: number } | null>(start ? { lat: start.lat, lon: start.lon } : null);
  const pin = spot ? encodePin(spot.lat, spot.lon) : null;
  return (
    <div className="space-y-2 rounded border border-line p-3" data-testid="pin-picker">
      <p className="text-sm">Click or tap where you live to drop a pin, and drag it to move it.</p>
      <PinMapCanvas start={start} onPick={(lat, lon) => setSpot({ lat, lon })} />
      {spot && !pin && <p className="text-sm font-semibold text-heading">That&rsquo;s outside Champaign-Urbana, where MTD runs. Drop the pin closer to campus.</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded bg-action px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          disabled={!pin}
          onClick={() => pin && onSave(pin)}
        >
          Use this spot
        </button>
        <button type="button" className="font-semibold text-action underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-sm text-muted">Saved in this browser only, rounded to about 100 m, and never put in share links.</p>
    </div>
  );
}
