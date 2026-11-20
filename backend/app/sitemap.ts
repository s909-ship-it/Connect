import type { MetadataRoute } from "next";
import { baseUrl, demoMode } from "@/lib/auth";
import { activeColleges } from "@/lib/college";

export const dynamic = "force-dynamic";

/* Only pages anyone may read: the home page, the rules, the colleges and their public pages.
   Profiles are open to anyone with the link but are not listed here, so search engines do not crawl students. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (demoMode) return [];
  const base = baseUrl();
  const fixed: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/rules`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/colleges`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.3 },
  ];
  return [...fixed, ...activeColleges().map((c) => ({ url: `${base}/c/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 }))];
}
