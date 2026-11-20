import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, app, monthYear } from "@/lib/api";
import { Cover } from "@/components/cover";
import { Avatar } from "@/components/avatar";
import { TierChip } from "@/components/tier";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await api.project(Number((await params).id));
  return p ? { title: p.name, description: p.pitch } : { title: "Project" };
}

export default async function ProjectPage({ params }: Props) {
  const p = await api.project(Number((await params).id));
  if (!p) notFound();
  return (
    <article className="page-top">
      <section className="sec dark case-head">
        <Link href="/work" className="mono back">← All work</Link>
        <h1 className="mega" data-reveal>{p.name}</h1>
        <dl className="facts" data-reveal style={{ ["--d" as string]: "100ms" }}>
          <div><dt className="mono">College</dt><dd><Link href={`/colleges/${p.college.slug}`}>{p.college.name}</Link></dd></div>
          <div><dt className="mono">Shipped</dt><dd>{monthYear(p.shippedAt)}</dd></div>
          <div><dt className="mono">Verdict</dt><dd>{p.verdict === "live" ? "Live and in use" : "Works, demo only"} · {p.pot}</dd></div>
          <div><dt className="mono">Team</dt><dd>{p.teamSize} {p.teamSize === 1 ? "person" : "people"}</dd></div>
        </dl>
      </section>
      <div className="case-cover warp"><Cover id={p.id} name={p.name} /></div>
      <section className="sec light split">
        <h2 className="title-sm mono-label">What it is</h2>
        <div>
          <p className="statement sm">{p.pitch}</p>
          {p.skills.length > 0 && <ul className="chips">{p.skills.map((s) => <li key={s}>{s}</li>)}</ul>}
          {p.proof.length > 0 && <p className="mono muted proof">Proof reviewed: {p.proof.join(" · ")}</p>}
        </div>
      </section>
      <section className="sec dark split">
        <h2 className="title">Who built it</h2>
        <ol className="rows">
          {p.team.map((m, i) => (
            <li key={m.id} className="row" data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
              <Avatar name={m.name} src={m.avatar} className="row-tile" />
              <span className="row-main">
                <Link href={`/builders/${m.id}`} className="row-title">{m.name}</Link>
                <span className="row-sub">{m.role ? `${m.role}. ` : ""}{m.did}</span>
              </span>
              <span className="mono row-meta"><TierChip tier={m.tier} /><br />{m.signedBy ? `Signed by ${m.signedBy}` : "Solo"}</span>
            </li>
          ))}
          {p.hiddenTeammates > 0 && <li className="row muted"><span className="row-main row-sub">{p.hiddenTeammates} more teammate{p.hiddenTeammates > 1 ? "s" : ""} without a public profile, or anonymous.</span></li>}
        </ol>
      </section>
      <section className="sec dark tight-top">
        <a className="btn-line mono-btn" href={app.college(p.college.slug)}>See {p.college.name} on Connect <span aria-hidden="true">→</span></a>
      </section>
    </article>
  );
}
