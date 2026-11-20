import { get, all } from "@/lib/db";
import { compute, EMPTY } from "@/lib/credit";
import { ogCard, ogSize } from "../../og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "A Connect profile";

/* Preview card for a profile link. Only verified students have public profiles. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const u = get("SELECT * FROM users WHERE id=? AND onboarded=1 AND suspended=0 AND verified=1 AND role='student'", Number((await params).id));
  if (!u) return ogCard({ eyebrow: "Profile", title: "Build with people from your community", subtitle: "Credit comes only from what ships." });
  const s = compute().get(u.id) ?? EMPTY;
  const mates = new Set(all(
    `SELECT DISTINCT b.user_id FROM members a JOIN members b ON a.project_id=b.project_id
     WHERE a.user_id=? AND b.user_id<>? AND a.status='active' AND b.status='active'`, u.id, u.id).map((r) => r.user_id)).size;
  return ogCard({
    eyebrow: "Verified member profile",
    title: u.name,
    subtitle: [u.branch, u.grad_year ? `class of ${u.grad_year}` : ""].filter(Boolean).join(", "),
    stamp: s.shipped ? "EVERY PROJECT SIGNED BY TEAMMATES" : undefined,
    stats: [[String(s.earned), "credit earned"], [`${s.shipped} / ${s.joined}`, "shipped of joined"], [String(mates), "people worked with"]],
  });
}
