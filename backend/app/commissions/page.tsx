import Link from "next/link";
import { all } from "@/lib/db";
import { requireMember, standings } from "@/lib/auth";
import { EMPTY, RULES } from "@/lib/credit";
import { alumUsed, type CommRow } from "@/lib/commissions";
import { label } from "@/lib/skills";
import { now } from "@/lib/db";
import * as A from "../actions";
import { Av, F, inr } from "../ui";
import { CommPill } from "./pill";

export const metadata = { title: "Commissions" };

export default async function Commissions() {
  const me = await requireMember();
  const C = RULES.comm, cid = me.college_id, mine = standings().get(me.id) ?? EMPTY;
  const users = new Map(all("SELECT id, name, picture FROM users WHERE college_id=?", cid).map((u) => [u.id, u]));
  const list = all("SELECT * FROM commissions WHERE college_id=? AND hidden=0 ORDER BY created_at DESC LIMIT 200", cid);
  const skills = all("SELECT cs.* FROM commission_skills cs JOIN commissions c ON c.id=cs.commission_id WHERE c.college_id=? ORDER BY cs.importance DESC", cid);
  const myClubs = all("SELECT id, name FROM clubs WHERE lead_id=? AND college_id=? AND status='active'", me.id, cid);
  const alum = me.role === "alum";
  const open = list.filter((c) => c.status === "open" && c.client_id !== me.id);
  const involved = list.filter((c) => c.client_id === me.id || c.doer_id === me.id);
  const canPost = alum ? true : mine.earned >= C.minClientCredit;
  const allowance = alum ? C.alumAllowance - alumUsed(list as CommRow[], me.id, now()) : 0;
  const card = (c: (typeof list)[number]) => (
    <Link key={c.id} className="card lift" href={`/commissions/${c.id}`}>
      <span className="row between"><h2>{c.title}</h2><CommPill status={c.status} /></span>
      <span className="muted">{c.brief.length > 160 ? c.brief.slice(0, 157) + "..." : c.brief}</span>
      <span className="row">{skills.filter((k) => k.commission_id === c.id).map((k) => <span key={k.skill} className="chip">{label(k.skill)}</span>)}</span>
      <span className="row between small">
        {/* The whole card is a link, so the name inside it is plain text: a link inside a link breaks the page. */}
        {(() => { const u = users.get(c.client_id) ?? { id: c.client_id, name: "Someone" }; return <span className="row nowrap"><Av u={u} /><span>{u.name}</span></span>; })()}
        <span className="mono">{c.reward} credit{c.money ? ` · ${inr(c.money)}` : ""} · due {new Date(c.deadline * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
      </span>
    </Link>
  );
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>Commissions</h1>
        <p>Ask someone to build a piece of work for you, or take one on. The reward is credit, set aside when the job is posted and paid when the person who asked signs it off. <Link href="/rules">How it works</Link></p>
      </div></div>
      <div className="alert">Not for coursework. Graded assignments, lab records, reports you hand in for marks and exams are not allowed here, for either side. Posts like that are removed and go on your record.</div>
      <div className="cols">
        <div className="stack">
          {involved.length > 0 && <><span className="label">Yours</span>{involved.map(card)}</>}
          <span className="label">Open for anyone to apply</span>
          {open.length === 0 && <div className="note">Nothing open right now.</div>}
          {open.map(card)}
        </div>
        <aside className="stack">
          <div className="card">
            <h2>Post a commission</h2>
            {!canPost ? <p className="muted">You need {C.minClientCredit} earned credit before you can commission work. You have {mine.earned}. Ship a project first.</p> : (
              <F action={A.postCommission} back="/commissions" className="stack">
                <label className="field"><span>What do you need?</span><input type="text" name="title" id="c-title" maxLength={80} placeholder="Landing page for the robotics club" required /></label>
                <label className="field"><span>Details</span><textarea name="brief" id="c-brief" maxLength={1200} placeholder="What it should do, what you will give them to start with, and what done looks like." required /></label>
                <label className="field"><span>Skills needed</span><input type="text" name="skills" id="c-skills" maxLength={200} placeholder="React, Figma" required /><small>Most important first. Applicants are ranked by confirmed work in these.</small></label>
                <label className="field"><span>Milestones</span><textarea name="milestones" id="c-ms" placeholder={"First draft\nFinal version live"} required /><small>One per line. All of them are ticked before delivery.</small></label>
                <label className="field"><span>Deadline</span><input type="date" name="deadline" id="c-deadline" required /></label>
                <label className="field"><span>Reward in credit</span><input type="number" name="reward" id="c-reward" min={C.minReward} max={C.maxReward} defaultValue={20} required />
                  <small>{alum ? `Alumni commissions can award ${C.alumAllowance} credit every 30 days. You have ${Math.max(0, allowance)} left.` : `Between ${C.minReward} and ${C.maxReward}. You have ${mine.credit} free. It is set aside now and comes back if you cancel before picking someone.`} Above {C.reviewerAbove}, someone outside also checks the work.</small></label>
                {myClubs.length > 0 && <label className="field"><span>Posting for a club? <span className="muted">(optional)</span></span>
                  <select name="club" id="c-club" defaultValue=""><option value="">No, for myself</option>{myClubs.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>}
                {(alum || myClubs.length > 0) && <>
                  <label className="field"><span>Money, in rupees <span className="muted">(optional{alum ? "" : ", clubs only"})</span></span><input type="number" name="money" id="c-money" min={0} placeholder="0" /></label>
                  <label className="field"><span>How it will be paid</span><input type="text" name="money_note" id="c-money-note" maxLength={160} placeholder="UPI on sign-off" />
                    <small>Connect only records this. The money moves directly between you two.</small></label>
                </>}
                <label className="tick"><input type="checkbox" name="not_coursework" value="1" required /> This is not graded coursework, an assignment or an exam.</label>
                <button className="btn">Post</button>
              </F>
            )}
          </div>
          <div className="card">
            <span className="label">The limits</span>
            <p className="small muted">The same two people can do {C.pairMaxCount} commissions together, and move {C.pairMaxCredit} credit between them, every {C.pairWindowMonths} months. That keeps this for real work, not for passing credit to friends.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
