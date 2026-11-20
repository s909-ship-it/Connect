import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KINDS, STATUSES, cleanPage, kindLabel } from "@/lib/feedback";
import { timeAgo } from "@/lib/notify";
import { sendFeedback } from "../actions";
import { F } from "../ui";

export const metadata = { title: "Feedback" };

/* Tell the Connect team what is broken, missing or good, and see what they said back. */
export default async function Feedback({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const me = await requireUser();
  const page = cleanPage((await searchParams).from);
  const mine = all("SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC LIMIT 50", me.id);
  return (
    <div className="narrow stack">
      <div className="head"><div className="stack tight">
        <h1>Feedback</h1>
        <p>Tell the Connect team what is broken, what is missing, or what works well. A person reads every one.</p>
      </div></div>

      <F action={sendFeedback} back="/feedback" hidden={{ page }} className="card stack">
        <fieldset className="choice">
          <legend className="label">What is it about?</legend>
          {KINDS.map(([id, label], i) => (
            <label key={id}><input type="radio" name="kind" value={id} defaultChecked={i === 1} /><span>{label}</span></label>
          ))}
        </fieldset>
        <label className="field"><span>Your feedback</span>
          <textarea name="text" id="fb-text" required minLength={10} maxLength={1500} rows={5}
            placeholder="What happened, or what would you change? For a problem, say what you did and what you saw." />
        </label>
        {page && page !== "/feedback" && <span className="small muted">Sent with the page you came from: {page}</span>}
        <div><button className="btn">Send feedback</button></div>
        <p className="small muted">To report a person or a project, use <b>Report</b> on their page instead: community admins handle those.</p>
      </F>

      <div className="stack">
        <span className="label">What you have sent</span>
        {mine.length === 0 && <div className="card"><span className="muted">Nothing yet. Answers from the team will show here and in your <Link href="/inbox">inbox</Link>.</span></div>}
        {mine.map((f) => (
          <div key={f.id} className="card stack tight">
            <span className="row between">
              <span className="row"><span className="pill plain">{kindLabel(f.kind)}</span><span className={`pill ${STATUSES[f.status]?.[0] ?? "plain"}`}>{STATUSES[f.status]?.[1] ?? f.status}</span></span>
              <span className="small muted">{timeAgo(f.created_at)}</span>
            </span>
            <p className="pre">{f.text}</p>
            {f.reply && <div className="fb-reply"><span className="label">Connect team</span><p className="pre">{f.reply}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
