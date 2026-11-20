import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { teamProject } from "@/lib/teamchat";
import { noteGet, noteList, trashList } from "@/lib/teamspace";
import { TeamNotes } from "../../../team-notes";

export async function generateMetadata({ params }: { params: Promise<{ id: string; note: string }> }) {
  const me = await requireMember();
  const { id, note } = await params;
  const p = teamProject(Number(id), me);
  const n = p ? noteGet(p.id, Number(note)) : null;
  return { title: n ? `${n.title || "Untitled"} · ${p!.name}` : "Notes" };
}

/* One page of the team's notes, open in the editor. */
export default async function NotePage({ params }: { params: Promise<{ id: string; note: string }> }) {
  const me = await requireMember();
  const { id: raw, note: nid } = await params;
  const id = Number(raw);
  if (!teamProject(id, me)) notFound();
  const note = noteGet(id, Number(nid));
  if (!note || note.deleted_at) notFound();
  return <TeamNotes project={id} notes={noteList(id)} trash={trashList(id)} note={note} />;
}
