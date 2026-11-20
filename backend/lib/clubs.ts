import { all, db, get, run, now, type Row } from "./db";
import { notify } from "./notify";

/* Clubs. Any verified member can ask to start one, even a club of just themselves, but it stays hidden until an
   admin of their community approves it. Inside an approved club, the lead and the co-leads they choose run it:
   name and description, members and roles, plans, handing over the lead, and deleting it.

   Every function returns null when it worked, or a sentence saying why not. */

export const CLUB = { nameMin: 3, nameMax: 60, aboutMax: 300, roleMax: 40, maxWaiting: 2, planTitleMax: 80, planAboutMax: 300, placeMax: 80 };
type Me = Row;

/* A club in the person's own community, or nothing. */
export const clubFor = (id: number, me: Me): Row | undefined => get("SELECT * FROM clubs WHERE id=? AND college_id=?", id, me.college_id);
const row = (clubId: number, userId: number): Row | undefined => get("SELECT * FROM club_members WHERE club_id=? AND user_id=?", clubId, userId);

/* Approved clubs are open to the whole community. A club waiting for approval, or declined, only to the person
   who asked and the community's admins. */
export const seesClub = (c: Row, me: Me) => c.status === "active" || c.lead_id === me.id || !!me.admin;
export const isLead = (c: Row, me: Me) => c.lead_id === me.id || !!me.admin;
/* Who can change the club: the lead, a co-lead, or a community admin. A waiting club can only be edited by the
   person who asked, so they can fix the name before an admin looks at it. */
export function manages(c: Row, me: Me): boolean {
  if (me.admin) return true;
  if (c.status === "declined") return false;
  if (c.lead_id === me.id) return true;
  if (c.status !== "active") return false;
  const m = row(c.id, me.id);
  return !!(m && m.confirmed && m.manage);
}
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
const admins = (collegeId: number) => all("SELECT id FROM users WHERE college_id=? AND admin=1 AND deleted=0 AND suspended=0", collegeId);

/* A verified member asks to start a club. Returns the new club's id, or why not. */
export function requestClub(me: Me, name: string, about: string): number | string {
  name = cleanName(name);
  if (!me.verified || me.role !== "student") return "Only verified members can start a club.";
  if (name.length < CLUB.nameMin) return "Give the club a name of at least 3 letters.";
  if (name.length > CLUB.nameMax) return "Keep the club's name under 60 letters.";
  if (get("SELECT 1 FROM clubs WHERE college_id=? AND lower(name)=lower(?) AND status<>'declined'", me.college_id, name)) return "A club with that name already exists in your community.";
  const waiting = Number(get("SELECT COUNT(*) n FROM clubs WHERE created_by=? AND status='pending'", me.id)?.n ?? 0);
  if (waiting >= CLUB.maxWaiting) return "You already have clubs waiting for an admin. Wait for an answer first.";
  const id = db.transaction(() => {
    const cid = Number(run("INSERT INTO clubs (name, about, lead_id, college_id, status, created_by, created_at) VALUES (?,?,?,?, 'pending', ?, ?)",
      name, about.trim().slice(0, CLUB.aboutMax), me.id, me.college_id, me.id, now()).lastInsertRowid);
    run("INSERT INTO club_members (club_id, user_id, role, confirmed) VALUES (?,?,'Lead',1)", cid, me.id);
    return cid;
  })();
  for (const a of admins(me.college_id)) if (a.id !== me.id) notify(a.id, `${me.name} asked to start a club: ${name}`, "/admin#clubs");
  // An admin starting a club needs nobody's permission.
  if (me.admin) run("UPDATE clubs SET status='active', decided_by=?, decided_at=? WHERE id=?", me.id, now(), id);
  return id;
}

/* An admin approves or declines a club that is waiting. */
export function decideClub(me: Me, c: Row, approve: boolean, reason = ""): string | null {
  if (!me.admin) return "Only an admin of your community can approve clubs.";
  if (c.status !== "pending") return "That club is not waiting for approval.";
  if (!approve && reason.trim().length < 5) return "Say in a few words why it is declined. The person who asked will see it.";
  run("UPDATE clubs SET status=?, decided_by=?, decided_at=?, decline_reason=? WHERE id=?", approve ? "active" : "declined", me.id, now(), approve ? "" : reason.trim().slice(0, 300), c.id);
  notify(c.lead_id, approve ? `${c.name} is approved. It is now on the Clubs page for everyone in your community.` : `${c.name} was not approved: ${reason.trim().slice(0, 120)}`, `/clubs/${c.id}`);
  return null;
}

export function updateClub(me: Me, c: Row, name: string, about: string): string | null {
  if (!manages(c, me)) return "Only the club's lead or co-leads can change it.";
  name = cleanName(name);
  if (name.length < CLUB.nameMin || name.length > CLUB.nameMax) return "The name needs 3 to 60 letters.";
  if (get("SELECT 1 FROM clubs WHERE college_id=? AND lower(name)=lower(?) AND id<>? AND status<>'declined'", c.college_id, name, c.id)) return "Another club already has that name.";
  run("UPDATE clubs SET name=?, about=? WHERE id=?", name, about.trim().slice(0, CLUB.aboutMax), c.id);
  return null;
}

/* Someone asks to join an approved club. The lead or a co-lead confirms. */
export function askToJoin(me: Me, c: Row): string | null {
  if (c.status !== "active") return "This club is not open yet.";
  if (!me.verified || me.role !== "student") return "Only verified members can join clubs.";
  const m = row(c.id, me.id);
  if (m?.confirmed) return "You are already in this club.";
  if (m?.invited_by) { run("UPDATE club_members SET confirmed=1 WHERE club_id=? AND user_id=?", c.id, me.id); return null; }
  if (!m) run("INSERT INTO club_members (club_id, user_id) VALUES (?,?)", c.id, me.id);
  for (const x of managers(c)) notify(x, `${me.name} asked to join ${c.name}`, `/clubs/${c.id}`);
  return null;
}
const managers = (c: Row): number[] => [...new Set([c.lead_id, ...all("SELECT user_id FROM club_members WHERE club_id=? AND confirmed=1 AND manage=1", c.id).map((r) => r.user_id as number)])];

/* The lead or a co-lead adds someone. They are asked first, so nobody is put in a club without saying yes. */
export function inviteMember(me: Me, c: Row, userId: number): string | null {
  if (!manages(c, me)) return "Only the club's lead or co-leads can add members.";
  if (c.status !== "active") return "Members can be added once an admin approves the club.";
  const u = get("SELECT * FROM users WHERE id=? AND college_id=? AND verified=1 AND deleted=0 AND suspended=0 AND role='student'", userId, c.college_id);
  if (!u) return "Pick a verified member of your community.";
  const m = row(c.id, u.id);
  if (m?.confirmed) return `${u.name} is already in the club.`;
  if (m && !m.invited_by) {
    // They had already asked to join: inviting them is the same as saying yes.
    run("UPDATE club_members SET confirmed=1 WHERE club_id=? AND user_id=?", c.id, u.id);
    notify(u.id, `You are now a member of ${c.name}`, `/clubs/${c.id}`);
    return null;
  }
  if (!m) run("INSERT INTO club_members (club_id, user_id, invited_by) VALUES (?,?,?)", c.id, u.id, me.id);
  notify(u.id, `${me.name} invited you to join ${c.name}`, `/clubs/${c.id}`);
  return null;
}
export function answerInvite(me: Me, c: Row, accept: boolean): string | null {
  const m = row(c.id, me.id);
  if (!m || m.confirmed || !m.invited_by) return "There is no invitation waiting for you here.";
  if (accept) run("UPDATE club_members SET confirmed=1 WHERE club_id=? AND user_id=?", c.id, me.id);
  else run("DELETE FROM club_members WHERE club_id=? AND user_id=?", c.id, me.id);
  if (accept) notify(m.invited_by, `${me.name} joined ${c.name}`, `/clubs/${c.id}`);
  return null;
}

/* Confirm a request, or change someone's role and whether they help run the club. */
export function setMember(me: Me, c: Row, userId: number, role: string, manage: boolean): string | null {
  if (!manages(c, me)) return "Only the club's lead or co-leads can change members.";
  const m = row(c.id, userId);
  if (!m) return "That person is not in the club.";
  if (userId === c.lead_id) return "The lead's role is Lead. Hand over the lead to change it.";
  // Only the lead (or an admin) decides who else runs the club.
  const giveManage = isLead(c, me) ? manage : !!m.manage;
  const was = m.confirmed;
  if (m.invited_by && !m.confirmed) return "They have not said yes to the invitation yet.";
  run("UPDATE club_members SET confirmed=1, role=?, manage=? WHERE club_id=? AND user_id=?", role.trim().slice(0, CLUB.roleMax) || "Member", giveManage ? 1 : 0, c.id, userId);
  if (!was) notify(userId, `You are now a member of ${c.name}`, `/clubs/${c.id}`);
  else if (giveManage && !m.manage) notify(userId, `You can now help run ${c.name}`, `/clubs/${c.id}`);
  return null;
}

/* Remove someone, decline a request, take back an invitation, or leave yourself. */
export function removeMember(me: Me, c: Row, userId: number): string | null {
  if (userId === c.lead_id) return "The lead cannot leave or be removed. Hand over the lead first, or delete the club.";
  const m = row(c.id, userId);
  if (!m) return null;
  if (userId !== me.id) {
    if (!manages(c, me)) return "Only the club's lead or co-leads can remove members.";
    if (m.manage && !isLead(c, me)) return "Only the lead can remove a co-lead.";
  }
  run("DELETE FROM club_members WHERE club_id=? AND user_id=?", c.id, userId);
  return null;
}

/* The lead hands the club to a confirmed member. The old lead stays in as a co-lead. */
export function transferLead(me: Me, c: Row, userId: number): string | null {
  if (!isLead(c, me)) return "Only the lead can hand over the club.";
  if (c.status !== "active") return "Wait until the club is approved.";
  const m = row(c.id, userId);
  if (!m?.confirmed || userId === c.lead_id) return "Pick a confirmed member of the club.";
  db.transaction(() => {
    run("UPDATE club_members SET role='Co-lead', manage=1 WHERE club_id=? AND user_id=?", c.id, c.lead_id);
    run("UPDATE club_members SET role='Lead', manage=1 WHERE club_id=? AND user_id=?", c.id, userId);
    run("UPDATE clubs SET lead_id=? WHERE id=?", userId, c.id);
  })();
  notify(userId, `You are now the lead of ${c.name}`, `/clubs/${c.id}`);
  return null;
}

/* The lead (or an admin) deletes the club. Its plans and roster go with it; projects and credit are untouched. */
export function deleteClub(me: Me, c: Row, typed: string): string | null {
  if (!isLead(c, me)) return "Only the lead can delete the club.";
  if (cleanName(typed).toLowerCase() !== cleanName(c.name).toLowerCase()) return "Type the club's name exactly to delete it.";
  const people = all("SELECT user_id FROM club_members WHERE club_id=? AND confirmed=1 AND user_id<>?", c.id, me.id).map((r) => r.user_id as number);
  db.transaction(() => {
    run("DELETE FROM club_plans WHERE club_id=?", c.id);
    run("DELETE FROM club_members WHERE club_id=?", c.id);
    run("UPDATE commissions SET club_id=NULL WHERE club_id=?", c.id);
    run("DELETE FROM clubs WHERE id=?", c.id);
  })();
  for (const u of people) notify(u, `${c.name} was deleted by ${me.name}`, "/clubs");
  return null;
}

/* Plans: what the club is doing next, with a day and a place. Leads and co-leads add them; members are told. */
export function addPlan(me: Me, c: Row, title: string, about: string, day: string, place: string): string | null {
  if (!manages(c, me)) return "Only the club's lead or co-leads can add plans.";
  if (c.status !== "active") return "Plans can be added once an admin approves the club.";
  title = cleanName(title);
  if (title.length < 3) return "Give the plan a title.";
  const at = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Math.floor(Date.parse(day + "T00:00:00+05:30") / 1000) : NaN;
  if (!Number.isFinite(at)) return "Pick a day for the plan.";
  if (at < now() - 86400) return "Pick today or a day after it.";
  run("INSERT INTO club_plans (club_id, title, about, day, place, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
    c.id, title.slice(0, CLUB.planTitleMax), about.trim().slice(0, CLUB.planAboutMax), at, place.trim().slice(0, CLUB.placeMax), me.id, now());
  for (const u of all("SELECT user_id FROM club_members WHERE club_id=? AND confirmed=1 AND user_id<>?", c.id, me.id))
    notify(u.user_id, `${c.name} planned: ${title.slice(0, 60)}`, `/clubs/${c.id}#plans`);
  return null;
}
export function removePlan(me: Me, c: Row, planId: number): string | null {
  if (!manages(c, me)) return "Only the club's lead or co-leads can remove plans.";
  run("DELETE FROM club_plans WHERE id=? AND club_id=?", planId, c.id);
  return null;
}
