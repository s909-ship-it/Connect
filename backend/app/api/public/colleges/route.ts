import { colleges } from "@/lib/public";
import { json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export const GET = () => json(colleges());
export const OPTIONS = preflight;
