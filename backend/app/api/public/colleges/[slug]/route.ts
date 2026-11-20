import { college } from "@/lib/public";
import { json, notFound, preflight } from "@/lib/public-http";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const c = college((await params).slug);
  return c ? json(c) : notFound();
}
export const OPTIONS = preflight;
