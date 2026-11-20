import { clearSession } from "@/lib/auth";
import { credentialed, trusted } from "@/lib/public-http";

export const dynamic = "force-dynamic";

/* Sign out from the showcase's account menu. POST only, and only from a trusted origin, so another site cannot sign
   people out. Same effect as Connect's own Sign out (the session cookie is cleared). */
export async function POST(req: Request) {
  if (!trusted(req.headers.get("origin"))) return Response.json({ error: "bad_origin" }, { status: 403, headers: credentialed(req) });
  await clearSession();
  return Response.json({ signedIn: false }, { headers: credentialed(req) });
}

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: credentialed(req) });
