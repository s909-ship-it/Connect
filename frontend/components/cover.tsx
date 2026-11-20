import type { CSSProperties } from "react";

/* Connect stores no project images, so each project gets a typographic cover: its own name set huge on a
   coloured sheet, picked from the project id (stepping by 5 through 8 palettes, so neighbouring ids never share one). */
const PALETTES: [string, string][] = [
  ["#ff5a1f", "#ffffff"], // orange / white
  ["#1d3b16", "#7cff4f"], // forest / lime
  ["#ffb3b3", "#0f0000"], // liquid pink / black
  ["#1638ff", "#f6efed"], // cobalt / cream
  ["#f6efed", "#ff0000"], // cream / red
  ["#111111", "#ffd23f"], // black / yellow
  ["#7a2cff", "#f6efed"], // violet / cream
  ["#00a676", "#0f0000"], // green / black
];

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export function Cover({ id, name, size = "lg" }: { id: number; name: string; size?: "lg" | "sm" }) {
  const [bg, fg] = PALETTES[(id * 5) % PALETTES.length];
  // Break camel-case product names (BusPing → BUS / PING) so the type can run edge to edge in two lines.
  const parts = name.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase().split(/\s+/);
  const mid = Math.ceil(parts.length / 2);
  const lines = parts.length > 1 ? [parts.slice(0, mid).join(" "), parts.slice(mid).join(" ")] : [name.toUpperCase()];
  const longest = Math.max(...lines.map((l) => l.length));
  return (
    <div className={`cover cover-${size}`} style={{ "--cbg": bg, "--cfg": fg, "--chars": longest } as CSSProperties} aria-hidden="true">
      {lines.map((l, i) => <span key={i} className={`cover-line ${i ? "cover-line-2" : ""}`}>{l}</span>)}
    </div>
  );
}
