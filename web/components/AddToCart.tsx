"use client";
import { useEffect, useState } from "react";
import { addToCart, inCart, isLocked, onCartChange, readCart, removeFromCart, writeCart } from "@/lib/cart";
import Icon from "./ui/Icon";

/**
 * `short` (narrow table cells) shows "Add"/"Added"; the accessible name stays the full action. With `lock` (a CRN),
 * the button adds the course with that section pinned, and pressing it again unpins the section.
 */
export default function AddToCart({ subject, number, small = false, short = false, lock }: { subject: string; number: string; small?: boolean; short?: boolean; lock?: string }) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const sync = () => setAdded(lock ? isLocked(subject, number, lock) : inCart(subject, number));
    sync();
    return onCartChange(sync);
  }, [subject, number, lock]);
  const toggle = () => {
    if (!added) addToCart(subject, number, lock);
    else if (!lock) removeFromCart(subject, number);
    else writeCart(readCart().map((i) => (i.s === subject && i.n === number ? { ...i, locked: i.locked.filter((c) => c !== lock) } : i)));
  };
  const what = lock ? (added ? "Section in schedule" : "Add this section") : added ? "In schedule" : "Add to schedule";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded border font-semibold whitespace-nowrap ${small ? "px-2 text-sm leading-7" : "px-3 leading-9"} ${
        added ? "border-action bg-action-tint text-heading" : small ? "border-action bg-white text-action hover:bg-action-tint" : "border-action bg-action text-white hover:bg-action-dark"
      }`}
      aria-pressed={added}
      aria-label={short ? `${what}: ${subject} ${number}${lock ? `, CRN ${lock}` : ""}` : undefined}
    >
      <Icon name={added ? "check" : "plus"} />
      {short ? (added ? "Added" : "Add") : what}
    </button>
  );
}
