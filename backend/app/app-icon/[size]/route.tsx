import { markPng } from "../../mark";

const SIZES = new Set([192, 512]);

/* /app-icon/192 and /app-icon/512 for the web app manifest. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  if (!SIZES.has(n)) return new Response("Not found", { status: 404 });
  return markPng(n, true);
}
