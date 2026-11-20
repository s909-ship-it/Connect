import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { conversations } from "@/lib/chat";
import { sizeText } from "@/lib/files";
import { sendShare } from "../../chat-actions";
import { Av } from "../../ui";

export const metadata = { title: "Send to" };

/* Pick who gets what you shared from another app. */
export default async function SharePick({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ skipped?: string }> }) {
  const me = await requireMember();
  const sh = get("SELECT * FROM shares WHERE id=? AND user_id=?", (await params).id, me.id);
  if (!sh) notFound();
  const files: { key: string; name: string; type: string; kind: string; size: number }[] = JSON.parse(sh.files);
  const skipped = Number((await searchParams).skipped) || 0;
  const recent = conversations(me).slice(0, 8).map((c) => c.u);
  const others = all(
    `SELECT id, name, picture, branch FROM users WHERE college_id=? AND verified=1 AND suspended=0 AND deleted=0 AND onboarded=1 AND id<>?
       AND id NOT IN (SELECT blocked_id FROM blocks WHERE user_id=?) ORDER BY name LIMIT 200`, me.college_id, me.id, me.id)
    .filter((u) => !recent.some((r) => r.id === u.id));
  const Pick = ({ u }: { u: { id: number; name: string; picture: string | null; branch?: string } }) => (
    <form action={sendShare} className="pick">
      <input type="hidden" name="share" value={sh.id} /><input type="hidden" name="to" value={u.id} />
      <Av u={u} /><span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}><b>{u.name}</b>{u.branch && <span className="small muted">{u.branch}</span>}</span>
      <button className="btn sm">Send</button>
    </form>
  );
  return (
    <div className="narrow stack" style={{ maxWidth: 560 }}>
      <h1>Send to…</h1>
      <div className="card stack">
        <span className="label">Shared from another app</span>
        {files.map((f) => (
          <div key={f.key} className="row nowrap">
            <span className="am gal" aria-hidden="true">{f.kind === "image" ? "🖼️" : f.kind === "video" ? "🎬" : f.kind === "voice" ? "🎙️" : "📄"}</span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}><b className="ellipsis">{f.name}</b><span className="small muted">{sizeText(f.size)}</span></span>
          </div>
        ))}
        {sh.text && <p className="pitch">{sh.text}</p>}
        {skipped > 0 && <span className="small neg">{skipped} {skipped === 1 ? "file was" : "files were"} left out: wrong type or too big.</span>}
      </div>
      {recent.length > 0 && <><span className="label">Recent chats</span><div className="people-pick">{recent.map((u) => <Pick key={u.id} u={u} />)}</div></>}
      <span className="label">Everyone in your community</span>
      <div className="people-pick">{others.map((u) => <Pick key={u.id} u={u} />)}</div>
      <Link href="/messages" className="small muted">Cancel</Link>
    </div>
  );
}
