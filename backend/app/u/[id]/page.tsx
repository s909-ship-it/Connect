import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, get, now, type Row } from "@/lib/db";
import { currentUser, standings, skillScores } from "@/lib/auth";
import { canon } from "@/lib/skills";
import { EMPTY } from "@/lib/credit";
import { hireAgain } from "@/lib/commissions";
import { ties, pathTo, type Tie } from "@/lib/graph";
import { resumeFacts } from "@/lib/resume";
import { collegeById, isMember } from "@/lib/college";
import { inviteToProject } from "../../chat-actions";
import { CallButtons } from "../../calls/ui";
import { ShareLink } from "../../messages/media";
import * as A from "../../actions";
import { CopyLink, Count } from "../../client";
import { Av, F, Pill, Stamp, Who, initials, inr, skillsOf, statusLabel } from "../../ui";
import { tierFor } from "@/lib/tiers";
import { TierBadge } from "../../tier-badge";
import { ProgressTab } from "./progress";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; g?: string }> };
const find = (id: number) => get("SELECT * FROM users WHERE id=? AND onboarded=1 AND suspended=0", id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id), u = find(id), me = await currentUser();
  // Same visibility rule as the page: outside their college, only verified students.
  const ok = u && ((u.verified && u.role === "student") || me?.id === id || (me?.verified && me.college_id && me.college_id === u.college_id));
  if (!ok) return { title: "Profile" };
  const s = standings().get(u.id) ?? EMPTY;
  const description = u.role === "alum" ? `${u.name}, class of ${u.grad_year}.` : `${s.earned} credit earned. ${s.shipped} shipped of ${s.joined} joined. Every line signed by teammates.`;
  return { title: u.name, description, openGraph: { title: `${u.name} on Connect`, description } };
}

/* Who this person has worked with, drawn as a small network. */
function Graph({ center, mates }: { center: Row; mates: { u: Row; list: Tie[] }[] }) {
  const W = 560, H = 300, cx = W / 2, cy = H / 2;
  const hue = (id: number) => `hsl(${(id * 67) % 360} 55% 42%)`;
  const nodes = mates.slice(0, 12).map((m, i, a) => {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / a.length;
    return { ...m, x: cx + 215 * Math.cos(t), y: cy + 100 * Math.sin(t) };
  });
  return (
    <div className="tw">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph" role="img" aria-label={`${center.name} has worked with ${mates.length} people`} style={{ width: "100%", minWidth: 420 }}>
        {nodes.map((n) => (
          <line key={n.u.id} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="var(--accent)" strokeOpacity={0.45}
            strokeWidth={1 + n.list.length * 1.5} strokeDasharray={n.list.some((t) => t.shipped) ? undefined : "4 4"} />
        ))}
        <circle cx={cx} cy={cy} r={26} fill={hue(center.id)} stroke="var(--surface)" strokeWidth={3} />
        <text x={cx} y={cy + 5} textAnchor="middle" style={{ fill: "#fff", fontSize: 14, fontWeight: 700 }}>{initials(center.name)}</text>
        {nodes.map((n) => (
          <a key={n.u.id} href={`/u/${n.u.id}`}>
            <title>{n.list.map((t) => `${t.project} (${t.shipped ? "shipped" : "in progress"})`).join(", ")}</title>
            <circle cx={n.x} cy={n.y} r={18} fill={hue(n.u.id)} stroke="var(--surface)" strokeWidth={2} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" style={{ fill: "#fff", fontWeight: 700 }}>{initials(n.u.name)}</text>
            <text x={n.x} y={n.y + 34} textAnchor="middle">{n.u.name.split(" ")[0]} · {n.list.length}</text>
          </a>
        ))}
      </svg>
      <p className="small muted">Thicker lines mean more projects together. Dashed means nothing shipped yet.</p>
    </div>
  );
}

function Links({ u }: { u: Row }) {
  const links = [["GitHub", u.github], ["LinkedIn", u.linkedin], ["Website", u.website]].filter(([, v]) => v) as [string, string][];
  if (!links.length) return null;
  return (
    <span className="row small">
      {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow">{label} ↗</a>)}
    </span>
  );
}

export default async function Profile({ params, searchParams }: Props) {
  const me = await currentUser();
  const id = Number((await params).id);
  const u = find(id);
  // Signed-out visitors can see verified students only. This is the link a student sends to a recruiter.
  // Anyone outside their college sees the same: verified students only.
  const sameCollege = !!me && (me.id === id || (!!me.verified && !!me.college_id && me.college_id === u?.college_id));
  if (!u || (!sameCollege && !(u.verified && u.role === "student"))) notFound();
  const college = collegeById(u.college_id);
  // Message and invite: verified people at the same college, not yourself.
  const canTalk = !!me && me.id !== id && isMember(me) && me.college_id === u.college_id && !!u.verified && !u.deleted;
  const myRoles = canTalk ? all(
    `SELECT r.id, r.title, p.name pname FROM roles r JOIN projects p ON p.id=r.project_id
     WHERE r.open=1 AND p.lead_id=? AND p.college_id=? AND p.status IN ('recruiting','building')
       AND p.id NOT IN (SELECT project_id FROM members WHERE user_id=?) ORDER BY p.name, r.title`, me!.id, me!.college_id, id) : [];
  const viewer = me?.onboarded ? me : null;
  const sp = await searchParams;
  const tab = sp.tab ?? (viewer ? "work" : "resume");
  const back = `/u/${id}?tab=${tab}`;
  const self = viewer?.id === id, alum = u.role === "alum";
  const s = standings().get(id) ?? EMPTY;
  const T = ties();
  const users = new Map(all("SELECT * FROM users").map((x) => [x.id, x]));
  const names = new Map([...users].map(([k, v]) => [k, v.name]));
  const mates = [...(T.get(id) ?? [])].map(([oid, list]) => ({ u: users.get(oid), list }));
  const claims = all("SELECT * FROM claims WHERE user_id=?", id);
  const clubs = all("SELECT c.id, c.name, cm.role FROM club_members cm JOIN clubs c ON c.id=cm.club_id WHERE cm.user_id=? AND cm.confirmed=1 AND c.status='active'", id);
  const projects = all("SELECT p.*, m.role mrole, m.did, m.status mstatus FROM members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND p.hidden=0 ORDER BY p.created_at DESC", id);
  const shippedWithMe = viewer && T.get(viewer.id)?.get(id)?.some((t) => t.shipped);
  const vouched = viewer && !!get("SELECT 1 FROM vouches WHERE from_id=? AND to_id=?", viewer.id, id);
  const skills = skillsOf(u);
  // Outside evidence. Everyone sees what was verified; only the owner sees what is waiting or was rejected.
  const evidence = alum ? [] : all("SELECT e.*, d.name by_name FROM evidence e LEFT JOIN users d ON d.id=e.decided_by WHERE e.user_id=? ORDER BY e.created_at DESC", id)
    .filter((e) => e.status === "verified" || self || (viewer && e.status === "pending" && e.teammate_id === viewer.id));
  const collegeMates = self ? all("SELECT id, name FROM users WHERE college_id=? AND role='student' AND verified=1 AND suspended=0 AND id<>? ORDER BY name", u.college_id, id) : [];
  const checkedBy = (e: Row) => e.method === "admin" ? "Checked by a community admin" : e.method === "teammate" ? `Confirmed by ${e.by_name ?? "a teammate"}` : `Confirmed from a ${String(e.work_email ?? "").split("@")[1] ?? "work"} email`;
  const proven = [...(skillScores().get(id)?.values() ?? [])].sort((a, b) => b.score * (0.5 + b.conf) - a.score * (0.5 + a.conf));
  const listedOnly = skills.filter((k) => !proven.some((x) => x.skill === canon(k)));
  const signedIn = (all("SELECT sub FROM identities WHERE user_id=?", id)).map((r) => String(r.sub).split(":")[0]);
  const ha = !alum ? hireAgain(id) : null;
  const rank = tierFor(s.earned, s.shipped);
  // A private (or admin-hidden) project's name stays inside it: ledger lines about it read "A private project"
  // for anyone who is not on its team or an admin of its community.
  const secret = new Map<number, string>();
  for (const p of all("SELECT p.id, p.name, p.college_id FROM members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND p.hidden<>0", id))
    if (!(viewer && ((viewer.admin && viewer.college_id === p.college_id) || get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", p.id, viewer.id))))
      secret.set(p.id, p.name);
  const label = (what: string, pid?: number) => (pid && secret.has(pid) ? what.replace(secret.get(pid)!, "A private project") : what);

  let body;
  if (alum) {
    const grants = all("SELECT g.*, p.name FROM grants g JOIN projects p ON p.id=g.project_id WHERE g.alum_id=?", id);
    const calls = all("SELECT * FROM calls WHERE alum_id=? AND open=1", id);
    body = (
      <div className="card">
        <h2>Funding</h2>
        {grants.length + calls.length === 0 && <span className="muted">Nothing funded yet.</span>}
        {grants.map((g) => {
          const paid = get("SELECT COALESCE(SUM(amount),0) n FROM grant_parts WHERE grant_id=? AND paid=1", g.id).n;
          return <div key={g.id} className="row between"><Link href={`/projects/${g.project_id}`}>{g.name}</Link><span className="mono">{inr(paid)} paid of {inr(g.amount)}</span></div>;
        })}
        {calls.map((c) => <div key={c.id} className="row between"><span>{c.title} <span className="pill info">Open call</span></span><span className="mono">up to {inr(c.amount)}</span></div>)}
      </div>
    );
  } else if (tab === "progress") {
    body = <ProgressTab s={s} first={u.name.split(" ")[0]} self={self} graph={sp.g === "projects" ? "projects" : "credit"} base={`/u/${id}?tab=progress`} label={label} today={now()} />;
  } else if (tab === "people") {
    body = mates.length ? (
      <div className="card">
        <h2>Everyone {self ? "you have" : `${u.name.split(" ")[0]} has`} worked with</h2>
        <Graph center={u} mates={mates} />
        {mates.map(({ u: o, list }) => (
          <div key={o.id} className="row between">
            <Who u={o} />
            <span className="small muted">{list.map((t) => `${t.project} (${t.shipped ? "shipped" : "in progress"})`).join(", ")}</span>
          </div>
        ))}
      </div>
    ) : <div className="note">No shared projects on record yet.</div>;
  } else if (tab === "resume" && u.anon && !self) {
    // An anonymous person's resume would give them away (it carries their record and, if written by AI, their name).
    body = <div className="card"><h2>{u.name}</h2><p className="muted">This person is anonymous, so their resume is hidden.</p></div>;
  } else if (tab === "resume") {
    const facts = resumeFacts(id);
    body = (
      <div className="card">
        <div className="row between">
          <div className="stack tight"><div><h2>{u.name}</h2><span className="muted">{u.branch}, class of {u.grad_year}</span></div><Links u={u} /></div>
          {self && <div className="row noprint">
            <F action={A.aiResume} back={back}><button className="btn ghost">{u.resume ? "Rewrite with AI" : "Write with AI"}</button></F>
            {u.resume && <F action={A.clearResume} back={back}><button className="linkbtn small">Use plain version</button></F>}
          </div>}
        </div>
        {u.resume ? (
          <>
            <div className="pre">{u.resume}</div>
            <span><Stamp>Written only from {facts.projects.length} signed project{facts.projects.length === 1 ? "" : "s"}</Stamp></span>
          </>
        ) : (
          <>
            <span className="label">Projects</span>
            {facts.projects.length === 0 && <span className="muted">No shipped projects yet.</span>}
            {facts.projects.map((p) => (
              <div key={p.name}>
                <div className="row between"><b>{p.name} · {p.role} · {p.shipped}</b>
                  {p.teammatesWhoSigned > 0 ? <Stamp>Signed by {p.teammatesWhoSigned} teammate{p.teammatesWhoSigned > 1 ? "s" : ""}</Stamp> : <Stamp kind="no">Solo</Stamp>}</div>
                <ul className="plain"><li>{p.did}</li><li>{p.about}</li>{p.proof.length > 0 && <li>Proof: {p.proof.join("; ")}</li>}</ul>
              </div>
            ))}
            {facts.clubs.length > 0 && <><span className="label">Clubs</span><div>{facts.clubs.map((c) => `${c.name}, ${c.role}`).join(" · ")} <span className="muted small">(confirmed by club leads)</span></div></>}
            <span className="label">Skills used in the projects above</span>
            <div className="row">{facts.skills.length ? facts.skills.map((k) => <span key={k} className="chip">{k}</span>) : <span className="muted">None backed by a project yet.</span>}</div>
          </>
        )}
        {claims.length > 0 && <span className="label">Not backed by anything</span>}
        {claims.map((c) => (
          <div key={c.id} className="row between">
            <span className="muted">{c.text}</span>
            <span className="row"><Stamp kind="no">No proof</Stamp>{self && <F action={A.removeClaim} back={back} hidden={{ claim: c.id }}><button className="linkbtn small">Remove</button></F>}</span>
          </div>
        ))}
        {self && (
          <div className="stack tight noprint">
            <F action={A.addClaim} back={back} className="row">
              <input type="text" name="text" id="claim" maxLength={140} placeholder="Add a line yourself, e.g. “Won the state hackathon”" aria-label="Add a resume line" required />
              <button className="btn ghost">Add</button>
            </F>
            <p className="small muted">The AI is only given projects your teammates signed and club roles the lead confirmed. Lines you add yourself always show as “No proof”. Anyone with your profile link can see this page.</p>
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className="card">
          <h2>Credit ledger</h2>
          <div className="tw"><table><tbody>
            {s.ledger.length === 0 && <tr><td className="muted">Nothing yet.</td></tr>}
            {s.ledger.map((l, i) => (
              <tr key={i}><td><b>{label(l.what, l.pid)}</b><br /><span className="small muted">{l.why}</span></td><td className={`n ${l.n < 0 ? "neg" : ""}`}>{l.n > 0 ? "+" : "−"}{Math.abs(l.n)}</td></tr>
            ))}
          </tbody></table></div>
        </div>
        <div className="card">
          <h2>Credibility: {s.cred.score} of 100</h2>
          <span className="small muted">How far {self ? "your" : "their"} word can be trusted. It sets how much {self ? "your" : "their"} vouches, reviews and ratings of others count. <Link href="/rules">How it is worked out</Link></span>
          <div className="tw"><table><tbody>
            {s.cred.lines.map((l, i) => (
              <tr key={i}><td><b>{l.what}</b><br /><span className="small muted">{l.why}</span></td><td className={`n ${l.n < 0 ? "neg" : ""}`}>{l.n < 0 ? "−" : "+"}{Math.abs(l.n)}</td></tr>
            ))}
          </tbody></table></div>
        </div>
        {(evidence.length > 0 || self) && (
          <div className="card" id="evidence">
            <h2>Hackathons and internships</h2>
            <span className="small muted">Things done outside Connect. They count only after someone else checks them, and for half of what a shipped project counts.</span>
            {evidence.length === 0 && <span className="muted">Nothing added yet.</span>}
            {evidence.map((e) => (
              <div key={e.id} className="stack tight">
                <div className="row between">
                  <span><b>{e.title}</b> <span className="small muted">{e.kind === "hackathon" ? (e.value === "won" ? "Hackathon, won" : e.value === "finalist" ? "Hackathon, finalist" : "Hackathon, took part") : "Internship"} · {e.skills}</span></span>
                  {e.status === "verified" ? <Stamp>{checkedBy(e)}</Stamp> : e.status === "rejected" ? <Stamp kind="bad">Not accepted</Stamp> : <Stamp kind="no">Waiting to be checked</Stamp>}
                </div>
                <span className="row small">
                  {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">Proof link ↗</a>}
                  {e.file_key && (self || viewer?.admin || e.teammate_id === viewer?.id) ? <a href={`/api/files/${e.file_key}`} target="_blank" rel="noopener noreferrer">{e.file_name}</a> : null}
                  {e.status === "rejected" && e.note && <span className="muted">Reason: {e.note}</span>}
                </span>
                {self && e.status === "pending" && e.code && (
                  <F action={A.confirmWorkEmail} back={back} hidden={{ evidence: e.id }} className="row">
                    <input type="text" name="code" id={`code-${e.id}`} inputMode="numeric" maxLength={6} placeholder={`Code sent to ${e.work_email}`} aria-label="Code from your work email" required style={{ flex: "0 1 220px" }} />
                    <button className="btn ghost sm">Confirm</button>
                  </F>
                )}
                {!self && viewer && e.status === "pending" && e.teammate_id === viewer.id && (
                  <F action={A.confirmEvidence} back={back} hidden={{ evidence: e.id }} confirm="Confirm you were on this team with them? Your name goes on it.">
                    <button className="btn sm">Yes, I was on that team</button>
                  </F>
                )}
                {self && e.status === "pending" && <F action={A.removeEvidence} back={back} hidden={{ evidence: e.id }}><button className="linkbtn small">Remove</button></F>}
              </div>
            ))}
            {self && (
              <details className="small">
                <summary className="btn ghost sm" style={{ display: "inline-block" }}>Add a hackathon or internship</summary>
                <F action={A.submitEvidence} back={back} className="stack" >
                  <label className="field"><span>What was it?</span>
                    <select name="kind" id="ev-kind" defaultValue="hackathon"><option value="hackathon">Hackathon</option><option value="internship">Internship</option></select></label>
                  <label className="field"><span>Name</span><input type="text" name="title" id="ev-title" maxLength={120} placeholder="Smart India Hackathon 2026, or Firmware intern at Acme" required /></label>
                  <label className="field"><span>Skills it shows</span><input type="text" name="skills" id="ev-skills" maxLength={200} placeholder="Python, ML" required /></label>
                  <label className="field"><span>Proof link</span><input type="url" name="url" id="ev-url" placeholder="Results page or certificate link (https://)" /></label>
                  <label className="field"><span>Or a photo or PDF</span><input type="file" name="file" id="ev-file" accept="image/*,application/pdf" />
                    <small>Up to 5 MB. Only you, the admins and a teammate you name can open it.</small></label>
                  <label className="field"><span>Hackathon: how did it go?</span>
                    <select name="value" id="ev-value" defaultValue="took_part"><option value="took_part">Took part</option><option value="finalist">Finalist</option><option value="won">Won</option></select></label>
                  <label className="field"><span>Hackathon: a teammate on Connect who can confirm it <span className="muted">(optional)</span></span>
                    <select name="teammate" id="ev-mate" defaultValue=""><option value="">No one, ask an admin</option>{collegeMates.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <label className="field"><span>Internship: your work email <span className="muted">(optional)</span></span><input type="email" name="work_email" id="ev-work" placeholder="you@company.com" />
                    <small>We send a code there to confirm it. Otherwise an admin checks your letter.</small></label>
                  <div><button className="btn">Send for checking</button></div>
                  <span className="muted">An item that turns out to be false is rejected and lowers your credibility. Marks and CGPA are not used on Connect.</span>
                </F>
              </details>
            )}
          </div>
        )}
        {projects.map((p) => (
          <Link key={p.id} className="card lift" href={`/projects/${p.id}`}>
            <span className="row between"><b>{p.name}</b>
              {p.mstatus === "left" ? <Stamp kind="bad">Left mid-project</Stamp> : p.status === "dropped" && p.lead_id === id ? <Stamp kind="bad">Dropped it</Stamp> : <Pill status={p.status} />}</span>
            <span className="small muted">{p.mstatus === "left" ? "No contribution recorded" : [p.mrole, p.did].filter(Boolean).join(" — ") || statusLabel(p.status)}</span>
          </Link>
        ))}
      </>
    );
  }

  return (
    <>
      {!me && (
        <div className="strip" style={{ borderRadius: 10 }}><div className="wrap">
          This is a Connect profile. Every project on it was reviewed by outsiders and signed by teammates. <Link href="/rules">How that works</Link>
        </div></div>
      )}
      <div className="card">
        <div className="row" style={{ alignItems: "start" }}>
          <Av u={u} lg />
          <div className="stack tight" style={{ flex: "1 1 240px" }}>
            <span className="row nowrap name-row"><h1>{u.name}</h1>{!alum && u.verified ? (
              <Link href={`/u/${id}?tab=progress`} className={`rank-chip tier-name tier-${rank.tier.id}`} title={`${rank.tier.name}: ${rank.tier.note}`}>
                <TierBadge tier={rank.tier} size={24} /><span>{rank.tier.name}</span>
              </Link>) : null}</span>
            {!alum && u.open_to_join ? <span><span className="pill ok">Open to projects</span></span> : null}
            <span className="muted">{u.branch}, class of {u.grad_year}{alum ? " · alum" : ""}{college ? <> · <Link href={`/c/${college.slug}`}>{college.name}</Link></> : null}</span>
            {u.about && <span>{u.about}</span>}
            {u.anon ? <span className="row nowrap"><span className="pill plain">Anonymous</span>
              {(self || (viewer?.admin && viewer.college_id === u.college_id)) && u.real_name ? <span className="small muted">Real name: {u.real_name} (only {self ? "you and your college's admins" : "admins"} see this)</span> : null}</span> : null}
            {(!u.anon || self) && <Links u={u} />}
            <div className="row">
              {signedIn.includes("google") && <Stamp>Google sign-in</Stamp>}
              {signedIn.includes("linkedin") && <Stamp>LinkedIn sign-in</Stamp>}
              {u.verified ? <Stamp>{alum ? "Alum approved by community admin" : `Verified @${String(u.college_email ?? "").split("@")[1] ?? "community"} email`}</Stamp> : <Stamp kind="no">Not verified</Stamp>}
              {ha && <Stamp>{ha.yes} of {ha.total} clients would hire again</Stamp>}
            </div>
            {viewer && !self && !alum && <span className="small muted">{pathTo(T, viewer.id, id, names)}</span>}
          </div>
          <div className="stack tight noprint profile-actions" style={{ alignItems: "end" }}>
            {canTalk && (
              <span className="row nowrap profile-cta">
                <Link className="btn" href={`/messages/${id}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Message
                </Link>
                <span className="row nowrap profile-calls"><CallButtons to={id} name={u.name} picture={u.picture} /></span>
              </span>
            )}
            {canTalk && !alum && myRoles.length > 0 && (
              <details className="invite-pop">
                <summary className="btn ghost">Invite to project</summary>
                <form action={inviteToProject} className="stack invite-form">
                  <input type="hidden" name="to" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="field"><span>Role</span>
                    <select name="role" id="invite-role" required defaultValue="">
                      <option value="" disabled>Pick an open role</option>
                      {[...new Set(myRoles.map((r) => r.pname))].map((pn) => (
                        <optgroup key={pn} label={pn}>{myRoles.filter((r) => r.pname === pn).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</optgroup>
                      ))}
                    </select></label>
                  <label className="field"><span>Note <span className="muted">(optional)</span></span>
                    <textarea name="note" id="invite-note" rows={2} maxLength={300} placeholder={`Why ${u.name.split(" ")[0]} would be great for it`} /></label>
                  <button className="btn">Send invite</button>
                  <span className="small muted">It arrives as a card in your chat with them.</span>
                </form>
              </details>
            )}
            {self && <Link className="btn ghost sm" href="/onboarding?edit=1">Edit profile</Link>}
            {self && !alum && (
              <F action={A.toggleOpen} back={back}><button className="btn ghost sm">{u.open_to_join ? "Stop showing as open" : "Mark me open to projects"}</button></F>
            )}
            {self && <Link className="small" href="/settings">Settings</Link>}
            {!alum && u.verified ? <span className="row nowrap"><ShareLink path={`/u/${id}?tab=resume`} title={`${u.name} on Connect`} text={self ? "My signed project record on Connect" : `${u.name}'s signed project record on Connect`} label={self ? "Share my profile" : "Share"} /><CopyLink path={`/u/${id}?tab=resume`} label={self ? "Copy resume link" : "Copy link"} /></span> : null}
            {viewer && !self && !alum && viewer.role === "student" && (
              <>
                <F action={A.vouch} back={back} hidden={{ to: id }}><button className="btn" disabled={!shippedWithMe || !!vouched}>{vouched ? "Vouched" : "Vouch"}</button></F>
                <span className="small muted" style={{ maxWidth: "22ch", textAlign: "right" }}>{shippedWithMe ? "One vouch per person, ever." : "Only people who shipped with them can vouch."}</span>
              </>
            )}
          </div>
        </div>
        {!alum && (
          <>
            {s.left > 0 && <div className="alert">Left or dropped {s.left} of {s.joined} projects. Teams see this before accepting a join request.</div>}
            {s.circle && <div className="alert">Closed circle: all of this credit comes from projects with the same {s.mates.size} {s.mates.size === 1 ? "person" : "people"}.</div>}
            {s.ring && <div className="alert">Vouch ring: a small group that only vouches for each other. Their vouches for one another count a quarter.</div>}
          </>
        )}
      </div>
      {!alum && (
        <div className="score-row">
          <div className="card score-card">
            <span className="label">Credit</span>
            <b className="score-big"><Count to={s.earned} /></b>
            <span className="small muted">From {s.shipped} shipped of {s.joined} joined{mates.length ? `, with ${mates.length} ${mates.length === 1 ? "person" : "people"}` : ""}.</span>
            {claims.length > 0 && <span className="small muted">{claims.length} claim{claims.length === 1 ? "" : "s"} with no proof count for nothing.</span>}
          </div>
          <div className="card score-card">
            <span className="label">Credibility</span>
            <b className="score-big">{s.cred.score}<span className="score-of"> / 100</span></b>
            <span className="meter" aria-hidden="true"><b style={{ width: `${s.cred.score}%` }} /></span>
            <span className="small muted">How far their word can be trusted: finishing what they join, reviewing accurately, no upheld reports.</span>
          </div>
          <div className="card score-card">
            <span className="label">Skills, confirmed by others</span>
            {proven.length === 0 && <span className="small muted">No skill confirmed yet. Skills count only when teammates or reviewers confirm them.</span>}
            {proven.slice(0, 3).map((k) => (
              <div key={k.skill} className="score-skill">
                <span className="row between"><span>{k.label}</span><span className="mono small">{k.score}</span></span>
                <span className="meter skillbar" aria-hidden="true"><b style={{ width: `${k.score}%` }} /></span>
              </div>
            ))}
            {proven.length > 3 && <span className="small muted">and {proven.length - 3} more below</span>}
          </div>
        </div>
      )}
      {!alum && (
        <div className="filters">
          {[["work", "Work"], ["progress", "Progress"], ["people", "Worked with"], ["resume", "Resume"]].map(([k, name]) => (
            <Link key={k} href={`/u/${id}?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{name}</Link>
          ))}
        </div>
      )}
      <div className="cols">
        <div className="stack">{body}</div>
        <aside className="stack">
          {clubs.length > 0 && (
            <div className="card">
              <span className="label">Clubs</span>
              {clubs.map((c) => <div key={c.id} className="row between"><Link href={`/clubs/${c.id}`}>{c.name}</Link><span className="small muted">{c.role}</span></div>)}
            </div>
          )}
          {!alum && (proven.length > 0 || skills.length > 0) && (
            <div className="card">
              <span className="label">Skills</span>
              {proven.map((k) => {
                const m = k.last ? Math.floor(Math.max(0, now() - k.last) / (30 * 86400)) : null;
                const recency = m !== null ? (m <= 0 ? "this month" : `last confirmed ${m} ${m === 1 ? "month" : "months"} ago`) : null;
                return (
                  <div key={k.skill} className="stack" style={{ gap: 2 }}>
                    <div className="row between"><b>{k.label}</b><span className="mono"><b>{k.score}</b><span className="muted small"> / 100</span></span></div>
                    <span className="meter skillbar" aria-hidden="true"><b style={{ width: `${k.score}%` }} /></span>
                    <span className="small muted">{k.band} confidence · {k.why}{recency ? ` · ${recency}` : ""}</span>
                  </div>
                );
              })}
              {proven.length > 0 && <span className="small muted">Scores come only from work other people confirmed. <Link href="/rules">How they are worked out</Link></span>}
              {listedOnly.length > 0 && (
                <>
                  <span className="label">Listed, not confirmed by anyone</span>
                  <div className="row">{listedOnly.map((k) => <span key={k} className="chip">{k}</span>)}<Stamp kind="no">No proof</Stamp></div>
                </>
              )}
            </div>
          )}
          {!me && <div className="card"><h3>Are you a member here?</h3><p className="small muted">Join your community on Connect and build a record like this one.</p><Link className="btn" href="/signin">Sign in</Link></div>}
          {viewer && !self && viewer.verified ? (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>Report this profile</summary>
              <F action={A.report} back={back} hidden={{ kind: "user", target: id }} className="stack tight" >
                <input type="text" name="reason" id="report-reason" aria-label="What is wrong" placeholder="What is wrong?" maxLength={300} required />
                <button className="btn ghost sm">Send to admins</button>
              </F>
            </details>
          ) : null}
        </aside>
      </div>
    </>
  );
}
