import { all, get } from "@/lib/db";
import { currentUser, standings, skillScores } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* Everything Connect holds about the signed-in person, as one JSON file. */
export async function GET() {
  const me = await currentUser();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const id = me.id;
  const { sub: _sub, ...profile } = me;
  const data = {
    exported_at: new Date().toISOString(),
    profile,
    credit: standings().get(id) ?? null,
    sign_in_methods: all("SELECT sub FROM identities WHERE user_id=?", id).map((r) => String(r.sub).split(":")[0]),
    projects: all(`SELECT p.id, p.name, p.status, m.role, m.status AS membership, m.did FROM members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=?`, id),
    join_requests: all("SELECT project_id, status FROM requests WHERE user_id=?", id),
    reviews_given: all("SELECT project_id, verdict, note FROM reviews WHERE reviewer_id=?", id),
    vouches_given: all("SELECT to_id, created_at FROM vouches WHERE from_id=?", id),
    vouches_received: all("SELECT from_id, created_at FROM vouches WHERE to_id=?", id),
    claims: all("SELECT text FROM claims WHERE user_id=?", id),
    clubs: all("SELECT c.name, cm.role, cm.confirmed FROM club_members cm JOIN clubs c ON c.id=cm.club_id WHERE cm.user_id=?", id),
    questions_and_answers: all("SELECT project_id, text, created_at FROM comments WHERE user_id=?", id),
    projects_followed: all("SELECT project_id, created_at FROM follows WHERE user_id=?", id),
    projects_opened_or_hidden: all("SELECT project_id, views, last_at, hidden FROM project_seen WHERE user_id=?", id),
    feedback_sent: all("SELECT kind, text, page, status, reply, created_at, replied_at FROM feedback WHERE user_id=?", id),
    messages: all("SELECT to_id, from_id, text, kind, file_name, file_size, created_at FROM messages WHERE from_id=? OR to_id=? ORDER BY id", id, id),
    notifications: all("SELECT text, href, seen, created_at FROM notifications WHERE user_id=?", id),
    reports_filed: all("SELECT kind, target_id, reason, created_at FROM reports WHERE by_id=?", id),
    skills: [...(skillScores().get(id)?.values() ?? [])].map(({ label, score, conf, band, why }) => ({ skill: label, score, confidence: Math.round(conf * 100) / 100, band, why })),
    skill_ticks_given: all("SELECT project_id, user_id, skill FROM member_skills WHERE by_id=?", id),
    evidence: all("SELECT kind, title, url, file_name, skills, value, status, method, work_email, note, created_at, decided_at FROM evidence WHERE user_id=?", id),
    commissions_posted: all("SELECT id, title, brief, reward, money, status, doer_id, rating, paid_credit, created_at, closed_at FROM commissions WHERE client_id=?", id),
    commissions_done: all("SELECT id, title, reward, status, client_id, rating, rating_note, paid_credit, closed_at FROM commissions WHERE doer_id=?", id),
    commission_applications: all("SELECT commission_id, note, status, created_at FROM commission_apps WHERE user_id=?", id),
    credit_sent: all("SELECT to_id, amount, note, created_at FROM gifts WHERE from_id=?", id),
    credit_received: all("SELECT from_id, amount, note, created_at FROM gifts WHERE to_id=?", id),
    alumni_grants: get("SELECT COUNT(*) n FROM grants WHERE alum_id=?", id)?.n ?? 0,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="connect-${id}.json"`, "Cache-Control": "no-store" },
  });
}
