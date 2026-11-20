import Link from "next/link";
import { all } from "@/lib/db";
import { requireMember, standings } from "@/lib/auth";
import * as A from "../actions";
import { F, Meter, inr } from "../ui";

export const metadata = { title: "Funding" };

export default async function Funding() {
  const me = await requireMember();
  const S = standings();
  const back = "/funding";
  const users = new Map(all("SELECT id, name, grad_year FROM users WHERE college_id=?", me.college_id).map((u) => [u.id, u]));
  const calls = all("SELECT * FROM calls WHERE open=1 AND college_id=? ORDER BY id DESC", me.college_id);
  const apps = all("SELECT a.*, p.name FROM applications a JOIN projects p ON p.id=a.project_id WHERE p.college_id=?", me.college_id);
  const grants = all("SELECT g.*, p.name FROM grants g JOIN projects p ON p.id=g.project_id WHERE p.college_id=? ORDER BY g.id DESC", me.college_id);
  const parts = all("SELECT gp.* FROM grant_parts gp JOIN grants g ON g.id=gp.grant_id JOIN projects p ON p.id=g.project_id WHERE p.college_id=?", me.college_id);
  const total = grants.reduce((a, g) => a + g.amount, 0);
  const paid = parts.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0);
  const members = all("SELECT project_id, user_id FROM members WHERE status='active'");
  const teamCredit = (pid: number) => members.filter((m) => m.project_id === pid).reduce((a, m) => a + (S.get(m.user_id)?.earned ?? 0), 0);
  const myProjects = all("SELECT * FROM projects WHERE lead_id=? AND status<>'dropped' AND college_id=?", me.id, me.college_id);
  const isAlum = me.role === "alum" && me.verified;

  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>Alumni funding</h1>
        <p>Alumni put money behind members&rsquo; projects, one milestone at a time. Connect records what was promised and what was paid. The money itself moves directly between the alum and the team.</p>
      </div></div>
      <div className="card"><div className="stats">
        <div className="stat"><b>{inr(total)}</b><span className="small muted">committed to projects</span></div>
        <div className="stat"><b>{inr(paid)}</b><span className="small muted">paid out so far</span></div>
        <div className="stat"><b>{inr(total - paid)}</b><span className="small muted">held until milestones are met</span></div>
      </div></div>

      <div className="cols">
        <div className="stack">
          <h2>Open calls</h2>
          {calls.length === 0 && <div className="note">No open calls right now.</div>}
          {calls.map((c) => {
            const by = users.get(c.alum_id), own = c.alum_id === me.id;
            const pending = apps.filter((a) => a.call_id === c.id && a.status === "pending");
            return (
              <div key={c.id} className="card">
                <div className="row between"><h3>{c.title}</h3><span className="mono">up to {inr(c.amount)}</span></div>
                <span className="muted">{c.about}</span>
                <span className="small">From <Link href={`/u/${by.id}`}>{by.name}</Link>, class of {by.grad_year}. Team needs {c.min_credit} combined credit and at least one member who has shipped before.</span>
                {!own && myProjects.map((p) => {
                  const tc = teamCredit(p.id), app = apps.find((a) => a.call_id === c.id && a.project_id === p.id);
                  return (
                    <div key={p.id} className="row between small">
                      <span>{p.name} <span className="mono muted">team credit {tc}</span></span>
                      {app ? <span className={`pill ${app.status === "accepted" ? "ok" : app.status === "declined" ? "bad" : "info"}`}>{app.status === "pending" ? "Applied" : app.status}</span>
                        : tc >= c.min_credit ? <F action={A.applyToCall} back={back} hidden={{ call: c.id, id: p.id }}><button className="btn ghost sm">Apply with this team</button></F>
                        : <span className="pill warn">{c.min_credit - tc} short</span>}
                    </div>
                  );
                })}
                {own && pending.map((a) => (
                  <F key={a.id} action={A.answerApplication} back={back} hidden={{ application: a.id }} className="stack tight">
                    <span><Link href={`/projects/${a.project_id}`}>{a.name}</Link> <span className="mono muted small">team credit {teamCredit(a.project_id)}</span></span>
                    <textarea name="parts" id={`parts-${a.id}`} placeholder={"8000 | Working booking flow\n9000 | Readers on five benches"} aria-label="Payments" />
                    <span className="small muted">One payment per line: amount | what has to be done first.</span>
                    <div className="row">
                      <button className="btn sm" name="answer" value="accept">Fund it</button>
                      <button className="btn ghost sm" name="answer" value="decline" formNoValidate>Decline</button>
                    </div>
                  </F>
                ))}
                {own && <F action={A.closeCall} back={back} hidden={{ call: c.id }}><button className="linkbtn small">Close this call</button></F>}
              </div>
            );
          })}
          {isAlum && (
            <F action={A.createCall} back={back} className="card stack">
              <h2>Open a funding call</h2>
              <label className="field"><span>Title</span><input type="text" name="title" id="call-title" placeholder="Community utility grant" required /></label>
              <label className="field"><span>What you want to fund</span><input type="text" name="about" id="call-about" placeholder="Anything members would use every week" /></label>
              <div className="row">
                <label className="field"><span>Up to (₹)</span><input type="number" name="amount" id="call-amount" min={1} required style={{ flex: "0 0 140px" }} /></label>
                <label className="field"><span>Team credit needed</span><input type="number" name="min_credit" id="call-min" min={0} defaultValue={300} required style={{ flex: "0 0 140px" }} /></label>
              </div>
              <div><button className="btn">Open call</button></div>
            </F>
          )}
        </div>
        <aside className="stack">
          <h2>Funded now</h2>
          {grants.length === 0 && <div className="note">Nothing funded yet.</div>}
          {grants.map((g) => {
            const gp = parts.filter((x) => x.grant_id === g.id);
            return (
              <div key={g.id} className="card">
                <span className="row between"><Link href={`/projects/${g.project_id}`}>{g.name}</Link><span className="mono">{inr(g.amount)}</span></span>
                <span className="row"><Meter done={gp.filter((x) => x.paid).length} total={gp.length} /><span className="small muted">{gp.filter((x) => x.paid).length} of {gp.length} paid</span></span>
                <span className="small muted">Backed by {users.get(g.alum_id)?.name}</span>
                {g.alum_id === me.id && gp.filter((x) => !x.paid).map((x) => (
                  <F key={x.id} action={A.markPaid} back={back} hidden={{ part: x.id }} className="row between small">
                    <span>{x.title} · {inr(x.amount)}</span><button className="btn ghost sm">Mark paid</button>
                  </F>
                ))}
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}
