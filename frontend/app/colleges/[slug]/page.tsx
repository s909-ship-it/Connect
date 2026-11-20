import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, app } from "@/lib/api";
import { ProjectCard } from "@/components/project-card";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await api.college((await params).slug);
  return c ? { title: c.name, description: `${c.name} on Connect: members who build and ship together.` } : { title: "College" };
}

export default async function CollegePage({ params }: Props) {
  const c = await api.college((await params).slug);
  if (!c) notFound();
  const stats: [number, string][] = [[c.counts.members, "verified members"], [c.counts.shipped, "projects shipped"], [c.counts.building, "being built now"], [c.counts.alumni, "alumni backing projects"]];
  return (
    <>
      <section className="sec dark page-top">
        <Link href="/colleges" className="mono back">← All colleges</Link>
        <h1 className="mega" data-reveal>{c.name}</h1>
        <p className="lead page-lead" data-reveal>Only people with a verified {c.domains.map((d) => `@${d}`).join(" or ")} email get in.</p>
        <dl className="stats">
          {stats.map(([n, l], i) => <div key={l} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}><dd>{n}</dd><dt className="mono">{l}</dt></div>)}
        </dl>
      </section>
      <section className="sec dark tight-top">
        <h2 className="title" data-reveal>Shipped here</h2>
        <div className="work-list">{c.shipped.map((p, i) => <ProjectCard key={p.id} p={p} index={i} />)}</div>
        {c.shipped.length === 0 && <p className="lead">Nothing shipped yet.</p>}
        <div className="sec-end start"><a className="btn-line mono-btn" href={app.signin}>Join {c.name} <span aria-hidden="true">→</span></a></div>
      </section>
    </>
  );
}
