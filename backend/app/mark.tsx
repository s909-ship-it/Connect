import { ImageResponse } from "next/og";

/* The Connect mark (two overlapping squares) as a square PNG, for phone home screens. */
export function markPng(size: number, padded = false) {
  const r = Math.round(size * (padded ? 0.2 : 0.22)); // circle radius; maskable icons keep a safe margin
  const cx = size / 2, gap = Math.round(r * 0.9);
  const dot = (x: number, color: string, opacity = 1) => (
    <div style={{ position: "absolute", left: x - r, top: size / 2 - r, width: r * 2, height: r * 2, borderRadius: 0, background: color, opacity }} />
  );
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", position: "relative", background: "#0B0A09", borderRadius: 0 }}>
        {dot(cx - gap / 2, "#F4783A")}
        {dot(cx + gap / 2, "#8A857E")}
      </div>
    ),
    { width: size, height: size },
  );
}
