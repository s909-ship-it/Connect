import { skills } from "@/lib/public";
import { json, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export const GET = () => json(skills());
export const OPTIONS = preflight;
