import Link from "next/link";
import { all, run, now } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/notify";
import { RefreshBadges } from "./refresh";

export const metadata = { title: "Inbox" };

/* Which heading an entry sits under, counted in Indian time so "Today" means the reader's today. */
const DAY = 86400;
const dayNo = (t: number) => Math.floor((t + 19800) / DAY); // +5:30
function groupOf(t: number, today: number): string {
  const d = today - dayNo(t);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? "Earlier this week" : d < 31 ? "Earlier this month" : "Older";
}

export default async function Inbox() {
  const me = await requireUser();
  const items = all("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 60", me.id);
  // Opening the inbox marks everything as read. The rows above still show what was new.
  const hadNew = items.some((n) => !n.seen);
  if (hadNew) run("UPDATE notifications SET seen=1 WHERE user_id=?", me.id);
  // "New" means since the visit before this one. A visit within the last minute counts as this one, so the refresh
  // that clears the header badges does not also wipe the "new" marks.
  let since = me.inbox_prev ?? 0;
  if (now() - (me.inbox_read_at ?? 0) > 60) {
    since = me.inbox_read_at ?? 0;
    run("UPDATE users SET inbox_prev=?, inbox_read_at=? WHERE id=?", since, now(), me.id);
  }
  const isNew = (n: { created_at: number }) => n.created_at > since;
  const today = dayNo(Math.floor(Date.now() / 1000));
  const groups: [string, typeof items][] = [];
  for (const n of items) {
    const g = groupOf(n.created_at, today);
    if (groups.at(-1)?.[0] === g) groups.at(-1)![1].push(n); else groups.push([g, [n]]);
  }
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      {hadNew && <RefreshBadges />}
      <div className="head"><div className="stack tight"><h1>Inbox</h1><p>Join requests, reviews, vouches and funding, newest first.</p></div></div>
      {items.length === 0 && <div className="note">Nothing yet. You will hear here when a team answers you, a project ships or someone vouches for you.</div>}
      {groups.map(([label, rows]) => (
        <section key={label} className="stack tight" aria-label={label}>
          <h2 className="inbox-day">{label}{rows.some(isNew) ? <span className="pill info">{rows.filter(isNew).length} new</span> : null}</h2>
          {rows.map((n) => (
            <Link key={n.id} href={n.href} className={`card lift ${isNew(n) ? "unread" : ""}`}>
              <span className="row between"><span>{n.text}</span><span className="small muted mono">{timeAgo(n.created_at)}</span></span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
