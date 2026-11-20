import { all, type Row } from "./db";

export type Tie = { project: string; shipped: boolean };

/* Who has worked with whom, from team records. Only people still on the team count. */
export function ties(): Map<number, Map<number, Tie[]>> {
  const rows = all(
    `SELECT m.user_id, m.project_id, p.name, p.status FROM members m JOIN projects p ON p.id=m.project_id
     WHERE m.status='active' AND p.status<>'dropped' AND p.hidden<>2`); // a private project's team stays private
  const byProject = new Map<number, Row[]>();
  for (const r of rows) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r]);
  const T = new Map<number, Map<number, Tie[]>>();
  for (const team of byProject.values())
    for (const a of team)
      for (const b of team) {
        if (a.user_id === b.user_id) continue;
        if (!T.has(a.user_id)) T.set(a.user_id, new Map());
        const m = T.get(a.user_id)!;
        m.set(b.user_id, [...(m.get(b.user_id) ?? []), { project: a.name, shipped: a.status === "shipped" }]);
      }
  return T;
}

/* One line on how the viewer knows someone: directly, or through one shared teammate. */
export function pathTo(T: Map<number, Map<number, Tie[]>>, me: number, other: number, names: Map<number, string>): string {
  if (me === other) return "";
  const direct = T.get(me)?.get(other);
  if (direct) return "You worked together on " + direct.map((t) => t.project).join(", ");
  for (const [mid, mine] of T.get(me) ?? []) {
    const a = mine.find((t) => t.shipped), b = T.get(mid)?.get(other)?.find((t) => t.shipped);
    if (a && b) return `${names.get(mid)?.split(" ")[0]} shipped ${b.project} with them, and ${a.project} with you`;
  }
  return "No one you have worked with has worked with them yet";
}
