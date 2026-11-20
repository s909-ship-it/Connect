import { cover } from "@/lib/identity";

/* A project's cover when it has no image of its own: drawn from its name (?n=). Same name, same cover. */
export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get("n") ?? "").slice(0, 80);
  return new Response(cover(name), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=604800", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
}
