import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, app, monthYear, pad2 } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { TierBadge } from "@/components/tier";
import { ProgressChart } from "@/components/progress-chart";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await api.builder(Number((await params).id));
  return b ? { title: b.name, description: `${b.rank.name} rank. ${b.earned} credit earned. ${b.shipped} shipped of ${b.joined} joined. Every line signed by teammates.` } : { title: "Builder" };
}

export default async function BuilderPage({ params }: Props) {
  const b = await api.builder(Number((await params).id));
  if (!b) notFound();
  const r = b.rank;
  return (
    <>
      <section className="sec dark page-top">
        <Link href="/builders" className="mono back">← All builders</Link>
        <div className="person-head" data-reveal>
          <Avatar name={b.name} src={b.avatar} className="person-avatar" />
          <h1 className="mega">{b.name}</h1>
        </div>
        <p className="lead page-lead" data-reveal>
          {b.anonymous ? "Anonymous builder" : [b.branch, b.classOf && `class of ${b.classOf}`].filter(Boolean).join(", ")} · <Link href={`/colleges/${b.college.slug}`}>{b.college.name}</Link>
        </p>
        <dl className="stats">
          <div data-reveal><dd>{b.earned}</dd><dt className="mono">credit earned</dt></div>
          <div data-reveal style={{ ["--d" as string]: "70ms" }}><dd>{b.shipped}<small>/{b.joined}</small></dd><dt className="mono">shipped of joined</dt></div>
          {!b.anonymous && <div data-reveal style={{ ["--d" as string]: "140ms" }}><dd>{b.clubs.length}</dd><dt className="mono">confirmed club roles</dt></div>}
          <div data-reveal style={{ ["--d" as string]: "210ms" }}>
            <dd className={`stat-rank tier-name tier-${r.id}`}><TierBadge tier={r} size={52} title />{r.name}</dd>
            <dt className="mono">rank</dt>
          </div>
        </dl>
      </section>

      {b.anonymous ? (
        <section className="sec light split">
          <h2 className="title">Signed work</h2>
          <p className="statement sm">This builder is anonymous. Connect hides an anonymous person&rsquo;s record, so only their rank and totals show here.</p>
        </section>
      ) : (
        <section className="sec light split">
          <h2 className="title">Signed work</h2>
          <ol className="rows">
            {b.projects.map((p, i) => (
              <li key={p.id} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
                <Link href={`/work/${p.id}`} className="row">
                  <span className="row-tile" aria-hidden="true">{pad2(i + 1)}</span>
                  <span className="row-main">
                    <span className="row-title">{p.name}{p.role && <span className="muted"> · {p.role}</span>}</span>
                    <span className="row-sub">{p.did || p.pitch}</span>
                  </span>
                  <span className="mono row-meta">{monthYear(p.shippedAt)}<br />{p.signedBy ? `Signed by ${p.signedBy}` : "Solo"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="sec dark split">
        <h2 className="title">Progress</h2>
        <div className="progress">
          <div className="rank-card" data-reveal>
            <TierBadge tier={r} size={72} />
            <div className="rank-text">
              <b className={`rank-name tier-name tier-${r.id}`}>{r.name}</b>
              <span className="muted">{r.note}.</span>
            </div>
          </div>
          {r.next ? (
            <div className="rank-next" data-reveal>
              <span className="mono rank-next-row"><span>Next: <b className={`tier-name tier-${r.next.id}`}>{r.next.name}</b></span><span className="muted">{r.next.needs.join(" and ")}</span></span>
              <span className={`rank-bar tier-${r.next.id}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.next.progress * 100)} aria-label={`Progress to ${r.next.name}`}>
                <i style={{ width: `${Math.max(2, Math.round(r.next.progress * 100))}%` }} />
              </span>
            </div>
          ) : <p className="mono muted">The top rank. Nothing above it.</p>}

          {b.progress && (
            <>
              <ProgressChart p={b.progress} />
              {b.progress.reached.length > 0 && (
                <ul className="reached" aria-label="Ranks reached">
                  {b.progress.reached.map((x) => (
                    <li key={x.tier.id} className={`tier-chip tier-${x.tier.id}`}><TierBadge tier={x.tier} size={16} /><span>{x.tier.name}</span><span className="muted">{monthYear(x.at)}</span></li>
                  ))}
                </ul>
              )}
              {b.progress.recent.length > 0 && (
                <ul className="plain-list moves">
                  {b.progress.recent.map((m, i) => (
                    <li key={i} className="plain-link">
                      <span className="move-main"><span>{m.what}</span><span className="mono muted">{monthYear(m.at)} · {m.why}</span></span>
                      <span className={`mono move-n${m.n < 0 ? " neg" : ""}`}>{m.n > 0 ? "+" : "−"}{Math.abs(m.n)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      {b.clubs.length > 0 && (
        <section className="sec dark split tight-top">
          <h2 className="title-sm mono-label">Clubs (confirmed by leads)</h2>
          <ul className="plain-list">{b.clubs.map((c) => <li key={c.name} className="plain-link"><span>{c.name}</span><span className="mono muted">{c.role}</span></li>)}</ul>
        </section>
      )}
      <section className="sec dark tight-top">
        <a className="btn-line mono-btn" href={b.anonymous ? app.me(b.id) : app.profile(b.id)}>Full record on Connect <span aria-hidden="true">→</span></a>
      </section>
    </>
  );
}
