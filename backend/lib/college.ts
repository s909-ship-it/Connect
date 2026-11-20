import { all, get, run, now, type Row } from "./db";
import { baseDomain, domainOf, isAcademic, matchCollege, slugify } from "./domains";

/* Colleges. Each one is its own space: its own board, people, clubs, funding and admins.
   You belong to a college only by proving an email address on one of its domains. */

export const collegeById = (id: number | null | undefined): Row | undefined => (id ? get("SELECT * FROM colleges WHERE id=?", id) : undefined);
export const collegeBySlug = (slug: string): Row | undefined => get("SELECT * FROM colleges WHERE slug=?", slug);
export const activeColleges = (): Row[] => all("SELECT * FROM colleges WHERE status='active' ORDER BY name");

/* The college an email address belongs to, if any (active or still waiting for approval). */
export function collegeForEmail(email: string): Row | undefined {
  return matchCollege(domainOf(email), all("SELECT * FROM colleges WHERE status IN ('active','pending')"));
}

/* Adds a college the first time someone proves an email on its domain. Domains only institutions can register
   (.edu, .ac.in ...) open at once; any other domain waits for a site admin to check it is really a college. */
export function addCollege(name: string, email: string, by: number): Row {
  const domain = baseDomain(domainOf(email));
  const base = slugify(name);
  let slug = base;
  for (let i = 2; get("SELECT 1 FROM colleges WHERE slug=?", slug); i++) slug = `${base}-${i}`;
  const id = Number(run("INSERT INTO colleges (slug, name, domains, status, requested_by, created_at) VALUES (?,?,?,?,?,?)",
    slug, name.slice(0, 80), domain, isAcademic(domain) ? "active" : "pending", by, now()).lastInsertRowid);
  return collegeById(id)!;
}

/* Can this person use their college's space? Verified, attached to a college, and that college is open. */
export function isMember(u: Row | null | undefined): boolean {
  if (!u?.verified || !u.college_id) return false;
  return collegeById(u.college_id)?.status === "active";
}

export const domainsOf = (c: Row) => String(c.domains).split(",").map((d) => d.trim()).filter(Boolean);
