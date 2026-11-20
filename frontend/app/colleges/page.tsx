import type { Metadata } from "next";
import Link from "next/link";
import { api, app, year } from "@/lib/api";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Colleges", description: "Colleges on Connect. Each one is its own private space." };

export default async function Colleges() {
  const colleges = await api.colleges();
  return (
    <section className="sec dark page-top">
      <h1 className="mega" data-reveal>Colleges</h1>
      <p className="lead page-lead" data-reveal>Each college is its own private space: board, people, clubs and funding. Only counts and shipped work are public.</p>
      <ol className="rows wide">
        {colleges.map((c, i) => (
          <li key={c.slug} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
            <Link href={`/colleges/${c.slug}`} className="row">
              <span className="row-tile" aria-hidden="true">{c.name[0]}</span>
              <span className="row-main"><span className="row-title">{c.name}</span><span className="row-sub">{c.members} verified members · {c.shipped} shipped · {c.building} being built · {c.alumni} alumni</span></span>
              <span className="mono row-meta">Since {year(c.since)}</span>
            </Link>
          </li>
        ))}
        <li className="row muted"><span className="row-main"><span className="row-title">Yours isn’t here?</span><span className="row-sub">A college on an academic domain opens the first time a student proves an email on it. <a href={app.signin}>Sign in to start yours.</a></span></span></li>
      </ol>
    </section>
  );
}
