import { signedLines } from "@/lib/public";
import { intParam, json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return json(signedLines(intParam(new URL(req.url).searchParams.get("limit"), 6)));
}
export const OPTIONS = preflight;
