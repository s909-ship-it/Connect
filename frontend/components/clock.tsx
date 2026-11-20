"use client";

import { useEffect, useState } from "react";

/* Live local time for where Connect is run from (India), like a studio's location clock. */
export function Clock({ zone = "Asia/Kolkata", label = "UTC+5:30 India" }: { zone?: string; label?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);
  const time = now ? now.toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }) : "--:--";
  return <span className="mono" suppressHydrationWarning>{time} {label}</span>;
}
