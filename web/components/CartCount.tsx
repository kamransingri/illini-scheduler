"use client";
import { useEffect, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart";
import Icon from "./ui/Icon";

/**
 * How many courses are in the schedule builder, on its tab and on the phone's Menu button. The number is for the eye;
 * screen readers get the words, so the link or button is announced as "Schedule builder, 2 courses in your schedule".
 * `withIcon` adds the calendar glyph where the number stands alone (the Menu button), so it reads as a schedule count.
 */
export default function CartCount({ withIcon = false }: { withIcon?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(readCart().length);
    sync();
    return onCartChange(sync);
  }, []);
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center gap-1 rounded-full bg-white px-1.5 text-sm leading-5 font-bold text-navy tnum" data-testid="cart-count">
      {withIcon && <Icon name="calendar" className="size-3.5" />}
      <span aria-hidden="true">{n}</span>
      <span className="sr-only">
        , {n} {n === 1 ? "course" : "courses"} in your schedule
      </span>
    </span>
  );
}
