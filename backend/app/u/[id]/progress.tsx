import Link from "next/link";
import type { Standing } from "@/lib/credit";
import { TIERS, tierFor } from "@/lib/tiers";
import { dayOf, progressOf } from "@/lib/progress";
import { LineChart } from "../../admin/analytics/chart";
import { TierBadge } from "../../tier-badge";
import "../../admin/analytics/analytics.css"; // the line chart's own styles
import "./progress.css";

const date = (t: number, year = true) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" });
const month = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/* The Progress tab on a profile: rank, credit and shipped projects over time, the numbers behind them, and every gain
   and loss in order. `label` turns a ledger line's text into what this viewer may see (private projects stay private). */
export function ProgressTab({ s, first, self, graph, base, label, today }: {
  s: Standing; first: string; self: boolean; graph: "credit" | "projects"; base: string;
  label: (what: string, pid?: number) => string; today: number;
}) {
  const st = tierFor(s.earned, s.shipped);
  const pr = progressOf(s, today);
  const whose = self ? "your" : `${first}'s`;
  // Shipped projects over time, on the same days as the credit line.
  const shippedDays = pr.moments.filter((m) => m.shipped).map((m) => dayOf(m.at));
  const projects = pr.points.map((p) => ({ d: p.d, v: shippedDays.filter((d) => d <= p.d).length }));
  const vouches = s.ledger.filter((l) => l.what === "Vouch from a teammate").length;
  const reviews = s.ledger.find((l) => l.what === "Accurate reviews")?.n ?? 0;
  const commissions = s.ledger.filter((l) => l.what.startsWith("Commission done:")).length;
  const finish = s.shipped + s.left ? Math.round((s.shipped / (s.shipped + s.left)) * 100) : null;
  // Newest first, grouped by month, with the tiers reached placed where they happened.
  type Row = { at: number; kind: "move"; what: string; why: string; n: number; total: number } | { at: number; kind: "tier"; tier: (typeof TIERS)[number] };
  const rows: Row[] = [
    ...pr.moments.map((m) => ({ at: m.at, kind: "move" as const, what: label(m.what, m.pid), why: m.why, n: m.n, total: m.total })),
    ...pr.reached.map((r) => ({ at: r.at, kind: "tier" as const, tier: r.tier })),
  ].sort((a, b) => b.at - a.at || (a.kind === "tier" ? -1 : 1));
  const months: [string, Row[]][] = [];
  for (const r of rows) {
    const k = month(r.at);
    if (months[months.length - 1]?.[0] !== k) months.push([k, []]);
    months[months.length - 1][1].push(r);
  }

  return (
    <>
      <section className="card stack rank-card" aria-labelledby="rank-h">
        <div className="rank-top">
          <TierBadge tier={st.tier} size={84} />
          <div className="stack tight">
            <span className="label" id="rank-h">Rank</span>
            <b className={`rank-name tier-name tier-${st.tier.id}`}>{st.tier.name}</b>
            <span className="small muted">{st.tier.note}. {s.earned} earned credit, {s.shipped} shipped project{s.shipped === 1 ? "" : "s"}.</span>
          </div>
        </div>
        {st.next ? (
          <div className="stack tight">
            <span className="row between small"><span>Next: <b className={`tier-name tier-${st.next.id}`}>{st.next.name}</b></span><span className="muted">{st.needs.join(" and ")}</span></span>
            <span className={`rank-bar tier-${st.next.id}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.progress * 100)} aria-label={`Progress to ${st.next.name}`}><i style={{ width: `${Math.max(2, Math.round(st.progress * 100))}%` }} /></span>
          </div>
        ) : <span className="small">The top rank. Nothing above it.</span>}
        <ol className="rank-ladder" aria-label="All ranks">
          {TIERS.map((t, i) => (
            <li key={t.id} className={i === st.index ? "now" : i < st.index ? "done" : ""}>
              <TierBadge tier={t} size={30} dim={i > st.index} />
              <span className="small"><b>{t.name}</b><br /><span className="muted">{t.min ? `${t.min}+` : "Start"}{t.shipped ? `, ${t.shipped} shipped` : ""}</span></span>
            </li>
          ))}
        </ol>
        <span className="small muted">Ranks come only from earned credit, which only verified work gives. From Gold up they also need shipped projects. <Link href="/rules">How credit works</Link></span>
      </section>

      <section className="card stack" aria-labelledby="graph-h">
        <div className="row between">
          <h2 id="graph-h">{graph === "credit" ? "Earned credit over time" : "Projects shipped over time"}</h2>
          <nav className="filters" aria-label="Graph">
            <Link href={`${base}&g=credit`} aria-current={graph === "credit" ? "true" : undefined}>Credit</Link>
            <Link href={`${base}&g=projects`} aria-current={graph === "projects" ? "true" : undefined}>Projects</Link>
          </nav>
        </div>
        {pr.moments.length === 0 ? <span className="muted">Nothing earned yet. The line starts with {self ? "your" : "their"} first shipped project or verified email.</span> : (
          <>
            <LineChart points={graph === "credit" ? pr.points : projects} color={graph === "credit" ? "green" : "purple"} label={graph === "credit" ? "Earned credit" : "Projects shipped"} kind="total" step={pr.step} />
            <span className="small muted">{graph === "credit" ? "Shown at today's values: credit from a project that has faded with age counts as it does now." : "Each step is a project that passed outside review."}{pr.step > 1 ? " Each point is one week." : ""}</span>
          </>
        )}
      </section>

      <div className="prog-facts">
        <div><b>{s.shipped}</b><span>shipped of {s.joined} joined</span></div>
        <div><b>{finish === null ? "–" : `${finish}%`}</b><span>finish rate</span></div>
        <div><b>{vouches}</b><span>vouches counted</span></div>
        <div><b>{reviews}</b><span>credit from accurate reviews</span></div>
        <div><b>{commissions}</b><span>commissions done</span></div>
        <div><b>{s.cred.score}</b><span>credibility of 100</span></div>
      </div>

      <section className="card stack" aria-labelledby="hist-h">
        <h2 id="hist-h">Credit history</h2>
        <span className="small muted">Every gain and loss in {whose} earned credit, newest first, with the running total after each.</span>
        {months.length === 0 && <span className="muted">Nothing yet.</span>}
        {months.map(([m, list]) => (
          <div key={m} className="stack tight">
            <span className="label">{m}</span>
            <ul className="hist">
              {list.map((r, i) => r.kind === "tier" ? (
                <li key={`t${i}`} className="hist-tier">
                  <span className="hist-date">{date(r.at, false)}</span>
                  <span className="row nowrap"><TierBadge tier={r.tier} size={22} /><b>Reached <span className={`tier-name tier-${r.tier.id}`}>{r.tier.name}</span></b></span>
                  <span />
                </li>
              ) : (
                <li key={`m${i}`}>
                  <span className="hist-date">{date(r.at, false)}</span>
                  <span className="hist-what"><b>{r.what}</b><span className="small muted">{r.why}</span></span>
                  <span className="hist-n"><b className={r.n < 0 ? "neg" : "pos"}>{r.n > 0 ? "+" : "−"}{Math.abs(r.n)}</b><span className="small muted">{r.total}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
