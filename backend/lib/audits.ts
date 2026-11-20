import { all, now, type Row } from "./db";
import { RULES } from "./rules";

/* Spot checks: an admin looks again at a recently shipped project. Their verdict replaces the reviewers', sets the
   pot, and is what reviewer accuracy is measured against. */

/* Shipped projects at this college that this admin can still spot-check: recent, not checked yet, not their own. */
export function auditable(collegeId: number, adminId: number): Row[] {
  return all(
    `SELECT p.id, p.name, p.pot, p.shipped_at FROM projects p
     WHERE p.college_id=? AND p.status='shipped' AND p.hidden=0 AND p.shipped_at>=?
       AND NOT EXISTS (SELECT 1 FROM audits a WHERE a.project_id=p.id)
       AND NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?)
     ORDER BY p.shipped_at DESC`,
    collegeId, now() - RULES.review.auditDays * 86400, adminId,
  );
}
