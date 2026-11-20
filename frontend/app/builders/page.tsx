import type { Metadata } from "next";
import { api } from "@/lib/api";
import { BuilderList } from "@/components/builder-list";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Builders", description: "Verified students with shipped, signed projects, ordered by credit earned." };

export default async function Builders() {
  const builders = await api.builders(100);
  return (
    <section className="sec light page-top">
      <h1 className="mega" data-reveal>Builders</h1>
      <p className="lead page-lead" data-reveal>Verified students with at least one shipped project, ordered by credit earned. Credit is worked out from team, review and split records every time, so nobody can edit it.</p>
      <BuilderList builders={builders} />
    </section>
  );
}
