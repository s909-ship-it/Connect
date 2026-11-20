import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STATUSES, kindLabel } from "@/lib/feedback";
import { timeAgo } from "@/lib/notify";
import { replyFeedback } from "../../actions";
import { F, Who } from "../../ui";

export const metadata = { title: "Feedback · Admin" };

/* For site admins only: everything people have sent through the feedback form, from every college. */
export default async function FeedbackAdmin({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireUser();
  if (!me.super) notFound();
  const show = (await searchParams).show === "all" ? "all" : "open";
  const rows = all(
    `SELECT f.*, u.name, u.picture, u.deleted, c.name college FROM feedback f JOIN users u ON u.id=f.user_id LEFT JOIN colleges c ON c.id=f.college_id
     ${show === "open" ? "WHERE f.status IN ('new','planned')" : ""} ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, f.id DESC LIMIT 200`);
  const count = (w: string) => get(`SELECT COUNT(*) n FROM feedback ${w}`).n as number;
  const back = `/admin/feedback${show === "all" ? "?show=all" : ""}`;
  return (
    <>
      <Link href="/admin">← Admin</Link>
      <div className="head"><div className="stack tight">
        <h1>Feedback</h1>
        <p>What people sent through the feedback form, from every community. Set where each one stands and write back if you want: they see it on their Feedback page and in their inbox.</p>
      </div></div>
      <div className="filters">
        <Link href="/admin/feedback" aria-current={show === "open" ? "true" : undefined}>Open <span className="mono">{count("WHERE status IN ('new','planned')")}</span></Link>
        <Link href="/admin/feedback?show=all" aria-current={show === "all" ? "true" : undefined}>All <span className="mono">{count("")}</span></Link>
      </div>
      {rows.length === 0 && <div className="card"><span className="muted">{show === "open" ? "Nothing is waiting." : "No feedback yet."}</span></div>}
      {rows.map((f) => (
        <div key={f.id} className="card stack">
          <span className="row between">
            <span className="row"><Who u={{ id: f.user_id, name: f.name, picture: f.picture }} /><span className="pill plain">{kindLabel(f.kind)}</span><span className={`pill ${STATUSES[f.status]?.[0] ?? "plain"}`}>{STATUSES[f.status]?.[1] ?? f.status}</span></span>
            <span className="small muted">{f.college ?? "No community yet"}{f.page ? `, from ${f.page}` : ""}, {timeAgo(f.created_at)}</span>
          </span>
          <p className="pre">{f.text}</p>
          <F action={replyFeedback} back={back} hidden={{ feedback: f.id }} className="stack tight">
            <textarea name="reply" id={`fb-reply-${f.id}`} rows={2} maxLength={1000} defaultValue={f.reply ?? ""} placeholder="Write back (optional)" aria-label="Reply" />
            <span className="row">
              <select name="status" id={`fb-status-${f.id}`} defaultValue={f.status} aria-label="Status">
                {Object.entries(STATUSES).map(([id, [, label]]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <button className="btn sm">Save</button>
            </span>
          </F>
        </div>
      ))}
    </>
  );
}
