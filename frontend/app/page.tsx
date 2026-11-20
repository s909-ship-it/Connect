import Link from "next/link";
import { api, app, inr, pad2 } from "@/lib/api";
import { Clock } from "@/components/clock";
import { ProjectCard } from "@/components/project-card";
import { BuilderList } from "@/components/builder-list";
import { SignedCarousel } from "@/components/carousel";
import { InterestForm } from "@/components/interest-form";
import { Words } from "@/components/words";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";

export default async function Home() {
  const [o, projects, colleges, builders, lines] = await Promise.all([
    api.overview(), api.projects({ limit: 6 }), api.colleges(), api.builders(6), api.signedLines(6),
  ]);
  const r = o.rules;
  const steps = [
    { t: "Join a team, with a stake", d: `Find a project that needs your skill and ask to join. ${r.stake} of your credit is held until it ships.`, m: `${r.stake} held` },
    { t: "Build, and link the proof", d: "Tick off milestones. Link the live site, the repo, the demo. Write one line on what you did.", m: "Proof linked" },
    { t: `${r.reviewsNeeded} outsiders review it`, d: `People with ${r.reviewerMin}+ credit who were not on the team open the proof and decide what it is worth.`, m: `${r.live} live · ${r.demo} demo` },
    { t: "Teammates split the credit", d: "Each teammate divides the project between the others. Your share is the middle value of what they gave you.", m: "Median share" },
    { t: "It counts on your record", d: `Solo projects earn ${r.soloFactor * 100}%. Credit older than ${r.fadeMonths} months counts half. Every line is signed.`, m: `Starts at ${r.starter}` },
  ];

  return (
    <>
      {/* 1 · Hero */}
      <section id="hero" className="hero">
        <div className="hero-liquid" aria-hidden="true"><span /><span /><span /></div>
        <p className="hero-word" aria-hidden="true">CONNECT</p>
        <div className="hero-foot">
          <h1 className="hero-title" data-reveal>Credit only for what ships.<br />Students build it, teammates sign it.</h1>
          <div className="hero-status mono" data-reveal style={{ ["--d" as string]: "120ms" }}>
            <Clock />
            <span><i className="dot" aria-hidden="true" /> {o.stats.building} project{o.stats.building === 1 ? "" : "s"} being built now.</span>
          </div>
        </div>
      </section>

      {/* 2 · Latest work: shipped projects */}
      <section id="work" className="sec dark">
        <h2 className="mega red" data-reveal>Latest Work</h2>
        <div className="work-list">
          {projects.map((p, i) => <ProjectCard key={p.id} p={p} index={i} />)}
          {projects.length === 0 && <p className="lead">Nothing has shipped yet. The first reviewed project lands here.</p>}
        </div>
        <div className="sec-end"><Link className="btn-line" href="/work">Show all ({o.stats.shipped}) <span aria-hidden="true">→</span></Link></div>
      </section>

      {/* 3 · About */}
      <section id="about" className="sec light">
        <p className="statement" data-words>
          <Words text="Connect is a network of colleges where students build projects together. Each college is its own private space. " />
          <em><Words text="Credit comes only from projects that ship, and teammates and outside reviewers decide what each person earned." /></em>
        </p>
        <div className="sec-end"><a className="btn-line" href={app.rules}>Read the credit rules <span aria-hidden="true">→</span></a></div>
      </section>

      {/* 4 · How it works (numbered list) */}
      <section id="how" className="sec dark split">
        <h2 className="title" data-reveal>How it works</h2>
        <ol className="rows">
          {steps.map((s, i) => (
            <li key={s.t} className="row" data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
              <span className="row-tile" aria-hidden="true">{pad2(i + 1)}</span>
              <span className="row-main"><span className="row-title">{s.t}</span><span className="row-sub">{s.d}</span></span>
              <span className="mono row-meta">{s.m}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 5 · Colleges */}
      <section id="colleges" className="sec dark split tight-top">
        <h2 className="title-sm mono-label">Colleges on Connect</h2>
        <ul className="plain-list">
          {[...colleges].sort((a, b) => b.shipped - a.shipped || b.members - a.members).slice(0, 8).map((c) => (
            <li key={c.slug} data-reveal>
              <Link href={`/colleges/${c.slug}`} className="plain-link">
                <span>{c.name}</span>
                <span className="mono muted">{c.members} members · {c.shipped} shipped ↗</span>
              </Link>
            </li>
          ))}
          {colleges.length > 8 && (
            <li><Link href="/colleges" className="plain-link plain-more"><span>All colleges</span><span className="mono muted">{colleges.length} on Connect →</span></Link></li>
          )}
        </ul>
      </section>

      {/* 6 · Builders (index with preview) */}
      <section id="builders" className="sec light">
        <div className="sec-head">
          <h2 className="title" data-reveal>Builders</h2>
          <Link className="btn-line mono-btn" href="/builders">All builders <span aria-hidden="true">→</span></Link>
        </div>
        <BuilderList builders={builders} />
      </section>

      {/* 7 · Signed lines carousel */}
      <section id="signed" className="sec red-bg">
        <h2 className="mega" data-reveal>Signed, not said</h2>
        <SignedCarousel lines={lines} />
      </section>

      {/* 8 · Contact / join */}
      <section id="contact" className="sec dark contact">
        <div className="sec-end start"><a className="btn-line mono-btn" href={app.signin}>Join with your college email <span aria-hidden="true">→</span></a></div>
        <div className="contact-grid">
          <div>
            <h2 className="mono-label">Join</h2>
            <p className="contact-big"><i className="dot" aria-hidden="true" /> Open to every college.</p>
            <h3 className="mono-label">So far</h3>
            <ul className="contact-list">
              <li>{o.stats.members} verified members</li>
              <li>{o.stats.shipped} projects shipped and reviewed</li>
              {o.stats.committedInr > 0 && <li>{inr(o.stats.committedInr)} committed by alumni</li>}
            </ul>
          </div>
          <div>
            <h2 className="mono-label">Read</h2>
            <ul className="contact-list">
              <li><a href={app.rules}>Credit rules ↗</a></li>
              <li><a href={app.privacy}>Privacy ↗</a></li>
              <li><a href={app.terms}>Terms ↗</a></li>
              <li><a href={app.cookies}>Cookies ↗</a></li>
            </ul>
          </div>
          <div>
            <h2 className="mono-label">Bring Connect to your college</h2>
            <InterestForm signin={app.signin} />
          </div>
        </div>
      </section>
    </>
  );
}
