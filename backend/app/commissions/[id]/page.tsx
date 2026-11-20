import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, now } from "@/lib/db";
import { requireMember, standings, skillScores } from "@/lib/auth";
import { EMPTY, RULES } from "@/lib/credit";
import { fit, type Needs, type Person } from "@/lib/relevance";
import { label } from "@/lib/skills";
import { timeAgo } from "@/lib/notify";
import * as A from "../../actions";
import { F, Meter, Stamp, Who, inr, skillsOf } from "../../ui";
import { CommPill } from "../pill";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const c = get("SELECT title FROM commissions WHERE id=? AND college_id=?", Number((await params).id), me.college_id);
  return { title: c?.title ?? "Commission" };
}

export default async function Commission({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  const c = get("SELECT * FROM commissions WHERE id=? AND college_id=?", id, me.college_id);
  const mineAs = c ? (c.client_id === me.id ? "client" : c.doer_id === me.id ? "doer" : null) : null;
  if (!c || (c.hidden && !mineAs && !me.admin)) notFound();
  const back = `/commissions/${id}`, C = RULES.comm, S = standings();
  const client = get("SELECT * FROM users WHERE id=?", c.client_id), doer = c.doer_id ? get("SELECT * FROM users WHERE id=?", c.doer_id) : null;
  const club = c.club_id ? get("SELECT id, name FROM clubs WHERE id=?", c.club_id) : null;
  const skills = all("SELECT skill, importance FROM commission_skills WHERE commission_id=? ORDER BY importance DESC, rowid", id) as { skill: string; importance: number }[];
  const ms = all("SELECT * FROM commission_milestones WHERE commission_id=?", id), done = ms.filter((m) => m.done).length;
  const needsCheck = c.reward > C.reviewerAbove || !!c.minted;
  const canCheck = c.status === "delivered" && needsCheck && c.review_ok == null && !mineAs && (me.admin || c.reviewer_id === me.id);
  const myApp = get("SELECT * FROM commission_apps WHERE commission_id=? AND user_id=?", id, me.id);

  // Applicants, best fit first. Only the person who posted sees them.
  const needs: Needs = { mode: "all", list: skills };
  const K = mineAs === "client" ? skillScores() : new Map();
  const loads = new Map<number, number>(mineAs === "client" ? all("SELECT m.user_id, COUNT(*) n FROM members m JOIN projects p ON p.id=m.project_id WHERE m.status='active' AND p.status IN ('recruiting','building','review') GROUP BY m.user_id").map((r) => [r.user_id, r.n]) : []);
  const busy = new Map<number, number>(mineAs === "client" ? all("SELECT doer_id, COUNT(*) n FROM commissions WHERE status IN ('assigned','delivered') GROUP BY doer_id").map((r) => [r.doer_id, r.n]) : []);
  const apps = mineAs === "client" && c.status === "open"
    ? all("SELECT a.id aid, a.note, a.created_at applied, u.* FROM commission_apps a JOIN users u ON u.id=a.user_id WHERE a.commission_id=? AND a.status='pending'", id).map((u) => {
        const st = S.get(u.id) ?? EMPTY;
        const p: Person = { id: u.id, skills: K.get(u.id), listed: skillsOf(u), finishRate: st.cred.finishRate, finished: st.shipped, ended: st.shipped + st.left,
          open: true, load: (loads.get(u.id) ?? 0) + (busy.get(u.id) ?? 0), shippedWith: st.mates.has(me.id) ? "with you before" : undefined };
        return { u, st, f: fit(needs, p) };
      }).sort((a, b) => (b.f?.score ?? -1) - (a.f?.score ?? -1))
    : [];
  const silent = c.status === "delivered" && now() - (c.delivered_at ?? 0) > C.silentDays * 86400;

  return (
    <>
      <Link href="/commissions">← All commissions</Link>
      <div className="head"><div className="stack tight">
        <div className="row"><h1>{c.title}</h1><CommPill status={c.status} /></div>
        <span className="row small muted">Asked by <Who u={client} />{club && <> for <Link href={`/clubs/${club.id}`}>{club.name}</Link></>} · {timeAgo(c.created_at)}</span>
      </div></div>
      {c.hidden ? <div className="alert">Removed by an admin. {c.resolution}</div> : null}
      <div className="cols">
        <div className="stack">
          <div className="card">
            <h2>What is needed</h2>
            <p className="pre">{c.brief}</p>
            <div className="row">{skills.map((k) => <span key={k.skill} className="chip">{label(k.skill)}{k.importance === 3 ? " · must have" : ""}</span>)}</div>
          </div>

          {c.status === "open" && !mineAs && me.role === "student" && (
            <div className="card">
              <h2>Take this on</h2>
              {myApp ? (
                <div className="row between"><span className="muted">{myApp.status === "pending" ? "You applied. They pick one person." : "They picked someone else."}</span>
                  {myApp.status === "pending" && <F action={A.withdrawCommissionApp} back={back} hidden={{ id }}><button className="btn ghost sm">Withdraw</button></F>}</div>
              ) : (
                <F action={A.applyCommission} back={back} hidden={{ id }} className="stack tight">
                  <textarea name="note" id="apply-note" maxLength={400} placeholder="Why you, in a couple of lines. They also see your confirmed skills and what you have finished." style={{ minHeight: 70 }} />
                  <div><button className="btn">Apply</button></div>
                  <span className="small muted">Applying is free. If you are picked and it is signed off, you earn {c.reward} credit and it counts towards your {skills.slice(0, 2).map((k) => label(k.skill)).join(" and ")} score.</span>
                </F>
              )}
            </div>
          )}

          {mineAs === "client" && c.status === "open" && (
            <div className="card">
              <h2>Applicants</h2>
              <span className="small muted">Best fit first: confirmed work in the skills you listed, whether they finish what they join, and how busy they are. What people type about themselves does not rank them.</span>
              {apps.length === 0 && <span className="muted">Nobody has applied yet.</span>}
              {apps.map(({ u, st, f }) => (
                <div key={u.aid} className="row between">
                  <div className="stack" style={{ gap: 2 }}>
                    <Who u={u} />
                    <span className="small muted">{f ? f.reason : `No confirmed work in these skills yet · finished ${st.shipped} of ${st.shipped + st.left} joined`}</span>
                    {u.note ? <span className="pitch">{u.note}</span> : null}
                  </div>
                  <F action={A.pickDoer} back={back} hidden={{ app: u.aid }} confirm={`Give this to ${u.name.split(" ")[0]}?`}><button className="btn sm">Pick</button></F>
                </div>
              ))}
              <F action={A.cancelCommission} back={back} hidden={{ id }} confirm="Cancel this commission?"><button className="linkbtn small">Cancel and take the reward back</button></F>
            </div>
          )}

          {doer && (
            <div className="card">
              <h2>The work</h2>
              <span className="row small muted">Being done by <Who u={doer} /></span>
              <div className="row"><Meter done={done} total={ms.length} /><span className="small muted mono">{done}/{ms.length}</span></div>
              {ms.map((m) => (
                <div key={m.id} className="row between small">
                  <span className={m.done ? "" : "muted"}>{m.done ? "✓" : "○"} {m.title}</span>
                  {mineAs === "doer" && c.status === "assigned" && <F action={A.toggleCommissionMilestone} back={back} hidden={{ milestone: m.id }}><button className="linkbtn small">{m.done ? "Undo" : "Done"}</button></F>}
                </div>
              ))}
              {c.proof_url && <span>Delivered: <a href={c.proof_url} target="_blank" rel="noopener noreferrer nofollow">{c.proof_url} ↗</a></span>}
              {mineAs === "doer" && c.status === "assigned" && (
                <F action={A.deliverCommission} back={back} hidden={{ id }} className="row">
                  <input type="url" name="url" id="deliver-url" placeholder="Link to the finished work (https://)" required />
                  <button className="btn" disabled={done < ms.length}>Mark delivered</button>
                </F>
              )}
              {c.status === "delivered" && needsCheck && (
                <span>{c.review_ok === 1 ? <Stamp>Checked by someone outside</Stamp> : <Stamp kind="no">Waiting for an outside check</Stamp>}
                  <span className="small muted"> {c.minted ? "Credit an alum awards always gets a second look." : `Rewards above ${C.reviewerAbove} get a second look.`}</span></span>
              )}
              {canCheck && (
                <F action={A.checkCommission} back={back} hidden={{ id }} className="stack tight">
                  <span className="small">You were picked because you have no tie to either person. Open the link. Does it do what was asked?</span>
                  <input type="text" name="note" id="check-note" maxLength={200} placeholder="If not, what is missing?" />
                  <div className="row"><button className="btn sm" name="answer" value="ok">Yes, it is done</button><button className="btn danger sm" name="answer" value="no">No</button></div>
                </F>
              )}
              {mineAs === "client" && c.status === "delivered" && (
                <F action={A.signOffCommission} back={back} hidden={{ id }} className="stack tight">
                  <label className="field"><span>How good was the work?</span>
                    <select name="rating" id="rating" defaultValue="" required>
                      <option value="" disabled>Rate it</option><option value="5">5 · Excellent, better than asked</option><option value="4">4 · Good, did what was asked</option>
                      <option value="3">3 · Fine, needed some fixing</option><option value="2">2 · Weak</option><option value="1">1 · Poor</option>
                    </select></label>
                  <input type="text" name="note" id="rating-note" maxLength={300} placeholder="A line on the work (optional, shown here)" />
                  <label className="check small">
                    <input type="checkbox" name="on_time" id="on_time" value="1" />
                    <span>Delivered by the deadline</span>
                  </label>
                  <label className="check small">
                    <input type="checkbox" name="matched_brief" id="matched_brief" value="1" />
                    <span>Matched the brief</span>
                  </label>
                  <label className="check small">
                    <input type="checkbox" name="hire_again" id="hire_again" value="1" />
                    <span>I would hire them again (private: only a total is shown, once they have worked for 3 different people)</span>
                  </label>
                  <div><button className="btn" disabled={needsCheck && c.review_ok !== 1}>Sign off and pay {c.reward} credit</button></div>
                  <span className="small muted">Only the person who posted rates; the doer does not rate back. Your rating feeds their skill score, weighted by how far your own word can be trusted.</span>
                </F>
              )}
              {c.status === "done" && <span><Stamp>Signed off · {c.paid_credit} credit paid{c.rating ? ` · rated ${c.rating} of 5` : ""}</Stamp>{c.rating_note ? <span className="small muted"> “{c.rating_note}”</span> : null}</span>}
              {c.resolution && !c.hidden && <span className="small muted">Admin decision: {c.resolution}</span>}
            </div>
          )}

          {c.status === "disputed" && <div className="alert">In dispute: {c.dispute_reason} An admin of the community decides whether the reward is paid, returned or split.</div>}
          {mineAs && ["assigned", "delivered"].includes(c.status) && (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>{mineAs === "doer" && silent ? `No answer for ${C.silentDays} days? Send it to the admins` : "Something went wrong? Open a dispute"}</summary>
              <F action={A.disputeCommission} back={back} hidden={{ id }} className="stack tight">
                <input type="text" name="reason" id="dispute-reason" aria-label="What happened" maxLength={400} placeholder="What happened?" required />
                <button className="btn ghost sm">Send to admins</button>
              </F>
            </details>
          )}
          {me.admin && c.status === "disputed" && !mineAs ? (
            <F action={A.resolveCommission} back={back} hidden={{ id }} className="card stack tight">
              <h2>Admin: decide this dispute</h2>
              <select name="how" id="how" defaultValue="" required aria-label="Outcome">
                <option value="" disabled>Outcome</option><option value="pay">Pay the reward in full</option><option value="split">Split it: half is paid, half goes back</option><option value="refund">Return the reward</option>
              </select>
              <select name="fault" id="fault" defaultValue="" aria-label="Who was in the wrong">
                <option value="">Nobody was plainly in the wrong</option><option value="client">The person who asked was in the wrong</option><option value="doer">The person doing it was in the wrong</option>
              </select>
              <input type="text" name="note" id="resolve-note" maxLength={300} placeholder="Why, in a line. Both people see this." required />
              <div><button className="btn">Decide</button></div>
              <span className="small muted">Marking someone as in the wrong lowers their credibility, like an upheld report.</span>
            </F>
          ) : null}
        </div>

        <aside className="stack">
          <div className="card">
            <span className="label">Reward</span>
            <div className="stat"><b>{c.reward}</b><span className="small muted">credit{c.minted ? ", awarded by an alum" : ", set aside by the person who asked"}</span></div>
            {c.money ? (
              <div className="row between small"><span>{inr(c.money)} <span className="muted">{c.money_note}</span></span>
                <span className={`pill ${c.money_paid ? "ok" : "warn"}`}>{c.money_paid ? "Paid" : "Not yet paid"}</span></div>
            ) : null}
            {c.money ? <span className="small muted">Connect only records the money. It moves directly between the two people.</span> : null}
            {mineAs === "client" && c.money && c.status === "done" && !c.money_paid ? <F action={A.markCommissionPaid} back={back} hidden={{ id }}><button className="btn ghost sm">Mark money as sent</button></F> : null}
            <span className="small muted">Due {new Date(c.deadline * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          {!mineAs && (
            <details className="small">
              <summary className="muted" style={{ cursor: "pointer" }}>Report this commission</summary>
              <F action={A.report} back={back} hidden={{ kind: "commission", target: id }} className="stack tight">
                <select name="reason_kind" id="report-kind" defaultValue="coursework" aria-label="What is wrong">
                  <option value="coursework">It is graded coursework, an assignment or an exam</option><option value="fake">It is not real work (credit passing)</option><option value="abuse">Something else</option>
                </select>
                <input type="text" name="reason" id="report-reason" aria-label="Reason for the report" placeholder="Anything the admins should know (optional)" maxLength={300} />
                <button className="btn ghost sm">Send to admins</button>
              </F>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
