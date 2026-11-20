import { currentUser } from "@/lib/auth";
import { account } from "@/lib/public";
import { credentialed, trusted } from "@/lib/public-http";

export const dynamic = "force-dynamic";

/* Who is signed in, for the showcase's account menu. Answers only a trusted origin (lib/public-http.ts);
   anyone else is told nobody is signed in, so the cookie never vouches for a stranger's page. */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const me = !origin || trusted(origin) ? await currentUser() : null;
  return Response.json(account(me && !me.deleted ? me : null), { headers: credentialed(req) });
}

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: credentialed(req) });
