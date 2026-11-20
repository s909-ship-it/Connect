import { json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";

/* POST /api/public/college-interest  { college: string, email: string }
   The showcase's "Bring Connect to your college" form posts here.

   TODO: Connect has no table or admin screen for interest from people who have not signed in. Today a college opens
   on its own the first time a student proves an academic email (.edu, .ac.in ...) at /signin, and other domains
   wait for a site admin. This stub only validates the request and logs it to the server console; nothing is
   stored and nobody is emailed. To finish it: add a `college_interest` table in lib/db.ts, list it at
   /admin/colleges, rate-limit by IP, and send a confirmation with lib/mail.ts. */
export async function POST(req: Request) {
  let body: { college?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const college = typeof body.college === "string" ? body.college.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  if (!college || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "college_and_valid_email_required" }, 422);
  console.log(`[college-interest] ${college} <${email}> (stub: not stored)`);
  return json({ ok: true, stored: false }, 202);
}
export const OPTIONS = preflight;
