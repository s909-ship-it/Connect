import { shippedProject } from "@/lib/public";
import { json, notFound, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = shippedProject(Number((await params).id));
  return p ? json(p) : notFound();
}
export const OPTIONS = preflight;
