import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { METRIC_IDS, RANGES, analytics } from "@/lib/analytics";
import { LineChart } from "./chart";
import "./analytics.css";

export const metadata = { title: "Analytics · Admin" };

const STAGES: [id: string, label: string][] = [["recruiting", "Recruiting"], ["building", "Building"], ["review", "In review"], ["shipped", "Shipped"]];
const ROLES: Record<string, string> = { student: "Students", alum: "Alumni", faculty: "Faculty" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const hour = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

/* A tiny line for the metric cards. Drawn on the server; no hover. */
function Spark({ points, color }: { points: { v: number }[]; color: string }) {
  const hi = Math.max(...points.map((p) => p.v), 1), lo = Math.min(...points.map((p) => p.v), 0), n = points.length;
  const d = points.map((p, i) => `${i ? "L" : "M"}${n === 1 ? 50 : (i / (n - 1)) * 100},${28 - ((p.v - lo) / (hi - lo || 1)) * 26}`).join(" ");
  return (
    <svg className="an-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" style={{ color: `var(--${color})` }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="ov-skills">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="ov-bar" aria-hidden="true"><i style={{ width: `${r.n ? Math.max(4, Math.round((r.n / top) * 100)) : 0}%` }} /></span>
          <span className="mono">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

/* For admins: how Connect is used over time. A college admin sees their own community; a site admin sees every
   community together or one at a time. Counts only, never names or anything anyone wrote. */
export default async function Analytics({ searchParams }: { searchParams: Promise<{ m?: string; r?: string; c?: string }> }) {
  const me = await requireUser();
  if (!me.admin && !me.super) notFound();
  const q = await searchParams;
  const colleges = me.super ? all("SELECT id, name FROM colleges WHERE status='active' ORDER BY name") : [];
  const cid: number | null = me.super ? (colleges.some((c) => c.id === Number(q.c)) ? Number(q.c) : null) : me.college_id;
  if (!me.super && !cid) notFound();
  const metric = METRIC_IDS.includes(q.m ?? "") ? q.m! : "members";
  const a = analytics(cid, q.r ?? "30d");
  const s = a.series.find((x) => x.id === metric)!;
  const where = cid ? (get("SELECT name FROM colleges WHERE id=?", cid)?.name ?? "this community") : "every community";
  const href = (o: { m?: string; r?: string }) => {
    const p = new URLSearchParams();
    const m = o.m ?? metric, r = o.r ?? a.range;
    if (m !== "members") p.set("m", m);
    if (r !== "30d") p.set("r", r);
    if (me.super && cid) p.set("c", String(cid));
    const t = p.toString();
    return `/admin/analytics${t ? `?${t}` : ""}`;
  };
  const rangeName = RANGES.find(([id]) => id === a.range)![1].toLowerCase();
  // "in the last 30 days", "in the last year", "all time"
  const span = a.range === "all" ? "all time" : a.range === "1y" ? "in the last year" : `in the last ${rangeName}`;
  const prior = a.range === "1y" ? "the year before" : `the ${rangeName} before`, ago = a.range === "1y" ? "a year ago" : `${rangeName} ago`;
  // A running total says how much it grew; "weekly active" compares today's level with the level back then;
  // the rest compare this period with the one before it.
  const changeText = s.change === null ? null
    : s.kind === "total" ? (s.change ? `${signed(s.change)} ${span}` : `no change ${span}`)
    : s.change === 0 ? `same as ${s.id === "weekly" ? ago : prior}`
    : `${Math.abs(s.change)} ${s.change > 0 ? "more" : "fewer"} than ${s.id === "weekly" ? ago : prior}`;
  const hoursTop = Math.max(1, ...a.hours);
  const busiest = a.hours.indexOf(Math.max(...a.hours));
  const from = a.range === "all" ? "from all messages, posts and calls" : `from messages, posts and calls ${span}`;
  const answered = a.calls.n ? Math.round((a.calls.answered / a.calls.n) * 100) : 0;

  return (
    <>
      <Link href="/admin">← Admin</Link>
      <div className="head">
        <div className="stack tight">
          <h1>Analytics</h1>
          <p>How {where} uses Connect, day by day. Counts only: no names, and nothing anyone wrote. Days are in India time.</p>
        </div>
        {me.super && (
          <form className="row an-scope" action="/admin/analytics">
            <label className="field"><span>Community</span>
              <select name="c" id="an-college" defaultValue={cid ?? ""}>
                <option value="">All communities</option>
                {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {metric !== "members" && <input type="hidden" name="m" value={metric} />}
            {a.range !== "30d" && <input type="hidden" name="r" value={a.range} />}
            <button className="btn ghost sm">Show</button>
          </form>
        )}
      </div>

      <section className="card stack an-main" aria-labelledby="an-title">
        <div className="row between an-top">
          <div className="stack tight">
            <h2 id="an-title">{s.label}</h2>
            <span className="small muted">{s.about}</span>
          </div>
          <nav className="filters" aria-label="Time range">
            {RANGES.map(([id, label]) => <Link key={id} href={href({ r: id })} aria-current={a.range === id ? "true" : undefined}>{label}</Link>)}
          </nav>
        </div>
        <div className="an-head">
          <b style={{ color: `var(--${s.color}-t, var(--${s.color}))` }}>{s.total}</b>
          <span className="small muted">{s.kind === "total" ? "now" : s.id === "weekly" ? "in the last 7 days" : s.id === "active" ? `different people ${span}` : span}</span>
          {changeText && <span className={`pill ${!s.change ? "plain" : s.change > 0 ? "ok" : "bad"}`}>{changeText}</span>}
        </div>
        <LineChart points={s.points} color={s.color} label={s.label} kind={s.kind} step={s.step} />
        {s.step > 1 && <span className="small muted">Each point is one week.</span>}
      </section>

      <section className="card overview" aria-label="Right now">
        <div className="ov-figures an-figures">
          <div><b>{a.now.members}</b><span>members, {a.now.verified} verified</span></div>
          <div><b>{a.now.dau}</b><span>active today</span></div>
          <div><b>{a.now.wau}</b><span>active in the last 7 days</span></div>
          <div><b>{a.now.mau}</b><span>active in the last 30 days{a.now.mau ? `, ${a.now.stickiness}% of them today` : ""}</span></div>
          <div><b>{a.now.retention === null ? "–" : `${a.now.retention}%`}</b><span>{a.now.retention === null ? "came back (nobody joined 1 to 5 weeks ago)" : `of ${a.now.retentionOf} who joined 1 to 5 weeks ago came back another day`}</span></div>
        </div>
      </section>

      <div className="an-cards">
        {a.series.map((x) => (
          <Link key={x.id} href={href({ m: x.id })} className="card an-card" aria-current={x.id === metric ? "true" : undefined}>
            <span className="label">{x.label}</span>
            <span className="row between nowrap">
              <b>{x.total}</b>
              {x.change !== null && x.change !== 0 && <span className={`small ${x.change > 0 ? "an-up" : "an-down"}`}>{signed(x.change)}</span>}
            </span>
            <Spark points={x.points} color={x.color} />
          </Link>
        ))}
      </div>

      <div className="grid an-more">
        <div className="card">
          <h2>Projects by stage</h2>
          <Bars rows={STAGES.map(([id, label]) => ({ label, n: a.statuses[id] ?? 0 }))} />
        </div>
        <div className="card">
          <h2>Members by role</h2>
          <Bars rows={Object.entries(a.roles).map(([r, n]) => ({ label: ROLES[r] ?? r, n }))} />
        </div>
        <div className="card">
          <h2>{a.range === "all" ? "Calls, all time" : `Calls ${span}`}</h2>
          {a.calls.n === 0 ? <span className="muted">No calls yet.</span> : (
            <div className="an-facts">
              <div><b>{a.calls.n}</b><span>started</span></div>
              <div><b>{answered}%</b><span>answered</span></div>
              <div><b>{Math.round((a.calls.video / a.calls.n) * 100)}%</b><span>video</span></div>
              <div><b>{a.calls.secs >= 60 ? `${Math.round(a.calls.secs / 60)} min` : `${a.calls.secs} s`}</b><span>average length</span></div>
            </div>
          )}
        </div>
        <div className="card">
          <h2>Busiest hours</h2>
          {a.hours.every((h) => h === 0) ? <span className="muted">No messages, posts or calls {a.range === "all" ? "yet" : span}.</span> : (
            <>
              <div className="an-hours" role="img" aria-label={`Busiest around ${hour(busiest)}, ${from}.`}>
                {a.hours.map((h, i) => <i key={i} style={{ height: `${Math.max(2, (h / hoursTop) * 100)}%` }} className={i === busiest ? "top" : undefined} title={`${hour(i)}: ${h}`} />)}
              </div>
              <span className="row between small muted an-hours-x"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span></span>
              <span className="small muted">Busiest around {hour(busiest)}, {from}.</span>
            </>
          )}
        </div>
        <div className="card">
          <h2>Devices</h2>
          {a.devices.length === 0 ? <span className="muted">No sign-ins recorded yet.</span> : <Bars rows={a.devices} />}
          <span className="small muted">From each member&rsquo;s latest sign-in.</span>
        </div>
      </div>

      {a.colleges.length > 0 && (
        <div className="card stack">
          <h2>Communities</h2>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead><tr><th scope="col">Community</th><th scope="col">Members</th><th scope="col">Active, 30 days</th><th scope="col">Projects</th><th scope="col">Shipped</th></tr></thead>
              <tbody>
                {a.colleges.map((c) => (
                  <tr key={c.id}>
                    <th scope="row"><Link href={`/admin/analytics?c=${c.id}`}>{c.name}</Link></th>
                    <td>{c.members}</td><td>{c.active}</td><td>{c.projects}</td><td>{c.shipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
