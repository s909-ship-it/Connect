import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { collegeBySlug, domainsOf } from "@/lib/college";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = collegeBySlug((await params).slug);
  return c ? { title: c.name, description: `${c.name} on Connect: members who build and ship together.` } : { title: "Community" };
}

/* A college's public front page: what has shipped there and how to get in. Its live board stays private to its students. */
export default async function CollegePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = collegeBySlug((await params).slug);
  if (!c || c.status !== "active") notFound();
  const me = await currentUser();
  const here = me?.college_id === c.id && me.verified;
  const n = (sql: string) => get(sql, c.id)?.n ?? 0;
  const students = n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='student' AND verified=1 AND suspended=0");
  const live = n("SELECT COUNT(*) n FROM projects WHERE college_id=? AND status IN ('recruiting','building','review') AND hidden=0");
  const alumni = n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='alum' AND verified=1");
  const shipped = all("SELECT id, name, pitch, pot, shipped_at FROM projects WHERE college_id=? AND status='shipped' AND hidden=0 ORDER BY shipped_at DESC LIMIT 12", c.id);
  return (
    <>
      <div className="college-hero card">
        <span className="college-mark lg" aria-hidden="true">{c.name.slice(0, 1)}</span>
        <div className="stack tight">
          <span className="label">Community on Connect</span>
          <h1>{c.name}</h1>
          <span className="muted">Only people with a verified {domainsOf(c).map((d, i) => <span key={d}>{i ? " or " : ""}<b className="mono">@{d}</b></span>)} email get in.</span>
        </div>
        <div className="row">
          {here ? <Link className="btn" href="/">Open the board</Link>
            : me ? <Link className="btn" href="/onboarding">Prove your email to join</Link>
            : <Link className="btn" href="/signin">Join with your college or work email</Link>}
        </div>
      </div>
      <div className="grid stats4">
        <div className="card"><b className="big">{students}</b><span className="small muted">verified members</span></div>
        <div className="card"><b className="big">{shipped.length}</b><span className="small muted">projects shipped</span></div>
        <div className="card"><b className="big">{live}</b><span className="small muted">being built now</span></div>
        <div className="card"><b className="big">{alumni}</b><span className="small muted">alumni backing projects</span></div>
      </div>
      <div className="card">
        <h2>Shipped here</h2>
        {shipped.length === 0 && <span className="muted">Nothing shipped yet. Be the first.</span>}
        {shipped.map((p) => (
          <div key={p.id} className="row between">
            <span className="stack" style={{ gap: 0 }}><b>{p.name}</b><span className="small muted">{p.pitch}</span></span>
            <span className="stamp">Reviewed · pot {p.pot}</span>
          </div>
        ))}
        <p className="small muted">Teams, open roles and work in progress are visible only to verified members of {c.name}.</p>
      </div>
    </>
  );
}
