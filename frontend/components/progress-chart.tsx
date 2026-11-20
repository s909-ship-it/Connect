import type { Progress } from "@/lib/api";

/* Earned credit over time (Connect's Progress tab), drawn on the server as a simple line with a soft fill. */
export function ProgressChart({ p }: { p: Progress }) {
  const pts = p.points;
  if (pts.length < 2) return null;
  const W = 640, H = 200, pad = 6;
  const max = Math.max(10, ...pts.map((x) => x.credit));
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(q.credit).toFixed(1)}`).join("");
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const last = pts[pts.length - 1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Earned credit from ${fmt(pts[0].day)} to ${fmt(last.day)}: now ${last.credit}`}>
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--red)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--red)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />)}
        <path d={`${line}L${x(pts.length - 1)},${H}L${x(0)},${H}Z`} fill="url(#chart-fill)" />
        <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mono muted chart-axis"><span>{fmt(pts[0].day)}</span><span>Peak {max} · now {last.credit}</span><span>{fmt(last.day)}</span></figcaption>
    </figure>
  );
}
