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
    <span className="ml-1 rounded-full bg-orange-300 px-1.5 text-xs font-bold text-navy" aria-label={`${n} courses in your schedule`}>
      {n}
    </span>
  );
}
