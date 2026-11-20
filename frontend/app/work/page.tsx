import type { Metadata } from "next";
import { api } from "@/lib/api";
import { ProjectCard } from "@/components/project-card";

// Rendered per request so a build never needs the backend; API responses are still cached (lib/api.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Work", description: "Every project shipped on Connect and reviewed by people outside the team." };

export default async function Work() {
  const projects = await api.projects({ limit: 200 });
  return (
    <section className="sec dark page-top">
      <h1 className="mega red" data-reveal>Work <sup className="mega-count">({projects.length})</sup></h1>
      <p className="lead page-lead" data-reveal>Every project here shipped: two people outside the team opened the proof and signed off on it.</p>
      <div className="work-list">{projects.map((p, i) => <ProjectCard key={p.id} p={p} index={i} />)}</div>
    </section>
  );
}
