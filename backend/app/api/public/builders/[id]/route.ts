import { builder } from "@/lib/public";
import { json, notFound, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = builder(Number((await params).id));
  return b ? json(b) : notFound();
}
export const OPTIONS = preflight;
