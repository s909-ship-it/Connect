import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, now } from "@/lib/db";
import { currentUser, requireMember, standings } from "@/lib/auth";
import { EMPTY } from "@/lib/credit";
import { CLUB, isLead, manages, seesClub } from "@/lib/clubs";
import * as A from "../../actions";
import { F, Pill, Who } from "../../ui";
import { DeleteClub } from "./delete-club";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  const c = me?.verified ? get("SELECT name, about FROM clubs WHERE id=? AND college_id=? AND status='active'", Number((await params).id), me.college_id) : null;
  return c ? { title: c.name, description: c.about } : { title: "Club" };
}

const dayLabel = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const ist = (t: number) => new Date((t + 19800) * 1000);
const dayNum = (t: number) => ist(t).getUTCDate();
const monthShort = (t: number) => ist(t).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
const weekday = (t: number) => ist(t).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export default async function Club({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  const c = get("SELECT * FROM clubs WHERE id=? AND college_id=?", id, me.college_id);
  if (!c || !seesClub(c, me)) notFound();
  const back = `/clubs/${id}`;
  const S = standings();
  const rows = all("SELECT cm.role crole, cm.confirmed, cm.manage, cm.invited_by, u.* FROM club_members cm JOIN users u ON u.id=cm.user_id WHERE cm.club_id=? ORDER BY (u.id=?) DESC, cm.manage DESC, u.name", id, c.lead_id);
  const members = rows.filter((r) => r.confirmed), asking = rows.filter((r) => !r.confirmed && !r.invited_by), invited = rows.filter((r) => !r.confirmed && r.invited_by);
  const boss = manages(c, me), lead = isLead(c, me), active = c.status === "active";
  const mine = rows.find((r) => r.id === me.id);
  const plans = all("SELECT * FROM club_plans WHERE club_id=? ORDER BY day, id", id);
  const upcoming = plans.filter((p) => p.day >= now() - 86400), past = plans.filter((p) => p.day < now() - 86400).reverse().slice(0, 5);
  const S2 = S;
  const earned = members.reduce((n, u) => n + ((S2.get(u.id) ?? EMPTY).earned || 0), 0);
  const canAdd = boss && active ? all("SELECT id, name FROM users WHERE college_id=? AND verified=1 AND deleted=0 AND suspended=0 AND role='student' AND id NOT IN (SELECT user_id FROM club_members WHERE club_id=?) ORDER BY name", me.college_id, id) : [];
  // Projects where at least two confirmed members are on the team.
  const projects = all(
    `SELECT p.id, p.name, p.status FROM projects p JOIN members m ON m.project_id=p.id AND m.status='active'
     JOIN club_members cm ON cm.user_id=m.user_id AND cm.club_id=? AND cm.confirmed=1
     WHERE p.status<>'dropped' GROUP BY p.id HAVING COUNT(*)>=2 ORDER BY p.created_at DESC`, id);
  const shipped = projects.filter((p) => p.status === "shipped").length;

  return (
    <>
      <Link href="/clubs">← All clubs</Link>
      {c.status === "pending" && <div className="note">Waiting for an admin of your community to approve this club. Only you and the admins can see it until then.{me.admin ? " You are an admin: approve or decline it below." : ""}</div>}
      {c.status === "declined" && <div className="alert">An admin did not approve this club{c.decline_reason ? `: ${c.decline_reason}` : "."}</div>}
      {!!me.admin && c.status === "pending" && (
        <div className="card stack">
          <span className="label">Admin decision</span>
          <span className="row">
            <F action={A.decideClub} back={back} hidden={{ club: id, do: "approve" }}><button className="btn">Approve the club</button></F>
          </span>
          <F action={A.decideClub} back={back} hidden={{ club: id, do: "decline" }} className="row">
            <input type="text" name="reason" id="club-decline-reason" placeholder="Why it is declined (they will see this)" aria-label="Why it is declined" minLength={5} maxLength={300} required />
            <button className="btn ghost">Decline</button>
          </F>
        </div>
      )}

      <div className="card club-hero">
        <span className="row club-facts">
          {active ? <span className="pill ok">Approved club</span> : c.status === "pending" ? <span className="pill warn">Waiting for approval</span> : <span className="pill bad">Not approved</span>}
          <span className="chip">{members.length} member{members.length === 1 ? "" : "s"}</span>
          {shipped > 0 && <span className="chip">{shipped} shipped project{shipped === 1 ? "" : "s"}</span>}
        </span>
        <div className="row between club-hero-main">
          <div className="stack tight"><h1>{c.name}</h1>{c.about && <p className="muted">{c.about}</p>}</div>
          {active && !mine && me.role === "student" && <F action={A.joinClub} back={back} hidden={{ club: id }}><button className="btn">Ask to join</button></F>}
          {mine && !mine.confirmed && !mine.invited_by && <span className="pill warn">Waiting for the lead</span>}
        </div>
      </div>

      {active && (
        <div className="club-stats">
          <div className="card"><span className="label">Members</span><b className="score-big">{members.length}</b><span className="small muted">{members.filter((u) => u.manage || u.id === c.lead_id).length} running it</span></div>
          <div className="card"><span className="label">Credit earned by members</span><b className="score-big">{earned}</b><span className="small muted">From projects that shipped. Membership itself gives none.</span></div>
          <div className="card"><span className="label">Next plan</span>{upcoming[0] ? <><b className="club-next">{upcoming[0].title}</b><span className="small muted">{dayLabel(upcoming[0].day)}{upcoming[0].place ? `, ${upcoming[0].place}` : ""}</span></> : <span className="small muted">Nothing planned yet.</span>}</div>
        </div>
      )}

      {mine && !mine.confirmed && mine.invited_by && (
        <div className="card row between">
          <span>You are invited to join {c.name}.</span>
          <span className="row">
            <F action={A.answerClubInvite} back={back} hidden={{ club: id, do: "accept" }}><button className="btn sm">Join</button></F>
            <F action={A.answerClubInvite} back={back} hidden={{ club: id, do: "decline" }}><button className="btn ghost sm">No thanks</button></F>
          </span>
        </div>
      )}

      <div className="card stack" id="plans">
        <h2>Plans</h2>
        {upcoming.length === 0 && <span className="small muted">{boss && active ? "Nothing planned yet. Add the next meet-up, workshop or build night below." : "Nothing planned yet."}</span>}
        {upcoming.length > 0 && (
          <div className="plan-grid">
            {upcoming.map((p) => (
              <div key={p.id} className="plan-card">
                <span className="plan-date"><b>{dayNum(p.day)}</b><span>{monthShort(p.day)}</span></span>
                <span className="stack tight plan-body">
                  <b>{p.title}</b>
                  <span className="small muted">{weekday(p.day)}{p.place ? ` · ${p.place}` : ""}</span>
                  {p.about && <span className="small">{p.about}</span>}
                  {boss && <F action={A.removeClubPlan} back={back} hidden={{ club: id, plan: p.id }} confirm={`Remove "${p.title}"?`}><button className="linkbtn small plan-remove">Remove</button></F>}
                </span>
              </div>
            ))}
          </div>
        )}
        {past.length > 0 && (
          <details className="small"><summary className="muted">Earlier plans ({past.length})</summary>
            {past.map((p) => <div key={p.id} className="muted">{dayLabel(p.day)}: {p.title}</div>)}
          </details>
        )}
        {boss && active && (
          <F action={A.addClubPlan} back={back} hidden={{ club: id }} className="stack tight plan-form">
            <span className="label">Add a plan</span>
            <input type="text" name="title" id="plan-title" placeholder="What, e.g. Build night: line follower" aria-label="Plan title" maxLength={CLUB.planTitleMax} required />
            <span className="row">
              <input type="date" name="day" id="plan-day" min={today()} aria-label="Day" required />
              <input type="text" name="place" id="plan-place" placeholder="Where" aria-label="Where" maxLength={CLUB.placeMax} />
            </span>
            <textarea name="about" id="plan-about" rows={2} placeholder="Details (optional)" aria-label="Details" maxLength={CLUB.planAboutMax} />
            <div><button className="btn">Add plan</button></div>
          </F>
        )}
      </div>

      <div className="card">
        <h2>Members</h2>
        <div className="tw"><table className="stack-sm"><tbody>
          <tr><th>Member</th><th>Role</th><th className="n">Shipped</th><th className="n">Credit</th>{boss && <th />}</tr>
          {members.map((u) => {
            const s = S.get(u.id) ?? EMPTY;
            const isTheLead = u.id === c.lead_id;
            return (
              <tr key={u.id}>
                <td><Who u={u} /></td>
                <td>{boss && !isTheLead ? (
                  <F action={A.setClubMember} back={back} hidden={{ club: id, user: u.id, do: "save" }} className="row nowrap club-role">
                    <input type="text" name="role" id={`role-${u.id}`} defaultValue={u.crole} aria-label={`Role for ${u.name}`} maxLength={CLUB.roleMax} />
                    {lead ? <label className="small row nowrap" title="Co-leads can edit the club, members and plans"><input type="checkbox" name="manage" defaultChecked={!!u.manage} /> Co-lead</label>
                      : u.manage ? <span className="pill info">Co-lead</span> : null}
                    <button className="linkbtn small">Save</button>
                  </F>) : <>{u.crole}{!isTheLead && u.manage ? <> <span className="pill info">Co-lead</span></> : null}</>}</td>
                <td className="n" data-label="Shipped">{s.shipped}/{s.joined}</td>
                <td className="n" data-label="Credit">{s.earned}</td>
                {boss && <td className="n">{!isTheLead && (!u.manage || lead) && <F action={A.setClubMember} back={back} hidden={{ club: id, user: u.id, do: "remove" }} confirm={`Remove ${u.name} from ${c.name}?`}><button className="linkbtn small">Remove</button></F>}</td>}
              </tr>
            );
          })}
        </tbody></table></div>
        <p className="small muted">The lead and co-leads confirm members and set roles. Membership gives no credit. Club projects earn it the same way as any other.</p>
        {mine?.confirmed && me.id !== c.lead_id && (
          <F action={A.setClubMember} back={back} hidden={{ club: id, user: me.id, do: "remove" }} confirm={`Leave ${c.name}?`}><button className="btn ghost sm">Leave the club</button></F>
        )}
      </div>

      {boss && (asking.length > 0 || invited.length > 0) && (
        <div className="card stack">
          <h2>Waiting</h2>
          {asking.map((u) => (
            <div key={u.id} className="row between">
              <span className="row nowrap"><Who u={u} /><span className="small muted">asked to join</span></span>
              <span className="row">
                <F action={A.setClubMember} back={back} hidden={{ club: id, user: u.id, do: "save", role: "Member" }}><button className="btn sm">Confirm</button></F>
                <F action={A.setClubMember} back={back} hidden={{ club: id, user: u.id, do: "remove" }}><button className="btn ghost sm">Decline</button></F>
              </span>
            </div>
          ))}
          {invited.map((u) => (
            <div key={u.id} className="row between">
              <span className="row nowrap"><Who u={u} /><span className="small muted">invited, has not answered</span></span>
              <F action={A.setClubMember} back={back} hidden={{ club: id, user: u.id, do: "remove" }}><button className="btn ghost sm">Take back</button></F>
            </div>
          ))}
        </div>
      )}

      {boss && active && (
        <div className="card stack" id="settings">
          <h2>Club settings</h2>
          <F action={A.updateClub} back={back} hidden={{ club: id }} className="stack tight">
            <label className="field"><span>Name</span><input type="text" name="name" id="club-name" defaultValue={c.name} minLength={CLUB.nameMin} maxLength={CLUB.nameMax} required /></label>
            <label className="field"><span>What the club does</span><textarea name="about" id="club-about" rows={2} defaultValue={c.about ?? ""} maxLength={CLUB.aboutMax} /></label>
            <div><button className="btn">Save</button></div>
          </F>
          <F action={A.inviteToClub} back={back} hidden={{ club: id }} className="stack tight">
            <span className="label">Add a member</span>
            {canAdd.length ? (
              <span className="row">
                <select name="user" id="club-invite" defaultValue="" required aria-label="Person to add">
                  <option value="" disabled>Pick someone</option>
                  {canAdd.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn ghost">Invite</button>
              </span>
            ) : <span className="small muted">Everyone verified in your community is already in the club or invited.</span>}
            <small className="muted">They get an invitation and join once they say yes.</small>
          </F>
          {lead && members.length > 1 && (
            <F action={A.transferClubLead} back={back} hidden={{ club: id }} className="stack tight" confirm="Hand over the lead? You stay in the club as a co-lead.">
              <span className="label">Hand over the lead</span>
              <span className="row">
                <select name="user" id="club-new-lead" defaultValue="" required aria-label="New lead">
                  <option value="" disabled>Pick a member</option>
                  {members.filter((u) => u.id !== c.lead_id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn ghost">Make lead</button>
              </span>
            </F>
          )}
          {lead && <DeleteClub club={id} name={c.name} back={back} action={A.deleteClub} />}
        </div>
      )}

      {lead && c.status === "pending" && (
        <div className="card"><DeleteClub club={id} name={c.name} back={back} action={A.deleteClub} /></div>
      )}

      {projects.length > 0 && (
        <div className="card">
          <h2>Projects by members</h2>
          {projects.map((p) => <div key={p.id} className="row between"><Link href={`/projects/${p.id}`}>{p.name}</Link><Pill status={p.status} /></div>)}
        </div>
      )}
    </>
  );
}
