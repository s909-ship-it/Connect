import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { onTeam, teamOf, unreadTeam } from "@/lib/teamchat";
import { callStatus } from "@/lib/teamspace";
import { TeamSpace } from "../team-space";

/* A project's team space: Chat, Notes and Tasks under one header, with the team call on top. It stays mounted while
   people move between the three, so a call keeps going. Only the project's current team gets in; anyone else,
   admins included, gets "not found". */
export default async function TeamSpaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  const p = get("SELECT id, name FROM projects WHERE id=? AND college_id=?", id, me.college_id);
  if (!p || !onTeam(p.id, me.id)) notFound();
  const team = teamOf(p.id).map((u) => ({ id: u.id as number, name: String(u.name), picture: u.picture ?? null, role: String(u.role || "Member"), lead: !!u.lead }));
  return (
    <TeamSpace project={{ id: p.id, name: String(p.name) }} team={team} me={me.id} anon={!!me.anon} chatUnread={unreadTeam(p.id, me.id)} call={callStatus(p.id)}>
      {children}
    </TeamSpace>
  );
}
