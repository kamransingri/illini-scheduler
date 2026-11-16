"use client";
import { useEffect, useState } from "react";
import { addToCart, inCart, onCartChange, removeFromCart } from "@/lib/cart";
import Icon from "./ui/Icon";

/** `short` (narrow table cells) shows "Add"/"Added"; the accessible name stays the full action. */
export default function AddToCart({ subject, number, small = false, short = false }: { subject: string; number: string; small?: boolean; short?: boolean }) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const sync = () => setAdded(inCart(subject, number));
    sync();
    return onCartChange(sync);
  }, [subject, number]);
  return (
    <button
      type="button"
      onClick={() => (added ? removeFromCart(subject, number) : addToCart(subject, number))}
      className={`inline-flex items-center gap-1.5 rounded border font-semibold whitespace-nowrap ${small ? "px-2 text-sm leading-7" : "px-3 leading-9"} ${
        added ? "border-action bg-action-tint text-heading" : small ? "border-action bg-white text-action hover:bg-action-tint" : "border-action bg-action text-white hover:bg-action-dark"
      }`}
      aria-pressed={added}
      aria-label={short ? `${added ? "In schedule" : "Add to schedule"}: ${subject} ${number}` : undefined}
    >
      <Icon name={added ? "check" : "plus"} />
      {short ? (added ? "Added" : "Add") : added ? "In schedule" : "Add to schedule"}
    </button>
  );
}
