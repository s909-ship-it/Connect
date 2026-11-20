import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { splitFlags } from "@/lib/reviewers";
import { auditable } from "@/lib/audits";
import * as A from "../actions";
import { F, Who } from "../ui";
import { CollegeOverview } from "./overview";

export const metadata = { title: "Admin" };

export default async function Admin() {
  const me = await requireMember();
  if (!me.admin) notFound();
  const cid = me.college_id;
  const alumni = all("SELECT * FROM users WHERE role='alum' AND verified=0 AND onboarded=1 AND suspended=0 AND college_id=?", cid);
  const waiting = all("SELECT * FROM users WHERE role='student' AND verified=0 AND onboarded=1 AND suspended=0 AND college_id=? ORDER BY created_at DESC LIMIT 50", cid);
  const students = all("SELECT id, name, branch FROM users WHERE role='student' AND verified=1 AND suspended=0 AND college_id=? ORDER BY name", cid);
  const review = all("SELECT * FROM projects WHERE status='review' AND college_id=?", cid);
  const reports = all("SELECT r.*, u.name by_name FROM reports r JOIN users u ON u.id=r.by_id WHERE r.open=1 AND r.college_id=? ORDER BY r.id DESC", cid);
  const label = (r: { kind: string; target_id: number }) =>
    r.kind === "user" ? all("SELECT name FROM users WHERE id=?", r.target_id)[0]?.name
      : r.kind === "commission" ? all("SELECT title FROM commissions WHERE id=?", r.target_id)[0]?.title
      : all("SELECT name FROM projects WHERE id=?", r.target_id)[0]?.name;
  const hrefOf = (r: { kind: string; target_id: number }) => r.kind === "user" ? `/u/${r.target_id}` : r.kind === "commission" ? `/commissions/${r.target_id}` : `/projects/${r.target_id}`;
  const disputes = all("SELECT * FROM commissions WHERE status='disputed' AND college_id=? ORDER BY id DESC", cid);
  const evidence = all("SELECT e.*, u.name FROM evidence e JOIN users u ON u.id=e.user_id WHERE e.status='pending' AND e.college_id=? AND e.user_id<>? ORDER BY e.created_at", cid, me.id);
  const toAudit = auditable(cid, me.id);
  const flags = splitFlags(cid);
  const nameOf = (id: number) => all("SELECT name FROM users WHERE id=?", id)[0]?.name ?? "Someone";
  const suspended = all("SELECT * FROM users WHERE suspended=1 AND deleted=0 AND college_id=?", cid);
  const clubAsks = all("SELECT c.*, u.name asker FROM clubs c LEFT JOIN users u ON u.id=c.created_by WHERE c.status='pending' AND c.college_id=? ORDER BY c.created_at", cid);
  const fresh = me.super ? (get("SELECT COUNT(*) n FROM feedback WHERE status='new'").n as number) : 0;
  return (
    <>
      <div className="head"><div className="stack tight"><h1>Admin</h1><p>For your community only. Verify members and alumni, register clubs, and clear the review queue. <Link href="/admin/analytics">See analytics</Link>.{me.super ? <> Site admin: <Link href="/admin/colleges">manage communities</Link> or <Link href="/admin/feedback">read feedback{fresh ? ` (${fresh} new)` : ""}</Link>.</> : null} One admin review is enough to ship a project.</p></div></div>
      <CollegeOverview cid={cid} />
      <div className="grid">
        <div className="card">
          <h2>Members not verified</h2>
          <span className="small muted">Most verify themselves with a college or work email. Verify someone here only if you know they belong to your community.</span>
          {waiting.length === 0 && <span className="muted">No one is waiting.</span>}
          {waiting.map((u) => (
            <div key={u.id} className="row between">
              <span className="stack" style={{ gap: 0 }}><Who u={u} /><span className="small muted">{u.branch}, class of {u.grad_year} · {u.email}</span></span>
              <F action={A.verifyStudent} back="/admin" hidden={{ user: u.id }}><button className="btn ghost sm">Verify</button></F>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Alumni waiting</h2>
          {alumni.length === 0 && <span className="muted">No one is waiting.</span>}
          {alumni.map((u) => (
            <div key={u.id} className="row between">
              <span className="stack" style={{ gap: 0 }}><Who u={u} /><span className="small muted">{u.branch}, class of {u.grad_year} · {u.email}</span></span>
              <F action={A.approveAlum} back="/admin" hidden={{ user: u.id }}><button className="btn sm">Approve</button></F>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Projects in review</h2>
          {review.length === 0 && <span className="muted">The queue is empty.</span>}
          {review.map((p) => <Link key={p.id} href={`/projects/${p.id}`}>{p.name}</Link>)}
        </div>
        <div className="card" id="evidence">
          <h2>Evidence to check</h2>
          <span className="small muted">Hackathons and internships members did outside Connect. Open the proof. Verify it only if it shows this person, this event and this result. A rejection lowers their credibility.</span>
          {evidence.length === 0 && <span className="muted">Nothing is waiting.</span>}
          {evidence.map((e) => (
            <div key={e.id} className="stack tight">
              <span><Link href={`/u/${e.user_id}?tab=work`}>{e.name}</Link>: <b>{e.title}</b> <span className="small muted">{e.kind}{e.value ? `, ${e.value.replace("_", " ")}` : ""} · {e.skills}</span></span>
              <span className="row small">
                {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">Proof link ↗</a>}
                {e.file_key && <a href={`/api/files/${e.file_key}`} target="_blank" rel="noopener noreferrer">{e.file_name}</a>}
              </span>
              <F action={A.decideEvidence} back="/admin" hidden={{ evidence: e.id }} className="row">
                <input type="text" name="note" id={`ev-note-${e.id}`} placeholder="Reason, if you reject it" maxLength={200} aria-label="Reason" />
                <button className="btn sm" name="answer" value="verify">Verify</button>
                <button className="btn danger sm" name="answer" value="reject">Reject</button>
              </F>
            </div>
          ))}
        </div>
        <div className="card" id="commissions">
          <h2>Commission disputes</h2>
          {disputes.length === 0 && <span className="muted">No disputes.</span>}
          {disputes.map((d) => (
            <div key={d.id} className="stack" style={{ gap: 0 }}>
              <Link href={`/commissions/${d.id}`}>{d.title}</Link>
              <span className="small muted">{d.dispute_reason}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Credit splits to check</h2>
          <span className="small muted">Someone got at least twice an equal share, but the project&apos;s record shows nothing from them. Nothing changes automatically. Look, and act on the people if it was a favour.</span>
          {flags.length === 0 && <span className="muted">No split looks off.</span>}
          {flags.map((f) => (
            <div key={`${f.project_id}:${f.user_id}`} className="stack" style={{ gap: 0 }}>
              <span><Link href={`/projects/${f.project_id}`}>{f.name}</Link>: <Link href={`/u/${f.user_id}`}>{nameOf(f.user_id)}</Link> got {Math.round(f.share)}% <span className="small muted">(an equal share is {Math.round(f.equal)}%)</span></span>
              <span className="small muted">{f.why}</span>
            </div>
          ))}
        </div>
        <div className="card" id="spot-checks">
          <h2>Spot checks</h2>
          <span className="small muted">Check 2 or 3 a month. Your verdict replaces the reviewers&apos; and decides who reviewed accurately.</span>
          {toAudit.length === 0 && <span className="muted">No projects waiting for spot check.</span>}
          {toAudit.map((p) => (
            <div key={p.id} className="stack tight">
              <span><Link href={`/projects/${p.id}`}>{p.name}</Link> <span className="small muted">· Pot {p.pot}</span></span>
              <F action={A.auditProject} back="/admin" hidden={{ id: p.id }} className="stack tight">
                <div className="row">
                  <select name="verdict" id={`audit-verdict-${p.id}`} defaultValue="" required aria-label="Verdict">
                    <option value="" disabled>Pick verdict</option>
                    <option value="100">Live 100</option>
                    <option value="60">Demo 60</option>
                    <option value="0">Not real 0</option>
                  </select>
                  <input type="text" name="note" id={`audit-note-${p.id}`} placeholder="Note on what you verified (at least 10 chars)" minLength={10} maxLength={300} required aria-label="Audit note" />
                  <button className="btn sm">Record verdict</button>
                </div>
              </F>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Reports</h2>
          <span className="small muted">Uphold a report when it was right: it lowers that person&apos;s credibility for a while. Dismiss it when it was not.</span>
          {reports.length === 0 && <span className="muted">No open reports.</span>}
          {reports.map((r) => (
            <div key={r.id} className="stack tight">
              <span><Link href={hrefOf(r)}>{label(r) ?? "Removed"}</Link> <span className="small muted">{r.kind === "commission" ? "commission, " : ""}reported by {r.by_name}{r.reason_kind === "coursework" ? " as coursework" : ""}</span></span>
              <span className="small">{r.reason}</span>
              <div className="row">
                {r.kind === "commission" ? <span className="small muted">Upholding removes the commission: nobody is paid and the reward is not returned.</span> : r.kind === "user"
                  ? <F action={A.setSuspended} back="/admin" hidden={{ user: r.target_id, on: 1 }} confirm="Suspend this person?"><button className="btn danger sm">Suspend</button></F>
                  : <F action={A.setHidden} back="/admin" hidden={{ id: r.target_id, on: 1 }}><button className="btn danger sm">Hide project</button></F>}
                <F action={A.closeReport} back="/admin" hidden={{ report: r.id, result: "upheld" }}><button className="btn ghost sm">Uphold</button></F>
                {r.kind === "user" && (
                  <F action={A.closeReport} back="/admin" hidden={{ report: r.id, result: "upheld", revoke: "vouches" }}>
                    <button className="btn ghost sm">Uphold and remove their vouches</button>
                  </F>
                )}
                {r.kind === "project" && (
                  <F action={A.closeReport} back="/admin" hidden={{ report: r.id, result: "upheld", revoke: "split" }}>
                    <button className="btn ghost sm">Uphold and reset the split to equal</button>
                  </F>
                )}
                <F action={A.closeReport} back="/admin" hidden={{ report: r.id, result: "dismissed" }}><button className="btn ghost sm">Dismiss</button></F>
              </div>
            </div>
          ))}
          {suspended.length > 0 && <span className="label">Suspended</span>}
          {suspended.map((u) => (
            <div key={u.id} className="row between"><span>{u.name}</span><F action={A.setSuspended} back="/admin" hidden={{ user: u.id, on: 0 }}><button className="btn ghost sm">Restore</button></F></div>
          ))}
        </div>
        <div className="card stack" id="clubs">
          <h2>Clubs waiting for approval</h2>
          <span className="small muted">Every new club needs an admin&rsquo;s yes, even one with a single member. Approve it to put it on the Clubs page; decline it with a reason the person will see.</span>
          {clubAsks.length === 0 && <span className="muted">No clubs waiting.</span>}
          {clubAsks.map((c) => (
            <div key={c.id} className="stack tight club-ask">
              <span className="row between"><span><Link href={`/clubs/${c.id}`}><b>{c.name}</b></Link> <span className="small muted">asked by {c.asker ?? "someone"}</span></span>
                <F action={A.decideClub} back="/admin#clubs" hidden={{ club: c.id, do: "approve" }}><button className="btn sm">Approve</button></F></span>
              {c.about && <span className="small">{c.about}</span>}
              <F action={A.decideClub} back="/admin#clubs" hidden={{ club: c.id, do: "decline" }} className="row">
                <input type="text" name="reason" id={`club-decline-${c.id}`} placeholder="Why it is declined" aria-label={`Why ${c.name} is declined`} minLength={5} maxLength={300} required />
                <button className="btn ghost sm">Decline</button>
              </F>
            </div>
          ))}
        </div>
        <F action={A.createClub} back="/admin" className="card stack">
          <h2>Register a club</h2>
          <input type="text" name="name" id="club-name" placeholder="Club name" required />
          <input type="text" name="about" id="club-about" placeholder="What the club does" />
          <select name="lead" id="club-lead" required defaultValue="">
            <option value="" disabled>Pick the lead</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.branch})</option>)}
          </select>
          <div><button className="btn">Register</button></div>
        </F>
      </div>
    </>
  );
}
