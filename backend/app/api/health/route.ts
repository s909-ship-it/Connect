import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

/* For uptime checks and container health probes. */
export function GET() {
  try {
    get("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
