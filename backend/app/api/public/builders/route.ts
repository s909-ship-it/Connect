import { builders } from "@/lib/public";
import { intParam, json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
/* GET /api/public/builders?limit=<n>  Verified students with at least one shipped project, by credit earned. */
export function GET(req: Request) {
  return json(builders(intParam(new URL(req.url).searchParams.get("limit"), 20)));
}
export const OPTIONS = preflight;
