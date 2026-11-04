"use client";
import { useEffect, useState } from "react";
import { addToCart, inCart, onCartChange, removeFromCart } from "@/lib/cart";

export default function AddToCart({ subject, number, small = false }: { subject: string; number: string; small?: boolean }) {
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
      className={`rounded font-medium whitespace-nowrap ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
        added ? "border border-brand text-brand-dark bg-white" : "bg-brand text-white hover:bg-brand-dark"
      }`}
      aria-pressed={added}
    >
      {added ? "✓ In schedule" : "Add to schedule"}
    </button>
  );
}
