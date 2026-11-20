import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, now } from "@/lib/db";
import { currentUser, requireMember, standings, skillScores } from "@/lib/auth";
import { EMPTY, RULES, projectShares } from "@/lib/credit";
import { timeAgo } from "@/lib/notify";
import { needsFor, rank, type Person } from "@/lib/relevance";
import { confirmedSkills, label as skillLabel } from "@/lib/skills";
import { skillsOf } from "../../ui";
import * as A from "../../actions";
import { JoinAsk, SplitForm } from "../../client";
import { ProofCheck } from "./proof-check";
import { unreadTeam } from "@/lib/teamchat";
import { callStatus } from "@/lib/teamspace";
import { imageAiOn } from "@/lib/aiimage";
import { aiProjectImage } from "../../identity-actions";
import { ProjectImageUpload } from "../../identity-ui";
import "./team.css";
import { ShareLink } from "../../messages/media";
import { toggleFollow } from "../../follow";
import { noteView } from "@/lib/feed";
import { F, Meter, PIcon, Pill, Stamp, UserLink, Who, inr, monthYear } from "../../ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  const p = me?.verified ? get("SELECT name, pitch FROM projects WHERE id=? AND hidden=0 AND college_id=?", Number((await params).id), me.college_id) : null;
  return p ? { title: p.name, description: p.pitch } : { title: "Project" };
}

export default async function Project({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  // Projects are only visible inside their own college.
  const p = get("SELECT * FROM projects WHERE id=? AND college_id=?", id, me.college_id);
  if (!p) notFound();
  const back = `/projects/${id}`;
  const college = String(get("SELECT name FROM colleges WHERE id=?", me.college_id)?.name ?? "your community");
  const S = standings();

  const team = all("SELECT m.role mrole, m.did, m.status mstatus, m.stake, u.* FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.rowid", id);
  const active = team.filter((t) => t.mstatus === "active");
  const mine = team.find((t) => t.id === me.id);
  // Hidden by an admin (1) or private to the team (2): only the team and admins, plus anyone the lead invited to a private one.
  const iWasInvited = p.hidden === 2 && !!get("SELECT 1 FROM messages WHERE kind='invite' AND project_id=? AND to_id=?", id, me.id);
  if (p.hidden && !mine && !me.admin && !iWasInvited) notFound();
  if (!mine) noteView(me.id, id); // teaches this person's For you order; private to them
  const comments = all("SELECT c.*, u.name, u.picture, u.id uid FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id=? ORDER BY c.created_at, c.id", id);
  const updates = all("SELECT up.*, u.name uname FROM updates up LEFT JOIN users u ON u.id=up.user_id WHERE up.project_id=? ORDER BY up.created_at DESC, up.id DESC LIMIT 30", id);
  const onTeam = mine?.mstatus === "active";
  const following = !!get("SELECT 1 FROM follows WHERE project_id=? AND user_id=?", id, me.id);
  const followers = get("SELECT COUNT(*) n FROM follows WHERE project_id=?", id).n as number;
  const lead = p.lead_id === me.id;
  const open = p.status === "recruiting" || p.status === "building";
  const shipped = p.status === "shipped";

  const roles = all("SELECT * FROM roles WHERE project_id=? AND open=1", id);
  // For the lead: people who might fit each open role, best proof first.
  const invited = new Set<string>(lead ? all("SELECT user_id, text FROM notifications WHERE href=? AND text LIKE '%invited you%'", `/projects/${id}`)
    .map((nn) => `${nn.user_id}:${nn.text}`) : []);
  const asked = new Set<number>(all("SELECT user_id FROM requests WHERE project_id=?", id).map((q) => q.user_id));
  // Ranked by confirmed skills for what the role needs, finishing record and free time. Each one says why.
  const K = lead ? skillScores() : new Map();
  const loads = new Map<number, number>(lead ? all("SELECT m.user_id, COUNT(*) n FROM members m JOIN projects p ON p.id=m.project_id WHERE m.status='active' AND p.status IN ('recruiting','building','review') GROUP BY m.user_id").map((r) => [r.user_id, r.n]) : []);
  const pool: (Person & { u: (typeof team)[number] })[] = lead ? all("SELECT * FROM users WHERE role='student' AND verified=1 AND suspended=0 AND onboarded=1 AND college_id=?", me.college_id)
    .filter((u) => !team.some((t) => t.id === u.id) && !asked.has(u.id))
    .map((u) => {
      const st = S.get(u.id) ?? EMPTY;
      const mate = active.find((t) => st.mates.has(t.id));
      return { u, id: u.id, skills: K.get(u.id), listed: skillsOf(u), finishRate: st.cred.finishRate, finished: st.shipped, ended: st.shipped + st.left,
        open: !!u.open_to_join, load: loads.get(u.id) ?? 0, shippedWith: mate ? `with ${mate.name.split(" ")[0]} before` : undefined };
    }) : [];
  const roleNeeds = new Map(roles.map((r) => [r.id, needsFor(r.title, all("SELECT skill, importance FROM role_skills WHERE role_id=? ORDER BY importance DESC, rowid", r.id) as { skill: string; importance: number }[])]));
  const fits = new Map(roles.map((r) => {
    const { ranked, fresh } = rank(roleNeeds.get(r.id)!, r.title, pool);
    const withUser = (l: typeof ranked) => l.map((sg) => ({ ...sg, u: pool.find((x) => x.id === sg.id)!.u }));
    return [r.id, { ranked: withUser(ranked), fresh: withUser(fresh) }];
  }));
  const myRequest = get("SELECT * FROM requests WHERE project_id=? AND user_id=?", id, me.id);
  const requests = lead ? all("SELECT u.*, q.id rid, q.note pitch, r.title FROM requests q JOIN roles r ON r.id=q.role_id JOIN users u ON u.id=q.user_id WHERE q.project_id=? AND q.status='pending'", id) : [];
  const proofs = all("SELECT * FROM proofs WHERE project_id=?", id);
  const ms = all("SELECT * FROM milestones WHERE project_id=?", id);
  const done = ms.filter((m) => m.done).length;
  const reviews = all("SELECT reviewer_id FROM reviews WHERE project_id=?", id);
  const grant = get("SELECT g.*, u.name alum_name, u.grad_year FROM grants g JOIN users u ON u.id=g.alum_id WHERE g.project_id=?", id);
  const parts = grant ? all("SELECT * FROM grant_parts WHERE grant_id=?", grant.id) : [];
  const sh = shipped ? projectShares(id) : new Map<number, number>();
  const solo = active.length === 1;
  const myAllocs = new Map(all("SELECT to_id, pct FROM allocations WHERE project_id=? AND from_id=?", id, me.id).map((a) => [a.to_id, a.pct]));
  const myVotes = new Set(all("SELECT target_id FROM gone_votes WHERE project_id=? AND voter_id=?", id, me.id).map((v) => v.target_id));
  const invites = all("SELECT reviewer_id FROM review_invites WHERE project_id=?", id).map((r) => r.reviewer_id as number);
  const canReview = p.status === "review" && !mine && me.verified
    && (me.admin || (p.invited_at ? invites.includes(me.id) : (S.get(me.id)?.earned ?? 0) >= RULES.reviewerMin));
  const live = p.live_url ? get("SELECT * FROM live_checks WHERE project_id=? AND url=? ORDER BY id DESC LIMIT 1", id, p.live_url) : null;
  // The AI proof check: the team (before review), its reviewers and admins. Same rule as runProofCheck.
  const proofCheck = p.status !== "dropped" && (onTeam || canReview || !!me.admin);
  const iReviewed = reviews.some((r) => r.reviewer_id === me.id);
  const lastMove = get("SELECT MAX(created_at) t FROM updates WHERE project_id=?", id)?.t ?? p.created_at;
  const quietDays = Math.floor((now() - lastMove) / 86400);
  // Skills: the project's list, who ticked what, and what counts for each person so far.
  const pskills = all("SELECT skill FROM project_skills WHERE project_id=? ORDER BY rowid", id).map((r) => r.skill as string);
  const ticks = all("SELECT * FROM member_skills WHERE project_id=?", id);
  const reviewerIds = new Set<number>([...reviews.map((r) => r.reviewer_id as number), ...all("SELECT reviewer_id FROM review_log WHERE project_id=?", id).map((r) => r.reviewer_id as number)]);
  const adminIds = new Set<number>(all("SELECT id FROM users WHERE admin=1 AND college_id=?", me.college_id).map((r) => r.id as number));
  const confirmed = shipped ? confirmedSkills(active.map((t) => t.id as number), ticks, reviewerIds, adminIds) : new Map<number, Map<string, number[]>>();
  const myTicks = new Set(ticks.filter((x) => x.by_id === me.id).map((x) => `${x.user_id}:${x.skill}`));
  const legacy = shipped && (p.shipped_at ?? 0) < RULES.cutover;
  const canSetSkills = (lead && open) || (legacy && onTeam && pskills.length === 0);
  const canTick = shipped && pskills.length > 0 && ((onTeam && !solo) || (!!me.admin && solo && !onTeam));
  const missing = [
    !pskills.length && "the skills it used",
    !proofs.length && "a proof link",
    done < ms.length && "every milestone ticked",
    active.some((t) => !t.did) && "each teammate's “what I did”",
  ].filter(Boolean);

  return (
    <>
      <Link href="/">← All projects</Link>
      {onTeam && open && quietDays >= 14 && (
        <div className="note quiet-note">
          Nothing has moved here for {quietDays} days. Projects that go quiet lose their people. <a href="#update-text">Post what moved</a>, even if it is small, or tick a milestone.
        </div>
      )}
      <div className="head">
        <div className="stack tight">
          <div className="row"><PIcon id={p.id} name={p.name} image={p.image} lg /><h1>{p.name}</h1><Pill status={p.status} />
            <ShareLink path={`/projects/${id}`} title={`${p.name} on Connect`} text={p.status === "shipped" ? `${p.name}: shipped and reviewed on Connect` : `${p.name} is looking for people on Connect`} />
            {!onTeam && !p.hidden && (
              <form action={toggleFollow}>
                <input type="hidden" name="id" value={id} />
                <button className={`btn sm ${following ? "ghost" : ""}`} aria-pressed={following}>{following ? "Following" : "Follow"}</button>
              </form>
            )}
            {followers > 0 && <span className="small muted">{followers} following</span>}</div>
          <p>{p.pitch}</p>
          {lead && open && (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>Edit name and description</summary>
              <F action={A.editProject} back={back} hidden={{ id }} className="stack tight" >
                <input type="text" name="name" id="edit-name" defaultValue={p.name} maxLength={60} required aria-label="Project name" />
                <input type="text" name="pitch" id="edit-pitch" defaultValue={p.pitch} maxLength={300} required aria-label="What it does" />
                <div><button className="btn ghost sm">Save</button></div>
              </F>
            </details>
          )}
          {onTeam && p.status !== "dropped" && (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>Project image</summary>
              <div className="stack tight pimg-edit">
                <span className="muted">{p.image ? "Your team's own image." : "Right now a cover drawn from the project's name. Upload your own image, or let AI make one from the name and pitch."}</span>
                <ProjectImageUpload id={id} hasOwn={!!p.image} />
                {imageAiOn() ? (
                  <F action={aiProjectImage} back={back} hidden={{ id }}><button className="btn ghost sm">Make one with AI</button></F>
                ) : <span className="muted">AI-made images are not switched on for this site yet.</span>}
              </div>
            </details>
          )}
          <span className="small muted mono">{shipped ? `Shipped ${monthYear(p.shipped_at)}` : `Started ${monthYear(p.created_at)}`}</span>
        </div>
      </div>

      <div className="cols">
        <div className="stack">
          {p.hidden === 1 ? <div className="alert">Hidden by an admin. Only the team and admins can see this project.</div> : null}
          {p.hidden === 2 && !lead && <div className="note">Private. Only the team{iWasInvited ? ", people the lead invited" : ""} and your community&rsquo;s admins can see this project.</div>}
          {lead && open && p.hidden !== 1 && (
            <F action={A.setVisibility} back={back} hidden={{ id }} className="card stack tight vis-card">
              <fieldset className="choice">
                <legend className="label">Who can see this project</legend>
                <label><input type="radio" name="visibility" value="public" defaultChecked={p.hidden !== 2} /><span>Everyone at {college}</span></label>
                <label><input type="radio" name="visibility" value="private" defaultChecked={p.hidden === 2} /><span>Only the team</span></label>
              </fieldset>
              <span className="small muted">{p.hidden === 2
                ? "Private: it is not on the board, in search or on anyone's profile. People you invite to a role can still open it. It becomes public when you send it for review, so reviewers can see it."
                : "Public: it is on your community's board, and anyone there can follow it or ask to join."}</span>
              <div><button className="btn ghost sm">Save</button></div>
            </F>
          )}
          {p.status === "dropped" && <div className="alert">Dropped by its lead before it shipped. This stays on the lead&apos;s profile.</div>}

          {p.status === "review" && (
            <div className="card">
              <h2>In review</h2>
              <p className="muted">{reviews.length} of {RULES.reviewsNeeded} reviews in. {p.invited_at
                ? (invites.length >= RULES.reviewsNeeded
                  ? `Connect picked ${invites.length} reviewers with ${RULES.reviewerMin}+ credit who have never been on a team with anyone here.`
                  : "Too few people outside this team's circle can review it, so an admin of the community decides.")
                : `Reviewers are people outside the team with ${RULES.reviewerMin}+ credit.`} Two matching verdicts settle it. If they disagree, a third decides and the middle verdict wins.</p>
              {p.live_url && (
                <div className="row between small">
                  <span>Live link: <a href={p.live_url} target="_blank" rel="noopener noreferrer nofollow">{p.live_url} ↗</a> {live ? <Stamp kind={live.ok ? undefined : "bad"}>{live.ok ? "Up" : live.note} · checked {timeAgo(live.created_at)}</Stamp> : <Stamp kind="no">Not checked yet</Stamp>}</span>
                  {canReview && <F action={A.checkLiveNow} back={back} hidden={{ id }}><button className="linkbtn small">Check again</button></F>}
                </div>
              )}
              {p.status === "review" && !canReview && !mine && <span className="small muted">You were not picked to review this one. Reviewers are chosen by Connect, not by the team.</span>}
              {canReview && <span className="small"><a href="#proof-check">Read the AI proof check</a> before you decide.</span>}
              {canReview && (
                <F action={A.reviewProject} back={back} hidden={{ id }} className="stack tight">
                  <textarea name="note" id="review-note" maxLength={400} placeholder="A note for the team: what you checked, and what is missing if it is not ready. Shown without your name." style={{ minHeight: 70 }} />
                  {solo && pskills.length > 0 && (
                    <fieldset className="ticks">
                      <legend className="small muted">This is a solo project, so nobody on a team can say which skills it took. Tick the ones the proof actually shows.</legend>
                      {pskills.map((k) => <label key={k} className="tick"><input type="checkbox" name="skills" value={k} /> {skillLabel(k)}</label>)}
                    </fieldset>
                  )}
                  <div className="row">
                    <button className="btn" name="verdict" value={RULES.live}>Live and in use</button>
                    <button className="btn ghost" name="verdict" value={RULES.demo}>Works, demo only</button>
                    <button className="btn danger" name="verdict" value={0}>Not ready</button>
                  </div>
                </F>
              )}
              {iReviewed && <span className="small muted">You have reviewed this. Picking again replaces your verdict.</span>}
            </div>
          )}
          {p.status === "review" && proofCheck && <ProofCheck projectId={id} canRun />}

          {onTeam && (() => {
            const fresh = unreadTeam(id, me.id);
            const lastMsg = get("SELECT t.text, t.kind, u.name FROM team_messages t LEFT JOIN users u ON u.id=t.user_id WHERE t.project_id=? ORDER BY t.id DESC LIMIT 1", id);
            const openTasks = get("SELECT COUNT(*) n FROM team_tasks WHERE project_id=? AND status<>'done'", id)?.n ?? 0;
            const pages = get("SELECT COUNT(*) n FROM team_notes WHERE project_id=? AND deleted_at IS NULL", id)?.n ?? 0;
            const starred = all("SELECT id, title, icon FROM team_notes WHERE project_id=? AND deleted_at IS NULL AND important=1 ORDER BY updated_at DESC LIMIT 3", id);
            const live = callStatus(id);
            return (
              <div className="card team-chat-card">
                <span className="row between nowrap">
                  <span className="row nowrap"><h2>Team space</h2>{live && <span className="pill ok">● Call on now</span>}</span>
                  <Link className="btn sm" href={`/projects/${id}/chat`}>{live ? "Join" : "Open"}</Link>
                </span>
                <span className="small muted ellipsis">{lastMsg ? (lastMsg.kind === "system" ? lastMsg.text : `${lastMsg.name ?? "Someone"}: ${lastMsg.kind === "image" ? (lastMsg.text || "Photo") : lastMsg.text}`)
                  : "Only the team can see it: a group chat with everyone's role, team calls, pinned messages, notes and a task board."}</span>
                <span className="row team-space-links">
                  <Link href={`/projects/${id}/chat`}>Chat{fresh > 0 && <span className="pill info">{fresh} new</span>}</Link>
                  <Link href={`/projects/${id}/notes`}>Notes <span className="muted">{pages}</span></Link>
                  <Link href={`/projects/${id}/tasks`}>Tasks <span className="muted">{openTasks} open</span></Link>
                </span>
                {starred.length > 0 && (
                  <span className="row team-space-links">{starred.map((n) => <Link key={n.id} href={`/projects/${id}/notes/${n.id}`}>★ {n.icon} {n.title || "Untitled"}</Link>)}</span>
                )}
              </div>
            );
          })()}

          <div className="card">
            <h2>Team</h2>
            <div className="tw"><table className="stack-sm"><tbody>
              <tr><th>Who</th><th>Role</th><th>What they did</th>{shipped && <><th className="n">Share</th><th className="n">Credit</th></>}{open && onTeam && <th />}</tr>
              {team.map((t) => {
                const gone = t.mstatus === "left";
                const pct = sh.get(t.id) ?? 0;
                return (
                  <tr key={t.id}>
                    <td><Who u={t} /></td>
                    <td data-label="Role">{gone ? <Stamp kind="bad">Left mid-project</Stamp> : t.mrole}</td>
                    <td className={`wide ${t.did ? "" : "muted"}`}>{gone ? (t.stake ? `Stake of ${t.stake} lost` : "") : t.did || "Not written yet"}
                      {shipped && !gone && (confirmed.get(t.id)?.size ?? 0) > 0 && (
                        <span className="row" style={{ marginTop: 4 }}>{[...confirmed.get(t.id)!.keys()].map((k) => <span key={k} className="chip ok">{skillLabel(k)}</span>)}</span>
                      )}</td>
                    {shipped && <><td className="n" data-label="Share">{gone ? "0%" : `${Math.round(pct)}%`}</td>
                      <td className="n" data-label="Credit">{gone ? (t.stake ? `−${t.stake}` : "0") : `+${Math.round(p.pot * pct / 100 * (solo ? RULES.soloFactor : 1))}`}</td></>}
                    {open && onTeam && <td className="n">
                      {!gone && t.id !== me.id && t.id !== p.lead_id && (myVotes.has(t.id) ? <span className="small muted">Marked</span>
                        : <F action={A.voteGone} back={back} hidden={{ id, target: t.id }} confirm={`Mark ${t.name.split(" ")[0]} as gone?`}><button className="linkbtn small">Mark as gone</button></F>)}
                    </td>}
                  </tr>
                );
              })}
            </tbody></table></div>
            {shipped && <p className="small muted">{solo ? "Solo projects have no teammates to sign, so they earn half the pot."
              : `Pot of ${p.pot}. Shares are the middle value of what each teammate gave the others. Nobody sets their own.`}</p>}
          </div>

          {onTeam && !shipped && p.status !== "dropped" && (
            <F action={A.saveContribution} back={back} hidden={{ id }} className="card">
              <h2>Your part</h2>
              <div className="row">
                <input type="text" name="role" id="role" defaultValue={mine.mrole} placeholder="Your role" style={{ flex: "0 1 180px" }} />
                <input type="text" name="did" id="did" defaultValue={mine.did} placeholder="What you built, in one line" maxLength={200} />
                <button className="btn ghost">Save</button>
              </div>
              <span className="small muted">Your teammates see this when they split the credit. It becomes a line on your resume.</span>
            </F>
          )}

          {shipped && onTeam && !solo && (
            <SplitForm action={A.allocate} back={back} id={id} saved={myAllocs.size > 0}
              mates={active.filter((t) => t.id !== me.id).map((t) => ({ id: t.id, name: t.name, did: t.did, pct: myAllocs.get(t.id) ?? Math.round(100 / (active.length - 1)) }))} />
          )}

          {canTick && (
            <F action={A.tickSkills} back={back} hidden={{ id }} className="card">
              <h2>{solo ? "Admin: confirm the skills this took" : "Which skills did each teammate use?"}</h2>
              <p className="small muted">{solo ? "A solo project has no teammates to confirm skills. Tick only what the proof shows."
                : "Tick only what you saw them do. A skill counts for someone once half of their teammates have ticked it, and it feeds their skill score. You are not on your own list."}</p>
              {active.filter((t) => t.id !== me.id).map((t) => (
                <fieldset key={t.id} className="ticks">
                  <legend><b>{t.name}</b> <span className="small muted">{t.did}</span></legend>
                  {pskills.map((k) => <label key={k} className="tick"><input type="checkbox" name={`sk_${t.id}`} value={k} defaultChecked={myTicks.has(`${t.id}:${k}`)} /> {skillLabel(k)}</label>)}
                </fieldset>
              ))}
              <div><button className="btn">{myTicks.size ? "Update" : "Save"}</button></div>
            </F>
          )}
          {shipped && onTeam && pskills.length === 0 && <div className="note">This project shipped before Connect tracked skills. Add the skills it used (on the right), then tick what each teammate did, so it counts towards everyone&apos;s skill scores.</div>}

          {(roles.length > 0 || (lead && open)) && (
            <div className="card">
              <h2>Open roles</h2>
              {roles.map((r) => (
                <div key={r.id} className="row between">
                  <div className="stack" style={{ gap: 2 }}><b>{r.title}</b>{r.note && <span className="small muted">{r.note}</span>}</div>
                  {lead ? <F action={A.closeRole} back={back} hidden={{ role: r.id }}><button className="btn ghost sm">Close role</button></F>
                    : mine ? <span className="small muted">{onTeam ? "You are on this team" : "You left this project"}</span>
                    : myRequest?.status === "pending" ? (myRequest.role_id === r.id
                        ? <F action={A.withdrawRequest} back={back} hidden={{ id }}><button className="btn ghost">Withdraw request</button></F> : null)
                    : myRequest ? <span className="small muted">Your request was declined</span>
                    : me.role === "student" ? <JoinAsk action={A.requestJoin} back={back} role={r.id} stake={RULES.stake} title={r.title} /> : null}
                  {lead && (
                    <div className="suggest">
                      <F action={A.setRoleSkills} back={back} hidden={{ role: r.id }} className="row">
                        <input type="text" name="skills" id={`role-skills-${r.id}`} maxLength={200} placeholder="Skills this role needs, most important first"
                          defaultValue={roleNeeds.get(r.id)!.mode === "all" ? roleNeeds.get(r.id)!.list.map((x) => skillLabel(x.skill)).join(", ") : ""} aria-label={`Skills needed for ${r.title}`} />
                        <button className="btn ghost sm">Save</button>
                      </F>
                      {roleNeeds.get(r.id)!.mode === "any" && <span className="small muted">No skills listed, so suggestions are guessed from the role&apos;s name.</span>}
                      {(["ranked", "fresh"] as const).map((kind) => fits.get(r.id)![kind].length > 0 && (
                        <div key={kind} className="stack tight">
                          <span className="label">{kind === "ranked" ? "People who fit, best first" : "New here, no proof yet"}</span>
                          {fits.get(r.id)![kind].map((sg) => {
                            const done = [...invited].some((k) => k.startsWith(`${sg.id}:`) && k.includes(r.title));
                            return (
                              <div key={sg.id} className="row between">
                                <span className="stack" style={{ gap: 0 }}>
                                  <Who u={sg.u} />
                                  <span className="small muted">{sg.reason}</span>
                                </span>
                                {done ? <span className="small muted">Invited</span>
                                  : <F action={A.inviteToRole} back={back} hidden={{ role: r.id, to: sg.id }}><button className="btn ghost sm">Invite to apply</button></F>}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {fits.get(r.id)!.ranked.length + fits.get(r.id)!.fresh.length === 0 && <span className="small muted">Nobody in your community has confirmed work in these skills yet.</span>}
                    </div>
                  )}
                </div>
              ))}
              {!lead && roles.length > 0 && <p className="small muted">Joining holds {RULES.stake} of your credit. You get it back when the project ships. If you leave or the team marks you as gone, you lose it.</p>}
              {lead && open && (
                <F action={A.addRole} back={back} hidden={{ id }} className="row">
                  <input type="text" name="title" id="role-title" placeholder="Role, e.g. Backend (Node)" required />
                  <input type="text" name="skills" id="role-skills" placeholder="Skills, most important first" maxLength={200} />
                  <input type="text" name="note" id="role-note" placeholder="Note (optional)" />
                  <button className="btn ghost">Add role</button>
                </F>
              )}
            </div>
          )}

          {requests.length > 0 && (
            <div className="card" id="requests">
              <h2>Join requests</h2>
              {requests.map((u) => {
                const s = S.get(u.id) ?? EMPTY;
                return (
                  <div key={u.rid} className="row between">
                    <div className="stack" style={{ gap: 2 }}>
                      <span><UserLink u={u} /> <span className="muted small">for {u.title}</span></span>
                      <span className="small mono muted">{s.earned} credit · {s.shipped} shipped of {s.joined} joined{s.left ? <span className="neg"> · left {s.left}</span> : null}</span>
                      {u.pitch ? <span className="pitch">{u.pitch}</span> : <span className="small muted">No note.</span>}
                    </div>
                    <div className="row">
                      <F action={A.answerRequest} back={back} hidden={{ request: u.rid, answer: "accept" }}><button className="btn sm">Accept</button></F>
                      <F action={A.answerRequest} back={back} hidden={{ request: u.rid, answer: "decline" }}><button className="btn ghost sm">Decline</button></F>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lead && open && (
            <div className="card">
              <h2>Ship it</h2>
              {missing.length ? <p className="muted">Before review you still need: {missing.join(", ")}.</p>
                : <p className="muted">Everything is in place. Connect picks reviewers who have never worked with anyone on the team. They open your proof and decide what it is worth.</p>}
              <div className="row">
                <F action={A.submitForReview} back={back} hidden={{ id }}><button className="btn" disabled={missing.length > 0}>Send for review</button></F>
                <F action={A.dropProject} back={back} hidden={{ id }} confirm="Drop this project for good?"><button className="btn danger">Drop project · lose {RULES.stake}</button></F>
              </div>
            </div>
          )}
          {onTeam && !lead && open && (
            <F action={A.leaveProject} back={back} hidden={{ id }} confirm="Leave this project?"><button className="btn danger sm">Leave project{mine.stake ? ` · lose your ${mine.stake} stake` : ""}</button></F>
          )}
          {p.status !== "review" && proofCheck && <ProofCheck projectId={id} canRun />}

          <div className="card" id="questions">
            <h2>Questions</h2>
            <p className="small muted">Ask the team anything before you join. The team&apos;s answers are marked.</p>
            {comments.length === 0 && <span className="small muted">No questions yet.</span>}
            <div className="stack tight">
              {comments.map((c) => {
                const fromTeam = active.some((t) => t.id === c.uid);
                return (
                  <div key={c.id} className={`comment ${fromTeam ? "team" : ""}`}>
                    <div className="row between">
                      <span className="row nowrap"><Who u={{ id: c.uid, name: c.name, picture: c.picture }} />{fromTeam && <span className="pill info">Team</span>}</span>
                      <span className="row small muted">{timeAgo(c.created_at)}
                        {(c.uid === me.id || me.admin) ? <F action={A.deleteComment} back={back} hidden={{ comment: c.id }} confirm="Delete this?"><button className="linkbtn small">Delete</button></F> : null}</span>
                    </div>
                    <p className="pre">{c.text}</p>
                  </div>
                );
              })}
            </div>
            {me.verified && p.status !== "dropped" ? (
              <F action={A.postComment} back={back} hidden={{ id }} className="row">
                <input type="text" name="text" id="comment-text" maxLength={500} aria-label={onTeam ? "Answer or note" : "Your question"} placeholder={onTeam ? "Answer or add a note" : "Ask the team a question"} required />
                <button className="btn ghost">Post</button>
              </F>
            ) : null}
          </div>

          <div className="card">
            <h2>Updates</h2>
            {onTeam && p.status !== "dropped" && (
              <F action={A.postUpdate} back={back} hidden={{ id }} className="row">
                <input type="text" name="text" id="update-text" aria-label="Project update" maxLength={280} placeholder="What moved this week?" required />
                <button className="btn ghost">Post</button>
              </F>
            )}
            {updates.length === 0 && <span className="small muted">No updates yet.</span>}
            <div className="feed">
              {updates.map((x) => (
                <div key={x.id} className={`item ${x.kind === "post" ? "post" : x.text.startsWith("Shipped") ? "ship" : ""}`}>
                  <span className="dot" />
                  <span>{x.kind === "post" && <b>{x.uname}: </b>}{x.text} <span className="muted small">· {timeAgo(x.created_at)}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <span className="label">Proof</span>
            {proofs.length === 0 && <span className="small muted">Nothing linked yet.</span>}
            {proofs.map((x) => (
              <div key={x.id} className="row between small">
                <a href={x.url} target="_blank" rel="noopener noreferrer nofollow">{x.label} ↗</a>
                {onTeam && open && <F action={A.removeProof} back={back} hidden={{ proof: x.id }}><button className="linkbtn small">Remove</button></F>}
              </div>
            ))}
            {shipped && <span><Stamp>Reviewed · pot {p.pot}</Stamp></span>}
            {p.live_url && p.status !== "review" && (
              <div className="row between small">
                <a href={p.live_url} target="_blank" rel="noopener noreferrer nofollow">Live link ↗</a>
                {live ? <Stamp kind={live.ok ? undefined : "bad"}>{live.ok ? "Up" : "Down"} · {timeAgo(live.created_at)}</Stamp> : <span className="muted">Checked at review</span>}
              </div>
            )}
            {onTeam && open && (
              <F action={A.setLiveUrl} back={back} hidden={{ id }} className="stack tight">
                <input type="url" name="url" id="live-url" defaultValue={p.live_url ?? ""} placeholder="Live link Connect should open (https://)" aria-label="Live link" />
                <button className="btn ghost sm">Save live link</button>
                <span className="small muted">Optional. Connect opens it when you send the project for review and tells reviewers whether it answered.</span>
              </F>
            )}
            {onTeam && open && (
              <F action={A.addProof} back={back} hidden={{ id }} className="stack tight">
                <input type="text" name="label" id="proof-label" placeholder="Live site, repo, demo video…" required />
                <input type="url" name="url" id="proof-url" placeholder="https://" required />
                <button className="btn ghost sm">Add proof</button>
              </F>
            )}
          </div>

          <div className="card">
            <span className="label">Skills it uses</span>
            {pskills.length === 0 && <span className="small muted">None listed yet.</span>}
            {pskills.length > 0 && <div className="row">{pskills.map((k) => <span key={k} className="chip">{skillLabel(k)}</span>)}</div>}
            {canSetSkills && (
              <F action={A.setProjectSkills} back={back} hidden={{ id }} className="stack tight">
                <input type="text" name="skills" id="project-skills" defaultValue={pskills.map(skillLabel).join(", ")} placeholder="React, Node, Figma" maxLength={300} required aria-label="Skills this project uses" />
                <button className="btn ghost sm">Save skills</button>
              </F>
            )}
            <span className="small muted">{shipped ? "A skill counts for a teammate only when the others confirm they used it." : "After it ships, teammates tick who used which. Listing a skill here gives nobody a score."}</span>
          </div>

          <div className="card">
            <span className="label">Milestones</span>
            <div className="row"><Meter done={done} total={ms.length} /><span className="small muted mono">{done}/{ms.length}</span></div>
            {ms.map((m) => (
              <div key={m.id} className="row between small">
                <span className={m.done ? "" : "muted"}>{m.done ? "✓" : "○"} {m.title}</span>
                {onTeam && open && <F action={A.toggleMilestone} back={back} hidden={{ milestone: m.id }}><button className="linkbtn small">{m.done ? "Undo" : "Done"}</button></F>}
              </div>
            ))}
            {lead && open && (
              <F action={A.addMilestone} back={back} hidden={{ id }} className="row">
                <input type="text" name="title" id="ms-title" placeholder="New milestone" required />
                <button className="btn ghost sm">Add</button>
              </F>
            )}
          </div>

          {grant && (
            <div className="card">
              <span className="label">Alumni funding</span>
              <div className="stat"><b>{inr(grant.amount)}</b><span className="small muted">from <Link href={`/u/${grant.alum_id}`}>{grant.alum_name}</Link>, class of {grant.grad_year}</span></div>
              {parts.map((x) => (
                <div key={x.id} className="part-row small">
                  <span>{x.title}</span>
                  <span className="mono nowrap">{inr(x.amount)} <span className={`pill ${x.paid ? "ok" : "warn"}`}>{x.paid ? "Paid" : "Held"}</span></span>
                </div>
              ))}
            </div>
          )}
          {me.admin ? (
            <F action={A.setHidden} back={back} hidden={{ id, on: p.hidden ? 0 : 1 }}><button className="btn ghost sm">{p.hidden ? "Admin: show project" : "Admin: hide project"}</button></F>
          ) : null}
          {!mine && me.verified ? (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>Report this project</summary>
              <F action={A.report} back={back} hidden={{ kind: "project", target: id }} className="stack tight">
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
