import Link from "next/link";
import type { Project } from "@/lib/api";
import { year } from "@/lib/api";
import { Cover } from "./cover";

/* One row of "Latest work": caption on the left, the bending cover on the right. */
export function ProjectCard({ p, index = 0 }: { p: Project; index?: number }) {
  const discipline = p.skills.slice(0, 2).join(", ") || (p.verdict === "live" ? "Live product" : "Working demo");
  return (
    <article className="work-item" data-reveal style={{ ["--d" as string]: `${Math.min(index, 3) * 80}ms` }}>
      <Link href={`/work/${p.id}`} className="work-link">
        <div className="work-caption">
          <h3>{p.name}</h3>
          <p>{discipline}, {year(p.shippedAt)}</p>
          <p className="work-pitch">{p.pitch}</p>
          <span className="mono work-meta">{p.college.name} · {p.verdict === "live" ? "Live and in use" : "Working demo"}</span>
        </div>
        <div className="warp"><Cover id={p.id} name={p.name} /></div>
      </Link>
    </article>
  );
}
