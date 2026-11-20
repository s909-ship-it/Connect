import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { teamOf, teamProject } from "@/lib/teamchat";
import { taskList, todayDay } from "@/lib/teamspace";
import { TeamTasks } from "../../team-tasks";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const p = get("SELECT name FROM projects WHERE id=? AND college_id=?", Number((await params).id), me.college_id);
  return { title: p ? `${p.name} · Tasks` : "Tasks" };
}

/* The Tasks tab: the team's board. */
export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  if (!teamProject(id, me)) notFound();
  const team = teamOf(id).map((u) => ({ id: u.id as number, name: String(u.name), picture: u.picture ?? null, role: String(u.role || "Member"), lead: !!u.lead }));
  return <TeamTasks project={id} me={me.id} team={team} initial={taskList(id)} today={new Date(todayDay() * 86400 * 1000).toISOString().slice(0, 10)} />;
}
