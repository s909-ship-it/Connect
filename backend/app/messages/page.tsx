import { all } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { ConversationList } from "./list";
import { NewChat } from "./chat";
import { pushPublicKey } from "@/lib/push";
import { PushToggle } from "../push-toggle";

export const metadata = { title: "Messages" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const me = await requireMember();
  const fresh = !!(await searchParams).new;
  const people = all(
    `SELECT id, name, picture, branch, skills FROM users WHERE college_id=? AND verified=1 AND suspended=0 AND deleted=0 AND onboarded=1 AND id<>?
       AND id NOT IN (SELECT blocked_id FROM blocks WHERE user_id=?) ORDER BY name`, me.college_id, me.id, me.id);
  return (
    <div className={`dm ${fresh ? "picking" : ""}`}>
      <ConversationList me={me} />
      <section className="chat chat-idle">
        <div className="stack" style={{ maxWidth: 460, width: "100%" }}>
          <h2>{fresh ? "New message" : "Talk to anyone in your community"}</h2>
          <p className="small muted">Messages stay inside your community. You can block anyone from their chat.</p>
          <PushToggle publicKey={pushPublicKey()} compact />
          <NewChat people={people} />
        </div>
      </section>
    </div>
  );
}
