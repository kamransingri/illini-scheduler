"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onCartChange, readCart, type CartItem } from "@/lib/cart";

/** Where the student left off: the courses in their schedule cart, or how to start one. */
export default function YourSchedule() {
  const [cart, setCart] = useState<CartItem[] | null>(null);
  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    return onCartChange(sync);
  }, []);
  if (!cart) return <span className="text-muted">Checking your saved courses…</span>;
  if (!cart.length) return <span>Nothing saved yet. Add courses from search, a course page or the gen-ed finder, and they wait here.</span>;
  return (
    <span>
      {cart.length} course{cart.length > 1 ? "s" : ""} saved:{" "}
      {cart.slice(0, 6).map((c, i) => (
        <span key={c.s + c.n}>
          {i > 0 && ", "}
          <span className="font-semibold">
            {c.s} {c.n}
          </span>
        </span>
      ))}
      {cart.length > 6 ? "…" : ""}.{" "}
      <Link href="/schedule/" className="font-semibold text-action hover:underline">
        Continue building
      </Link>
    </span>
  );
}
