import type { MetadataRoute } from "next";
import { baseUrl, demoMode } from "@/lib/auth";

// Read per request: the address and the demo switch come from the server's settings, not the build.
export const dynamic = "force-dynamic";

/* The real site lets search engines read its public pages; a test copy asks them to stay out entirely. */
export default function robots(): MetadataRoute.Robots {
  if (demoMode) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/messages", "/inbox", "/settings", "/onboarding", "/share"] },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}
