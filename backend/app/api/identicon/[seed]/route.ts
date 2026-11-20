import { identicon } from "@/lib/identity";

/* The pattern that stands in for an anonymous person's photo. It depends only on the alias, so it can be cached for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ seed: string }> }) {
  const seed = decodeURIComponent((await params).seed).slice(0, 60);
  return new Response(identicon(seed), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
}
