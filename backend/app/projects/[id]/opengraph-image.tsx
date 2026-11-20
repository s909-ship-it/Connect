import { get } from "@/lib/db";
import { ogCard, ogSize } from "../../og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "A Connect project";

const STATUS: Record<string, string> = { recruiting: "Needs people", building: "Building", review: "In review", shipped: "Shipped", dropped: "Dropped" };

/* Preview card for a shipped project's link. Work in progress stays inside its college. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  // Link previews are public, so they only show what a college already shows publicly: shipped projects.
  const p = get("SELECT * FROM projects WHERE id=? AND hidden=0 AND status='shipped'", Number((await params).id));
  if (!p) return ogCard({ eyebrow: "Project", title: "Build with people from your community", subtitle: "Credit comes only from what ships." });
  const team = get("SELECT COUNT(*) n FROM members WHERE project_id=? AND status='active'", p.id).n;
  const ms = get("SELECT COUNT(*) total, COALESCE(SUM(done),0) done FROM milestones WHERE project_id=?", p.id);
  const roles = get("SELECT COUNT(*) n FROM roles WHERE project_id=? AND open=1", p.id).n;
  return ogCard({
    eyebrow: STATUS[p.status] ?? "Project",
    title: p.name,
    subtitle: p.pitch.length > 120 ? p.pitch.slice(0, 117) + "..." : p.pitch,
    stamp: p.status === "shipped" ? `REVIEWED · POT ${p.pot}` : undefined,
    stats: [[String(team), team === 1 ? "builder" : "builders"], [`${ms.done}/${ms.total}`, "milestones"], ...(roles ? [[String(roles), roles === 1 ? "open role" : "open roles"] as [string, string]] : [])],
  });
}
