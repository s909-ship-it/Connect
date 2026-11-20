import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { CallButtons } from "../../calls/ui";
import { requireMember } from "@/lib/auth";
import { loadChat, setBlocked } from "../../chat-actions";
import { ConversationList } from "../list";
import { Chat } from "../chat";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const u = get("SELECT name FROM users WHERE id=? AND college_id=?", Number((await params).id), me.college_id);
  return { title: u ? `${u.name} · Messages` : "Messages" };
}

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  // Only people at your own college, and never yourself.
  const other = get("SELECT id, name, picture, branch, verified, suspended, deleted FROM users WHERE id=? AND college_id=? AND id<>?", id, me.college_id, me.id);
  if (!other) notFound();
  const iBlocked = !!get("SELECT 1 FROM blocks WHERE user_id=? AND blocked_id=?", me.id, id);
  const theyBlocked = !!get("SELECT 1 FROM blocks WHERE user_id=? AND blocked_id=?", id, me.id);
  const r = await loadChat(id, 0);
  const msgs = "error" in r ? [] : r.messages, seen = "error" in r ? 0 : r.seenUpTo;
  const reason = iBlocked ? "You blocked this person." : theyBlocked || other.suspended || other.deleted ? "You cannot message this person." : !other.verified ? "They have not verified their college or work email yet." : "";
  return (
    <div className="dm open">
      <ConversationList me={me} active={id} />
      <div className="chat-wrap">
        <Chat other={other} initial={iBlocked ? [] : msgs} initialSeen={seen} canSend={!reason} reason={reason}
          projects={all(`SELECT DISTINCT p.id, p.name, p.status FROM projects p JOIN members m ON m.project_id=p.id
            WHERE m.user_id=? AND p.college_id=? AND p.hidden=0 AND p.status<>'dropped' ORDER BY p.created_at DESC LIMIT 12`, me.id, me.college_id)}
          callButtons={!reason ? <CallButtons to={id} name={other.name} /> : null} anon={!!me.anon} />
        <form action={setBlocked} className="chat-tools">
          <input type="hidden" name="user" value={id} />
          <input type="hidden" name="on" value={iBlocked ? "0" : "1"} />
          <button className="linklike small">{iBlocked ? "Unblock" : `Block ${other.name.split(" ")[0]}`}</button>
        </form>
      </div>
    </div>
  );
}
