import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { teamProject } from "@/lib/teamchat";
import { noteList, trashList } from "@/lib/teamspace";
import { TeamNotes } from "../../team-notes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const p = get("SELECT name FROM projects WHERE id=? AND college_id=?", Number((await params).id), me.college_id);
  return { title: p ? `${p.name} · Notes` : "Notes" };
}

/* The Notes tab with no page open: the list of pages and the templates to start one from. */
export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const id = Number((await params).id);
  if (!teamProject(id, me)) notFound();
  return <TeamNotes project={id} notes={noteList(id)} trash={trashList(id)} note={null} />;
}
