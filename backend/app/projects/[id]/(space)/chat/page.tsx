import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { markTeamRead, teamMessages, teamOf, teamProject } from "@/lib/teamchat";
import { pins } from "@/lib/teamspace";
import { TeamChat } from "../../team-chat";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const p = get("SELECT name FROM projects WHERE id=? AND college_id=?", Number((await params).id), me.college_id);
  return { title: p ? `${p.name} · Team chat` : "Team chat" };
}

/* The team chat tab. Pages render alongside their layout, so this checks the team itself rather than trusting it. */
export default async function TeamChatPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  if (!teamProject(id, me)) notFound();
  const initial = teamMessages(id, me.id);
  markTeamRead(id, me.id);
  const team = teamOf(id).map((u) => ({ id: u.id as number, name: String(u.name), picture: u.picture ?? null, role: String(u.role || "Member"), lead: !!u.lead }));
  return <TeamChat project={id} team={team} initial={initial} initialPins={pins(id)} />;
}
