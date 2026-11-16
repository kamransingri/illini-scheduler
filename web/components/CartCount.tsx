"use client";
import { useEffect, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart";

export default function CartCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(readCart().length);
    sync();
    return onCartChange(sync);
  }, []);
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-block min-w-5 rounded-full bg-white px-1.5 text-center text-sm font-bold leading-5 text-navy tnum" aria-label={`${n} courses in your schedule`}>
      {n}
    </span>
  );
}
