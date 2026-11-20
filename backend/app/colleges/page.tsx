import Link from "next/link";
import { all } from "@/lib/db";
import { domainsOf } from "@/lib/college";

export const metadata = { title: "Colleges" };

/* Public list of colleges on Connect. Each one is a separate space that only its own students can enter. */
export default function Colleges() {
  const rows = all(`SELECT c.*,
      (SELECT COUNT(*) FROM users u WHERE u.college_id=c.id AND u.verified=1 AND u.role='student' AND u.suspended=0) students,
      (SELECT COUNT(*) FROM projects p WHERE p.college_id=c.id AND p.status='shipped' AND p.hidden=0) shipped
    FROM colleges c WHERE c.status='active' ORDER BY students DESC, c.name`);
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>Communities on Connect</h1>
        <p>Every community, like the students of a college or the employees of a workplace, is its own space: its own board, people, clubs and alumni. You get into yours by proving an email address your college or workplace gave you, so no one can pass as a member somewhere else.</p>
      </div></div>
      <div className="grid">
        {rows.map((c) => (
          <Link key={c.id} href={`/c/${c.slug}`} className="card lift college-card">
            <span className="college-mark" aria-hidden="true">{c.name.slice(0, 1)}</span>
            <h2>{c.name}</h2>
            <span className="small muted mono">@{domainsOf(c).join(", @")}</span>
            <span className="small">{c.students} {c.students === 1 ? "member" : "members"} · {c.shipped} shipped</span>
          </Link>
        ))}
      </div>
      <div className="card">
        <h2>Your community is not here?</h2>
        <p className="muted">Sign in and enter your college or work email. If your community uses an academic domain (.edu, .ac.in and the like), its space opens the moment you confirm the code. Other domains are checked by the Connect team first.</p>
        <div><Link className="btn" href="/signin">Bring your community</Link></div>
      </div>
    </>
  );
}
