import { shippedProjects } from "@/lib/public";
import { intParam, json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
/* GET /api/public/projects?college=<slug>&limit=<n>  Shipped projects, newest first. */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return json(shippedProjects({ college: q.get("college") || undefined, limit: intParam(q.get("limit"), 50) }));
}
export const OPTIONS = preflight;
