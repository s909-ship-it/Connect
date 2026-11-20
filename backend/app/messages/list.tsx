import Link from "next/link";
import type { Row } from "@/lib/db";
import { conversations } from "@/lib/chat";
import { timeAgo } from "@/lib/notify";
import { Av } from "../ui";

/* The left column: every conversation, newest first, with unread counts. */
export function ConversationList({ me, active }: { me: Row; active?: number }) {
  const list = conversations(me);
  return (
    <nav className="convos" aria-label="Conversations">
      <div className="convos-head">
        <h1>Messages</h1>
        <Link href="/messages?new=1" className="btn sm" aria-label="New message">New</Link>
      </div>
      {list.length === 0 && <p className="small muted" style={{ padding: "0 14px" }}>No conversations yet. Start one with someone from your community.</p>}
      {list.map(({ u, last, unread }) => (
        <Link key={u.id} href={`/messages/${u.id}`} className={`convo ${active === u.id ? "on" : ""} ${unread ? "unread" : ""}`} aria-current={active === u.id ? "page" : undefined}>
          <Av u={u} />
          <span className="convo-body">
            <span className="row between nowrap"><b className="ellipsis">{u.name}</b><span className="small muted nowrap">{timeAgo(last.created_at)}</span></span>
            <span className="small muted ellipsis">
              {last.from_id === me.id ? "You: " : ""}{({ invite: "Project invite", project: "🚀 Shared a project", image: `📷 ${last.text || "Photo"}`, video: `🎬 ${last.text || "Video"}`,
                voice: "🎙️ Voice note", file: `📎 ${last.file_name}`, call: `${/video/i.test(last.text) ? "🎥" : "📞"} ${last.text}` } as Record<string, string>)[last.kind] ?? last.text}
            </span>
          </span>
          {unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
