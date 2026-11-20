"use client";
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

type Point = { d: number; v: number };

/* A day number (days since 1970, India time) as a short date. */
export const dateOf = (d: number, year = false) =>
  new Date((d * 86400 - 19800) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" });

const nice = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9))), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};
const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(n * 10) / 10));

/* The big line graph: one line with a soft fill under it, the value on the right edge, and a crosshair that follows
   the pointer (or the arrow keys) and reads out the day and the value. */
export function LineChart({ points, color, label, kind, step }: { points: Point[]; color: string; label: string; kind: "total" | "count"; step: number }) {
  const id = useId().replace(/:/g, "");
  const [at, setAt] = useState<number | null>(null);
  const n = points.length;
  const vals = points.map((p) => p.v);
  const hi = Math.max(...vals, 0), lo = kind === "total" && n ? Math.min(...vals) : 0;
  // A running total gets a scale around its own values, with one gridline of room above and below, so growth is
  // visible; a daily count always starts at zero. Counts are whole numbers, so gridlines never fall between them.
  const tick = Math.max(1, nice(Math.max(hi - lo, 1) / 4));
  const yMin = kind === "total" ? Math.max(0, Math.floor(lo / tick) * tick - tick) : 0;
  const yMax = Math.max(yMin + tick, Math.ceil(hi / tick) * tick + (kind === "total" ? tick : 0));
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += tick) ticks.push(v);
  const X = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const Y = (v: number) => 100 - ((v - yMin) / (yMax - yMin || 1)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i) * 10},${Y(p.v) * 3}`).join(" ");
  const area = `${line} L${X(n - 1) * 10},300 L${X(0) * 10},300 Z`;
  const labels = n <= 1 ? [0] : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))).filter((v, i, a) => a.indexOf(v) === i);
  const spansYears = n > 1 && dateOf(points[0].d, true).slice(-4) !== dateOf(points[n - 1].d, true).slice(-4);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const cur = at ?? n - 1;
    setAt(e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  const p = at === null ? null : points[at];
  const when = (d: number) => (step > 1 ? `Week to ${dateOf(d, true)}` : dateOf(d, true));
  const last = points[n - 1];

  return (
    <div className="an-chart" style={{ color: `var(--${color})` }}>
      <div className="an-plot" tabIndex={0} role="img"
        aria-label={`${label}: ${n ? `${fmt(points[0].v)} on ${dateOf(points[0].d, true)}, ${fmt(last.v)} on ${dateOf(last.d, true)}` : "no data"}. Use the arrow keys to read each ${step > 1 ? "week" : "day"}.`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setAt(null)} onKeyDown={key} onBlur={() => setAt(null)}>
        {ticks.map((t) => (
          <div key={t} className="an-grid" style={{ top: `${Y(t)}%` }}><span>{fmt(t)}</span></div>
        ))}
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {n > 1 && <path d={area} fill={`url(#g${id})`} />}
          {n > 1 && <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {n === 1 && <i className="an-dot" style={{ left: "50%", top: `${Y(last.v)}%` }} />}
        {n > 1 && at === null && <i className="an-dot" style={{ left: "100%", top: `${Y(last.v)}%` }} />}
        {p && at !== null && (
          <>
            <i className="an-cross" style={{ left: `${X(at)}%` }} />
            <i className="an-dot" style={{ left: `${X(at)}%`, top: `${Y(p.v)}%` }} />
            <div className={`an-tip${X(at) > 70 ? " left" : ""}`} style={{ left: `${X(at)}%` }}>
              <b>{fmt(p.v)}</b><span>{when(p.d)}</span>
            </div>
          </>
        )}
      </div>
      <div className="an-x" aria-hidden="true" data-n={labels.length}>
        {labels.map((i) => <span key={i} style={{ left: `${X(i)}%` }}>{dateOf(points[i]?.d ?? 0, spansYears)}</span>)}
      </div>
    </div>
  );
}
