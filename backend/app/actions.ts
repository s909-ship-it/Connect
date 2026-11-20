"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { all, get, run, db, now, type Row } from "@/lib/db";
import { compute, RULES } from "@/lib/credit";
import { requireUser, currentUser, setSession, clearSession, devLogin, autoVerify, recordLogin } from "@/lib/auth";
import { addFeedback, answerFeedback } from "@/lib/feedback";
import { CODE_MINUTES, TRUST_DAYS, checkLoginCode, domainTakesMail, forgetDevices, needsCode, pendingToken, readPending, sendLoginCode, trustDevice } from "@/lib/twostep";
import { addCollege, collegeById, collegeForEmail, isMember } from "@/lib/college";
import { domainOf, isEmail, isPublicMail, slugify } from "@/lib/domains";
import { notify, logUpdate, allow, deviceName } from "@/lib/notify";
import { CONSENT_COOKIE, CONSENT_DAYS } from "@/lib/consent";
import { systemLine } from "@/lib/teamchat";
import { forgetTeamspace } from "@/lib/teamspace";
import { resumeFacts, writeResume } from "@/lib/resume";
import { parseSkills } from "@/lib/skills";
import { needsFromList } from "@/lib/relevance";
import { alumUsed, giftBlock, pairBlock, type CommRow, type GiftRow } from "@/lib/commissions";
import { auditable } from "@/lib/audits";
import * as Club from "@/lib/clubs";
import { mailReady, sendMail } from "@/lib/mail";
import { remove as removeFile, save as saveFile, sniff, cleanName } from "@/lib/files";
import { checkLive, liveUrl } from "@/lib/live";
import { eligibleReviewers, pickReviewers, teamTies, verdictOf } from "@/lib/reviewers";

/* ---------- plumbing ---------- */
function safeBack(v: FormDataEntryValue | null) {
  const s = String(v || "/");
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  const u = new URL(s, "http://x");
  u.searchParams.delete("err");
  u.searchParams.delete("ok");
  return u.pathname + u.search;
}
function bounce(back: string, key: "err" | "ok", msg: string): never {
  redirect(back + (back.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(msg));
}
function done(back: string, msg?: string): never {
  revalidatePath("/", "layout");
  if (msg) bounce(back, "ok", msg);
  redirect(back);
}
async function ctx(fd: FormData, needVerified = true) {
  const me = await requireUser();
  const back = safeBack(fd.get("back"));
  if (!allow(`act:${me.id}`, 40, 60)) bounce(back, "err", "Slow down a little. Try again in a minute.");
  if (needVerified && !isMember(me))
    bounce(back, "err", me.role === "alum" ? "An admin of your community has to approve your alumni account first." : "Verify your college or work email first.");
  return {
    me, back,
    s: (k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max),
    n: (k: string) => Math.trunc(Number(fd.get(k))) || 0,
    fail: (msg: string): never => bounce(back, "err", msg),
  };
}
const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
/* A project, only if it belongs to the person's own college. Every project action goes through this. */
const project = (id: number, me: Row): Row | undefined => get("SELECT * FROM projects WHERE id=? AND college_id=?", id, me.college_id);
/* Someone at the same college. */
const colleague = (id: number, me: Row, extra = ""): Row | undefined =>
  get(`SELECT * FROM users WHERE id=? AND college_id=? AND deleted=0 ${extra}`, id, me.college_id);
const member = (pid: number, uid: number): Row | undefined => get("SELECT * FROM members WHERE project_id=? AND user_id=?", pid, uid);
const isActive = (pid: number, uid: number) => member(pid, uid)?.status === "active";
const open = (p: Row) => p.status === "recruiting" || p.status === "building";

/* ---------- sign-in, onboarding, verification ---------- */
export async function devSignIn(fd: FormData) {
  if (!devLogin) redirect("/signin");
  const u = get("SELECT * FROM users WHERE id=?", Number(fd.get("id")));
  if (!u) redirect("/");
  const jar = await cookies();
  // With TWO_STEP_DEV=1 the sample sign-in also stops for a code, so the second step can be tried without Google.
  if (process.env.TWO_STEP_DEV === "1" && needsCode(u, jar.get("td")?.value) && (await sendLoginCode(u))) {
    jar.set("pending", pendingToken(u.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CODE_MINUTES * 60 });
    redirect("/signin/verify");
  }
  await setSession(u.id);
  redirect("/");
}
/* Step two of sign-in: the code from the email. Right code: signed in, and the device is remembered if they asked. */
export async function verifyLogin(fd: FormData) {
  const jar = await cookies();
  const id = readPending(jar.get("pending")?.value);
  if (!id) redirect("/signin?err=" + encodeURIComponent("That sign-in ran out of time. Start again."));
  const say = (m: string): never => redirect("/signin/verify?err=" + encodeURIComponent(m));
  if (!allow(`2fav:${id}`, 12, 600)) say("Too many tries. Wait ten minutes.");
  const r = checkLoginCode(id!, String(fd.get("code") ?? ""));
  if (r === "expired") say("That code has expired. Send a new one.");
  if (r === "locked") say("Too many wrong tries. Send a new code.");
  if (r === "wrong") say("Wrong code. Check the latest email.");
  const u = get("SELECT id, suspended FROM users WHERE id=?", id);
  if (!u || u.suspended) redirect("/signin?err=" + encodeURIComponent("This account has been suspended by an admin."));
  const device = deviceName((await headers()).get("user-agent"));
  if (fd.get("trust")) jar.set("td", trustDevice(id!, device), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TRUST_DAYS * 86400 });
  jar.delete("pending");
  recordLogin(id!, device, notify);
  await setSession(id!);
  revalidatePath("/", "layout");
  redirect("/");
}
export async function resendLogin() {
  const id = readPending((await cookies()).get("pending")?.value);
  if (!id) redirect("/signin?err=" + encodeURIComponent("That sign-in ran out of time. Start again."));
  const say = (k: "ok" | "err", m: string): never => redirect(`/signin/verify?${k}=` + encodeURIComponent(m));
  if (!allow(`2fa:${id}`, 5, 900)) say("err", "Too many codes requested. Wait fifteen minutes.");
  const u = get("SELECT * FROM users WHERE id=? AND suspended=0", id);
  if (!u || !(await sendLoginCode(u))) say("err", "We could not email the code. Try again in a minute.");
  say("ok", "A new code is on its way. Older codes no longer work.");
}
export async function signOut() {
  await clearSession();
  redirect("/signin");
}
/* Step 2's "use my college or work Google account": leave this account and go straight to Google's account picker,
   so the person can choose the account whose verified email proves their community. */
export async function switchToWorkGoogle() {
  await clearSession();
  redirect("/api/auth/google");
}
export async function saveProfile(fd: FormData) {
  const me = await currentUser();
  if (!me) redirect("/signin");
  const s = (k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
  const year = Number(fd.get("grad_year"));
  if (!s("branch") || !(year > 1950 && year < 2100)) redirect("/onboarding?err=" + encodeURIComponent("Fill in your branch and graduation year."));
  // The student/alum choice is made once. Changing it later would dodge verification.
  const role = me.onboarded ? me.role : fd.get("role") === "alum" ? "alum" : "student";
  const back = me.onboarded ? "/onboarding?edit=1" : "/onboarding";
  const links: Record<string, string> = {};
  for (const [k, host] of [["github", "github.com"], ["linkedin", "linkedin.com"], ["website", ""]] as const) {
    const v = s(k, 200);
    if (v && !profileLink(v, host)) redirect(back + (back.includes("?") ? "&" : "?") + "err=" + encodeURIComponent(
      host ? `That ${k === "github" ? "GitHub" : "LinkedIn"} link does not look right. Paste the full https://${host}/... address.` : "The website link has to start with https://"));
    links[k] = v;
  }
  // Alumni say which college they are from; an admin of that college approves them by hand.
  const alumCollege = !me.onboarded && role === "alum" ? get("SELECT * FROM colleges WHERE id=? AND status='active'", Number(fd.get("college"))) : null;
  if (!me.onboarded && role === "alum" && !alumCollege) redirect(back + "?err=" + encodeURIComponent("Pick the community you used to be part of."));
  if (!me.onboarded && !fd.get("terms")) redirect(back + "?err=" + encodeURIComponent("Tick the box to agree to the Terms and the Privacy policy."));
  if (!me.onboarded) run("UPDATE users SET terms_at=? WHERE id=?", now(), me.id);
  run("UPDATE users SET branch=?, grad_year=?, skills=?, about=?, role=?, github=?, linkedin=?, website=?, onboarded=1 WHERE id=?",
    s("branch", 60), year, s("skills"), s("about"), role, links.github, links.linkedin, links.website, me.id);
  if (alumCollege) {
    run("UPDATE users SET verified=0, college_email=NULL, college_id=? WHERE id=?", alumCollege.id, me.id);
    for (const a of all("SELECT id FROM users WHERE admin=1 AND college_id=?", alumCollege.id))
      notify(a.id, `${me.name} says they are an alum of ${alumCollege.name}. Approve them if that is true.`, "/admin");
  }
  const auto = !me.onboarded && autoVerify(me.id);
  revalidatePath("/", "layout");
  if (auto) redirect("/?ok=" + encodeURIComponent(`Your college or work email is verified. You start with ${RULES.starter} credit.`));
  redirect(me.onboarded ? `/u/${me.id}` : "/onboarding");
}
/* A link a person adds to their profile: https only, and on the right site when one is expected. */
function profileLink(v: string, host: string) {
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return false;
    return !host || u.hostname === host || u.hostname.endsWith("." + host);
  } catch { return false; }
}
export async function sendCode(fd: FormData) {
  const { me, s, fail } = await ctx(fd, false);
  if (me.role !== "student") fail("Alumni are approved by an admin of their community, not by email code.");
  if (me.verified && me.college_id) fail(`You are already verified at ${collegeById(me.college_id)?.name ?? "your community"}. A verified account stays with its community.`);
  const email = s("email").toLowerCase(), domain = domainOf(email);
  if (!isEmail(email)) fail("That does not look like an email address.");
  if (isPublicMail(domain)) fail("Use the email your college or workplace gave you, not a personal one like Gmail. That is what proves which community you belong to.");
  if (get("SELECT 1 FROM users WHERE college_email=? AND id<>?", email, me.id)) fail("That college email is already linked to another account.");
  const known = collegeForEmail(email), name = s("college_name", 80);
  if (!known && name.length < 3) fail(`@${domain} is not on Connect yet. Add your community's full name and we will set it up.`);
  // Before spending a code: can that domain receive email at all? Catches typos and invented domains.
  if (mailReady() && !(await domainTakesMail(domain))) fail(`@${domain} cannot receive email, so it cannot be verified. Check the spelling of your college or work address.`);
  if (!allow(`code:${me.id}`, 3, 600)) fail("Too many codes requested. Wait ten minutes.");
  const code = String(crypto.randomInt(100000, 1000000));
  run("INSERT OR REPLACE INTO codes (user_id, email, code, expires, tries, college_name) VALUES (?,?,?,?,0,?)", me.id, email, code, now() + 900, known ? "" : name);
  if (mailReady()) {
    if (!(await sendMail(email, "Your Connect code", `Your Connect verification code is ${code}. It expires in 15 minutes.\n\nIf you did not ask for this, ignore this email.`)))
      fail("Could not send the email. Try again in a minute.");
  } else if (process.env.NODE_ENV === "production") {
    run("DELETE FROM codes WHERE user_id=?", me.id);
    fail("Email codes are not switched on yet. Sign out and sign in with your college or work Google account instead; that verifies you straight away. Or ask your community's admin below.");
  } else {
    console.log(`[connect] verification code for ${email}: ${code}`);
  }
  done("/onboarding", `Code sent to ${email}. It expires in 15 minutes.`);
}
export async function verifyCode(fd: FormData) {
  const { me, s, fail } = await ctx(fd, false);
  const c = get("SELECT * FROM codes WHERE user_id=?", me.id);
  if (!c || c.expires < now()) fail("That code has expired. Send a new one.");
  if (c.tries >= 5) fail("Too many wrong tries. Send a new code.");
  const typed = Buffer.from(s("code", 12)), real = Buffer.from(String(c.code));
  if (typed.length !== real.length || !crypto.timingSafeEqual(typed, real)) {
    run("UPDATE codes SET tries=tries+1 WHERE user_id=?", me.id);
    fail("Wrong code.");
  }
  if (me.verified && me.college_id) fail("You are already verified.");
  if (get("SELECT 1 FROM users WHERE college_email=? AND id<>?", c.email, me.id)) fail("That college email is already linked to another account.");
  const college = db.transaction(() => {
    const col = collegeForEmail(c.email) ?? addCollege(c.college_name || domainOf(c.email), c.email, me.id);
    run("UPDATE users SET verified=1, college_email=?, college_id=? WHERE id=?", c.email, col.id, me.id);
    run("DELETE FROM codes WHERE user_id=?", me.id);
    return col;
  })();
  if (college.status !== "active") {
    for (const a of all("SELECT id FROM users WHERE super=1")) notify(a.id, `New college waiting for approval: ${college.name} (@${college.domains})`, "/admin/colleges");
    done("/onboarding", `Email confirmed. ${college.name} is new on Connect, so the team checks it first. You will get in as soon as it is approved.`);
  }
  done("/", `Verified at ${college.name}. You start with ${RULES.starter} credit.`);
}
/* The email Google or LinkedIn confirmed at sign-in is already proof. If it is on a college domain, the student can join
   that college with it (adding the college, with a name they give, if it is new on Connect). */
export async function joinWithSignInEmail(fd: FormData) {
  const { me, s, fail } = await ctx(fd, false);
  if (me.role !== "student") fail("Alumni are approved by an admin of their community.");
  if (me.verified && me.college_id) fail("You are already verified.");
  const email = String(me.email ?? "").toLowerCase(), domain = domainOf(email);
  if (!me.email_verified || !isEmail(email) || isPublicMail(domain)) fail("Your sign-in email is not a college or work email. Use a code instead.");
  if (get("SELECT 1 FROM users WHERE college_email=? AND id<>?", email, me.id)) fail("That college email is already linked to another account.");
  const name = s("college_name", 80);
  const known = collegeForEmail(email);
  if (!known && name.length < 3) fail("Add your community's full name.");
  const college = db.transaction(() => {
    const col = known ?? addCollege(name, email, me.id);
    run("UPDATE users SET verified=1, college_email=?, college_id=? WHERE id=?", email, col.id, me.id);
    return col;
  })();
  if (college.status !== "active") {
    for (const a of all("SELECT id FROM users WHERE super=1")) notify(a.id, `New college waiting for approval: ${college.name} (@${college.domains})`, "/admin/colleges");
    done("/onboarding", `Email confirmed. ${college.name} is new on Connect, so the team checks it first.`);
  }
  done("/", `Verified at ${college.name}. You start with ${RULES.starter} credit.`);
}

/* No email code available: the student names their college and waits for one of its admins to vouch for them. */
export async function askCollegeAdmin(fd: FormData) {
  const { me, n, fail } = await ctx(fd, false);
  if (me.role !== "student" || (me.verified && me.college_id)) fail("This is only for members who have not verified yet.");
  const c = get("SELECT * FROM colleges WHERE id=? AND status='active'", n("college"));
  if (!c) fail("Pick your community.");
  run("UPDATE users SET college_id=? WHERE id=? AND verified=0", c.id, me.id);
  for (const a of all("SELECT id FROM users WHERE admin=1 AND college_id=?", c.id))
    notify(a.id, `${me.name} asked to be verified as a member of ${c.name}`, "/admin");
  done("/onboarding", `Asked the admins of ${c.name}. You will get a note in your inbox once they verify you.`);
}

/* ---------- projects ---------- */
export async function createProject(fd: FormData) {
  const { me, s, fail } = await ctx(fd);
  if (me.role !== "student") fail("Only members can start projects.");
  const name = s("name", 60), pitch = s("pitch"), ms = lines(s("milestones", 1000)), roles = lines(s("roles", 1000));
  if (!name || !pitch || !ms.length) fail("Give it a name, one line on what it does, and at least one milestone.");
  // hidden: 0 shows it to the whole community, 2 keeps it to the team (1 is an admin hiding it).
  const priv = s("visibility") === "private";
  const id = db.transaction(() => {
    const pid = Number(run("INSERT INTO projects (name, pitch, status, lead_id, college_id, created_at, hidden) VALUES (?,?,?,?,?,?,?)",
      name, pitch, roles.length ? "recruiting" : "building", me.id, me.college_id, now(), priv ? 2 : 0).lastInsertRowid);
    run("INSERT INTO members (project_id, user_id, role) VALUES (?,?,?)", pid, me.id, s("myrole", 60) || "Lead");
    for (const m of ms) run("INSERT INTO milestones (project_id, title) VALUES (?,?)", pid, m.slice(0, 120));
    for (const k of parseSkills(s("skills", 300))) run("INSERT OR IGNORE INTO project_skills (project_id, skill) VALUES (?,?)", pid, k);
    for (const r of roles) {
      const [title, ...note] = r.split(" - ");
      run("INSERT INTO roles (project_id, title, note) VALUES (?,?,?)", pid, title.slice(0, 60), note.join(" - ").slice(0, 160));
    }
    logUpdate(pid, me.id, `${me.name} posted the project`);
    return pid;
  })();
  done(`/projects/${id}`, priv ? "Project created. It is private: only your team can see it until you make it public." : "Project posted.");
}
/* The lead decides who sees an open project: everyone in the community, or only the team. An admin's hiding wins. */
export async function setVisibility(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || !open(p)) fail("Only the lead can change who sees an open project.");
  if (p!.hidden === 1) fail("An admin has hidden this project, so only they can show it again.");
  const priv = s("visibility") === "private";
  run("UPDATE projects SET hidden=? WHERE id=?", priv ? 2 : 0, p!.id);
  if (!priv && p!.hidden === 2) logUpdate(p!.id, me.id, `${me.name} made the project public`);
  done(back, priv ? "Private. Only your team and your community's admins can see it now." : "Public. Everyone in your community can find it now.");
}
export async function editProject(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || !open(p)) fail("Only the lead can edit a project before it goes for review.");
  const name = s("name", 60), pitch = s("pitch");
  if (!name || !pitch) fail("Give it a name and one line on what it does.");
  run("UPDATE projects SET name=?, pitch=? WHERE id=?", name, pitch, p!.id);
  if (name !== p!.name) logUpdate(p!.id, me.id, `Renamed from ${p!.name}`);
  done(back, "Project updated.");
}
/* The skills a project uses. This is only the list teammates and reviewers tick from: listing a skill here gives
   no one any score. The lead sets it while the project is open. A project that shipped before skills existed can
   have its list filled in once by anyone on the team. */
export async function setProjectSkills(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  const legacy = p?.status === "shipped" && (p.shipped_at ?? 0) < RULES.cutover && isActive(p.id, me.id);
  if (!p || !((p.lead_id === me.id && open(p)) || legacy)) fail("Only the lead can set the skills, before the project goes for review.");
  const list = parseSkills(s("skills", 300));
  if (!list.length) fail("List at least one skill, separated by commas.");
  db.transaction(() => {
    run("DELETE FROM project_skills WHERE project_id=?", p!.id);
    for (const k of list) run("INSERT INTO project_skills (project_id, skill) VALUES (?,?)", p!.id, k);
    run(`DELETE FROM member_skills WHERE project_id=? AND skill NOT IN (${list.map(() => "?").join(",")})`, p!.id, ...list);
  })();
  done(back, "Skills saved.");
}
/* After a project ships, each teammate ticks which of its skills every other teammate actually used.
   A skill counts for someone once half of their teammates ticked it. You never tick your own.
   On a solo project there are no teammates, so an admin (or a reviewer, during review) does it. */
export async function tickSkills(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.status !== "shipped") fail("Skills are confirmed after a project ships.");
  const team = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id).map((r) => r.user_id as number);
  const onIt = team.includes(me.id);
  if (!(onIt && team.length > 1) && !(me.admin && team.length === 1 && !onIt)) fail("Only teammates can confirm each other's skills.");
  const menu = new Set(all("SELECT skill FROM project_skills WHERE project_id=?", p!.id).map((r) => r.skill as string));
  db.transaction(() => {
    run("DELETE FROM member_skills WHERE project_id=? AND by_id=?", p!.id, me.id);
    for (const to of team) {
      if (to === me.id) continue;
      for (const k of fd.getAll(`sk_${to}`).map(String)) if (menu.has(k))
        run("INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?,?,?,?)", p!.id, to, k, me.id);
    }
  })();
  done(back, "Saved. A skill counts once half of someone's teammates have ticked it.");
}
export async function inviteToRole(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const r = get("SELECT r.*, p.name, p.lead_id, p.status FROM roles r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND r.open=1", n("role"));
  if (!r || r.lead_id !== me.id) fail("Only the lead can invite people to an open role.");
  const to = colleague(n("to"), me, "AND role='student' AND verified=1 AND suspended=0");
  if (!to || member(r.project_id, to.id)) fail("That person cannot be invited.");
  if (get("SELECT 1 FROM notifications WHERE user_id=? AND href=? AND text LIKE ?", to.id, `/projects/${r.project_id}`, `%invited you%${r.title}%`))
    fail(`${to.name.split(" ")[0]} has already been invited to this role.`);
  if (!allow(`invite:${me.id}`, 15, 3600)) fail("You have sent a lot of invites. Try again in an hour.");
  notify(to.id, `${me.name} invited you to apply for ${r.title} on ${r.name}`, `/projects/${r.project_id}`);
  if (!get("SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)", to.id, me.id, me.id, to.id))
    run("INSERT INTO messages (from_id, to_id, text, kind, project_id, created_at) VALUES (?,?,?,?,?,?)",
      me.id, to.id, `Invited you to join ${r.name} as ${r.title}.`, "invite", r.project_id, now());
  done(back, `Invited ${to.name.split(" ")[0]}. They can ask to join from the project page.`);
}
export async function addRole(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || !open(p)) fail("Only the lead can add roles to an open project.");
  if (!s("title")) fail("Name the role.");
  db.transaction(() => {
    const rid = Number(run("INSERT INTO roles (project_id, title, note) VALUES (?,?,?)", p!.id, s("title", 60), s("note", 160)).lastInsertRowid);
    saveRoleSkills(rid, s("skills", 200));
  })();
  done(back);
}
/* The skills a role needs, most important first. Used to rank who fits. */
function saveRoleSkills(roleId: number, text: string) {
  run("DELETE FROM role_skills WHERE role_id=?", roleId);
  for (const n of needsFromList(parseSkills(text, 5))) run("INSERT OR IGNORE INTO role_skills (role_id, skill, importance) VALUES (?,?,?)", roleId, n.skill, n.importance);
}
export async function setRoleSkills(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const r = get("SELECT r.*, p.lead_id, p.college_id FROM roles r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND r.open=1", n("role"));
  if (!r || r.lead_id !== me.id || r.college_id !== me.college_id) fail("Only the lead can set what a role needs.");
  saveRoleSkills(r.id, s("skills", 200));
  done(back, "Saved. Suggestions now follow these skills.");
}
export async function closeRole(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const r = get("SELECT r.*, p.lead_id FROM roles r JOIN projects p ON p.id=r.project_id WHERE r.id=?", n("role"));
  if (!r || r.lead_id !== me.id) fail("Only the lead can close a role.");
  db.transaction(() => {
    run("UPDATE roles SET open=0 WHERE id=?", r.id);
    run("DELETE FROM requests WHERE role_id=? AND status='pending'", r.id);
  })();
  done(back);
}
export async function requestJoin(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const r = get("SELECT * FROM roles WHERE id=? AND open=1", n("role"));
  const p = r && project(r.project_id, me);
  if (!p || !open(p)) fail("That role is no longer open.");
  if (me.role !== "student") fail("Only members can join projects.");
  if (member(p.id, me.id)) fail("You have already been on this project.");
  if (get("SELECT 1 FROM requests WHERE project_id=? AND user_id=?", p.id, me.id)) fail("You have already asked to join this project.");
  if ((compute().get(me.id)?.credit ?? 0) < RULES.stake) fail(`You need ${RULES.stake} free credit to stake. Finish what you have joined first.`);
  const note = s("note", 400);
  run("INSERT INTO requests (role_id, project_id, user_id, note) VALUES (?,?,?,?)", r.id, p.id, me.id, note);
  notify(p.lead_id, `${me.name} asked to join ${p.name} as ${r.title}${note ? `: "${note.length > 80 ? note.slice(0, 77) + "..." : note}"` : ""}`, `/projects/${p.id}#requests`);
  done(back, `Request sent. ${RULES.stake} credit is held until the team answers.`);
}
export async function withdrawRequest(fd: FormData) {
  const { me, back, n } = await ctx(fd);
  run("DELETE FROM requests WHERE project_id=? AND user_id=? AND status='pending'", n("id"), me.id);
  done(back, "Request withdrawn. Your stake is back.");
}
export async function answerRequest(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const q = get("SELECT q.*, r.title FROM requests q JOIN roles r ON r.id=q.role_id WHERE q.id=? AND q.status='pending'", n("request"));
  const p = q && project(q.project_id, me);
  if (!p || p.lead_id !== me.id) fail("Only the lead can answer join requests.");
  if (s("answer") !== "accept") {
    run("UPDATE requests SET status='declined' WHERE id=?", q.id);
    notify(q.user_id, `${p.name} declined your request. Your stake is back.`, `/projects/${p.id}`);
    done(back, "Declined. Their stake is returned.");
  }
  db.transaction(() => {
    run("INSERT INTO members (project_id, user_id, role, stake) VALUES (?,?,?,?)", p.id, q.user_id, q.title, RULES.stake);
    run("UPDATE requests SET status='accepted' WHERE id=?", q.id);
    run("UPDATE roles SET open=0 WHERE id=?", q.role_id);
    run("DELETE FROM requests WHERE role_id=? AND status='pending'", q.role_id);
    if (!get("SELECT 1 FROM roles WHERE project_id=? AND open=1", p.id)) run("UPDATE projects SET status='building' WHERE id=? AND status='recruiting'", p.id);
    const who = get("SELECT name FROM users WHERE id=?", q.user_id);
    logUpdate(p.id, q.user_id, `${who.name} joined as ${q.title}`);
    systemLine(p.id, `${who.name} joined the team as ${q.title}`);
    notify(q.user_id, `You are on the ${p.name} team as ${q.title}`, `/projects/${p.id}`);
  })();
  done(back, "Added to the team.");
}
export async function addProof(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || !isActive(p.id, me.id) || !open(p)) fail("Only the team can add proof while the project is open.");
  const url = s("url", 400);
  if (!/^https?:\/\/\S+\.\S+/.test(url) || !s("label")) fail("Add a label and a full link starting with https://");
  run("INSERT INTO proofs (project_id, label, url) VALUES (?,?,?)", p!.id, s("label", 80), url);
  done(back);
}
export async function removeProof(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const pr = get("SELECT * FROM proofs WHERE id=?", n("proof"));
  const p = pr && project(pr.project_id, me);
  if (!p || !isActive(p.id, me.id) || !open(p)) fail("Proof can only be changed by the team before review.");
  run("DELETE FROM proofs WHERE id=?", pr.id);
  done(back);
}
export async function addMilestone(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || !open(p) || !s("title")) fail("Only the lead can add milestones to an open project.");
  run("INSERT INTO milestones (project_id, title) VALUES (?,?)", p!.id, s("title", 120));
  done(back);
}
export async function toggleMilestone(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const m = get("SELECT * FROM milestones WHERE id=?", n("milestone"));
  const p = m && project(m.project_id, me);
  if (!p || !isActive(p.id, me.id) || !open(p)) fail("Only the team can tick milestones while the project is open.");
  run("UPDATE milestones SET done=1-done WHERE id=?", m.id);
  if (!m.done) logUpdate(p.id, me.id, `Milestone done: ${m.title}`);
  done(back);
}
export async function saveContribution(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || !isActive(p.id, me.id) || p.status === "shipped" || p.status === "dropped") fail("You can only edit this while the project is open.");
  run("UPDATE members SET role=?, did=? WHERE project_id=? AND user_id=?", s("role", 60) || "Member", s("did", 200), p!.id, me.id);
  done(back, "Saved.");
}
export async function submitForReview(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || !open(p)) fail("Only the lead can send an open project for review.");
  if (!get("SELECT 1 FROM proofs WHERE project_id=?", p!.id)) fail("Add at least one proof link first.");
  if (get("SELECT 1 FROM milestones WHERE project_id=? AND done=0", p!.id)) fail("Tick off every milestone first.");
  if (get("SELECT 1 FROM members WHERE project_id=? AND status='active' AND did=''", p!.id)) fail("Every teammate has to write what they did first.");
  if (!get("SELECT 1 FROM project_skills WHERE project_id=?", p!.id)) fail("List the skills this project used first.");
  // Pick the reviewers: people with no tie to anyone on the team, more likely the more their word can be trusted.
  const S = compute();
  const everOn = all("SELECT user_id FROM members WHERE project_id=?", p!.id).map((r) => r.user_id as number);
  const pool = all("SELECT * FROM users WHERE college_id=?", me.college_id);
  const picked = pickReviewers(eligibleReviewers(pool, everOn, teamTies(all("SELECT project_id, user_id FROM members")), S), S);
  db.transaction(() => {
    run("DELETE FROM reviews WHERE project_id=?", p!.id);
    run("DELETE FROM review_invites WHERE project_id=?", p!.id);
    // Outside reviewers have to see it, and credit has to be checkable, so a private project goes public at review.
    run("UPDATE projects SET status='review', invited_at=?, hidden=CASE WHEN hidden=2 THEN 0 ELSE hidden END WHERE id=?", now(), p!.id);
    logUpdate(p!.id, me.id, "Sent for review");
    for (const id of picked) {
      run("INSERT INTO review_invites (project_id, reviewer_id, created_at) VALUES (?,?,?)", p!.id, id, now());
      notify(id, `You were picked to review ${p!.name}`, `/projects/${p!.id}`);
    }
    // Admins can always review. With too few outside reviewers, they are the ones who decide.
    for (const u of pool) if (u.admin && !everOn.includes(u.id) && !picked.includes(u.id))
      notify(u.id, picked.length < RULES.reviewsNeeded ? `${p!.name} needs an admin review: too few people outside the team can review it` : `${p!.name} is in review`, `/projects/${p!.id}`);
  })();
  if (p!.live_url) await recordLive(p!.id, p!.live_url);
  // Reviewers find the AI proof check ready when they open the project. It runs after the page answers, so nobody waits.
  after(async () => {
    try { const { checkProof } = await import("@/lib/proofcheck"); await checkProof(p!.id, me.id); }
    catch (e) { console.error("[proofcheck] after review:", (e as Error).message); }
  });
  done(back, picked.length ? `Sent for review to ${picked.length} ${picked.length === 1 ? "person" : "people"} outside your team.` : "Sent for review. An admin of your community will review it.");
}
async function recordLive(pid: number, url: string) {
  const r = await checkLive(url);
  run("INSERT INTO live_checks (project_id, url, ok, status, note, created_at) VALUES (?,?,?,?,?,?)", pid, url, r.ok ? 1 : 0, r.status, r.note, now());
  return r;
}
/* The one link Connect itself opens to see whether the project is really up. */
export async function setLiveUrl(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || !isActive(p.id, me.id) || !open(p)) fail("Only the team can set the live link, before review.");
  const url = s("url", 300);
  if (url && !liveUrl(url)) fail("Use a public link that starts with https://");
  run("UPDATE projects SET live_url=? WHERE id=?", url, p!.id);
  done(back, url ? "Saved. Connect opens this link when the project goes for review." : "Live link removed.");
}
export async function checkLiveNow(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || !p.live_url || p.status === "dropped") fail("This project has no live link.");
  if (!allow(`live:${p!.id}`, 4, 3600)) fail("This link was checked a few times already. Try again in an hour.");
  const r = await recordLive(p!.id, p!.live_url);
  done(back, r.ok ? "The link answered." : `The link did not check out: ${r.note}.`);
}
/* Who may review: an admin, someone Connect picked, or (for projects sent before reviewers were picked) anyone with enough credit. */
function mayReview(p: Row, me: Row): string | null {
  if (member(p.id, me.id)) return "You cannot review a project you were on.";
  if (me.admin) return null;
  if (p.invited_at) return get("SELECT 1 FROM review_invites WHERE project_id=? AND reviewer_id=?", p.id, me.id) ? null : "Reviewers are picked by Connect from people with no tie to the team. You were not picked for this one.";
  return (compute().get(me.id)?.earned ?? 0) < RULES.reviewerMin ? `You need ${RULES.reviewerMin} credit to review.` : null;
}
export async function reviewProject(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  const verdict = n("verdict");
  const note = s("note", 400);
  if (verdict === 0 && note.length < 15) fail("Say what is missing, so the team knows what to fix. A sentence is enough.");
  if (!p || p.status !== "review" || ![0, RULES.demo, RULES.live].includes(verdict)) fail("This project is not up for review.");
  const why = mayReview(p!, me);
  if (why) fail(why);
  let msg = "Review recorded. One more is needed.";
  db.transaction(() => {
    run("INSERT OR REPLACE INTO reviews (project_id, reviewer_id, verdict, note) VALUES (?,?,?,?)", p!.id, me.id, verdict, note);
    // A solo project has no teammates to say which skills were used, so the reviewer ticks what the proof shows.
    const soloist = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id);
    if (soloist.length === 1) {
      const menu = new Set(all("SELECT skill FROM project_skills WHERE project_id=?", p!.id).map((r) => r.skill as string));
      run("DELETE FROM member_skills WHERE project_id=? AND by_id=?", p!.id, me.id);
      if (verdict > 0) for (const k of fd.getAll("skills").map(String)) if (menu.has(k))
        run("INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?,?,?,?)", p!.id, soloist[0].user_id, k, me.id);
    }
    const rs = all("SELECT r.verdict, u.admin FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.project_id=? ORDER BY r.rowid", p!.id);
    const outcome = verdictOf(rs);
    if (outcome === null) {
      if (rs.length >= RULES.reviewsNeeded) {
        msg = "Review recorded. The two reviews disagree, so a third reviewer or an admin decides.";
        for (const a of all("SELECT id FROM users WHERE admin=1 AND college_id=?", me.college_id)) notify(a.id, `Reviewers disagree on ${p!.name}. It needs one more review.`, `/projects/${p!.id}`);
      }
      return;
    }
    const pot = outcome;
    // Keep each reviewer's verdict next to the outcome: this is how review accuracy is measured later.
    // The reviewer who closed the round agrees with the outcome by definition, so that is noted too.
    for (const r of all("SELECT reviewer_id, verdict FROM reviews WHERE project_id=?", p!.id))
      run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at, decider) VALUES (?,?,?,?,?,?)", p!.id, r.reviewer_id, r.verdict, pot, now(), r.reviewer_id === me.id ? 1 : 0);
    const team = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id).map((r) => r.user_id as number);
    // Reviewer notes go on the timeline without names, so reviewers can be candid.
    for (const r of all("SELECT note, verdict FROM reviews WHERE project_id=? AND note<>''", p!.id))
      logUpdate(p!.id, null, `Reviewer note (${r.verdict === 0 ? "not ready" : r.verdict === RULES.demo ? "demo only" : "live"}): ${r.note}`);
    if (pot === 0) {
      run("DELETE FROM reviews WHERE project_id=?", p!.id);
      run("UPDATE projects SET status='building' WHERE id=?", p!.id);
      logUpdate(p!.id, null, "Reviewers sent it back as not ready");
      for (const id of team) notify(id, `${p!.name} was sent back by reviewers as not ready`, `/projects/${p!.id}`);
      msg = "Sent back to the team as not ready.";
    } else {
      run("UPDATE projects SET status='shipped', pot=?, shipped_at=? WHERE id=?", pot, now(), p!.id);
      run("UPDATE members SET stake=0 WHERE project_id=? AND status='active'", p!.id);
      run("UPDATE roles SET open=0 WHERE project_id=?", p!.id);
      run("DELETE FROM requests WHERE project_id=? AND status='pending'", p!.id);
      run("UPDATE users SET resume=NULL WHERE id IN (SELECT user_id FROM members WHERE project_id=?)", p!.id);
      logUpdate(p!.id, null, `Shipped with a pot of ${pot}`);
      for (const id of team) notify(id, `${p!.name} shipped with a pot of ${pot}. Split the credit between your teammates.`, `/projects/${p!.id}`);
      msg = `Shipped with a pot of ${pot}.`;
    }
  })();
  done(back, msg);
}
export async function allocate(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.status !== "shipped" || !isActive(p.id, me.id)) fail("Only the team of a shipped project can split it.");
  const others = all("SELECT user_id FROM members WHERE project_id=? AND status='active' AND user_id<>?", p!.id, me.id).map((r) => r.user_id as number);
  if (!others.length) fail("There is no one else on this project.");
  const pcts = others.map((id) => n(`pct_${id}`));
  if (pcts.some((x) => x < 0 || x > 100) || pcts.reduce((a, b) => a + b, 0) !== 100) fail("The split between your teammates has to add up to 100.");
  db.transaction(() => {
    run("DELETE FROM allocations WHERE project_id=? AND from_id=?", p!.id, me.id);
    others.forEach((id, i) => run("INSERT INTO allocations (project_id, from_id, to_id, pct) VALUES (?,?,?,?)", p!.id, me.id, id, pcts[i]));
  })();
  done(back, "Split saved.");
}
export async function voteGone(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me), target = n("target");
  if (!p || !open(p) || !isActive(p.id, me.id) || !isActive(p.id, target) || target === me.id) fail("You can only mark an active teammate on an open project.");
  if (target === p!.lead_id) fail("The lead cannot be voted out. If the lead is gone, leave the project.");
  let msg = "Marked. They are removed once two thirds of the team agree.";
  db.transaction(() => {
    run("INSERT OR IGNORE INTO gone_votes (project_id, voter_id, target_id) VALUES (?,?,?)", p!.id, me.id, target);
    const voters = get("SELECT COUNT(*) n FROM members WHERE project_id=? AND status='active' AND user_id<>?", p!.id, target).n;
    const votes = get("SELECT COUNT(*) n FROM gone_votes WHERE project_id=? AND target_id=?", p!.id, target).n;
    if (votes >= Math.max(2, Math.ceil((voters * 2) / 3))) {
      run("UPDATE members SET status='left', left_at=? WHERE project_id=? AND user_id=?", now(), p!.id, target);
      run("DELETE FROM gone_votes WHERE project_id=? AND (target_id=? OR voter_id=?)", p!.id, target, target);
      notify(target, `Your team removed you from ${p!.name}. Your stake is lost.`, `/projects/${p!.id}`);
      systemLine(p!.id, `${get("SELECT name FROM users WHERE id=?", target)?.name ?? "A teammate"} was removed by the team`);
      msg = "Removed from the team. Their stake is lost.";
    }
  })();
  done(back, msg);
}
export async function leaveProject(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.status === "shipped" || p.status === "dropped" || !isActive(p.id, me.id)) fail("You are not on an open project here.");
  if (p!.lead_id === me.id) fail("You are the lead. Drop the project instead.");
  run("UPDATE members SET status='left', left_at=? WHERE project_id=? AND user_id=?", now(), p!.id, me.id);
  systemLine(p!.id, `${me.name} left the team`);
  done(back, "You left. This shows on your profile.");
}
export async function dropProject(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.lead_id !== me.id || p.status === "shipped" || p.status === "dropped") fail("Only the lead can drop a project that has not shipped.");
  db.transaction(() => {
    run("UPDATE projects SET status='dropped' WHERE id=?", p!.id);
    run("UPDATE members SET stake=0 WHERE project_id=?", p!.id);
    run("UPDATE roles SET open=0 WHERE project_id=?", p!.id);
    run("DELETE FROM requests WHERE project_id=? AND status='pending'", p!.id);
    logUpdate(p!.id, me.id, "Dropped by the lead");
    for (const m of all("SELECT user_id FROM members WHERE project_id=? AND status='active' AND user_id<>?", p!.id, me.id))
      notify(m.user_id, `${p!.name} was dropped by its lead. Your stake is back.`, `/projects/${p!.id}`);
  })();
  done(back, "Project dropped. Teammates get their stakes back.");
}

/* ---------- people ---------- */
export async function vouch(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const to = n("to");
  const together = get(
    `SELECT 1 FROM members a JOIN members b ON a.project_id=b.project_id JOIN projects p ON p.id=a.project_id
     WHERE a.user_id=? AND b.user_id=? AND a.status='active' AND b.status='active' AND p.status='shipped'`, me.id, to);
  if (to === me.id || !together) fail("You can only vouch for someone you shipped a project with.");
  const r = run("INSERT OR IGNORE INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", me.id, to, now());
  if (r.changes) notify(to, `${me.name} vouched for you`, `/u/${to}`);
  done(back, "Vouched.");
}
export async function addClaim(fd: FormData) {
  const { me, back, s, fail } = await ctx(fd, false);
  if (!s("text")) fail("Write the line first.");
  if (get("SELECT COUNT(*) n FROM claims WHERE user_id=?", me.id).n >= 10) fail("Ten unbacked lines is the limit.");
  run("INSERT INTO claims (user_id, text) VALUES (?,?)", me.id, s("text", 140));
  done(back, "Added as “No proof”. It does not change your credit.");
}
export async function removeClaim(fd: FormData) {
  const { me, back, n } = await ctx(fd, false);
  run("DELETE FROM claims WHERE id=? AND user_id=?", n("claim"), me.id);
  done(back);
}
/* ---------- outside evidence: hackathons and internships, checked by someone else ---------- */
const EVIDENCE_KINDS = ["hackathon", "internship"]; // marks and CGPA are deliberately not here
export async function submitEvidence(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  if (me.role !== "student") fail("Only members add evidence.");
  const kind = s("kind"), title = s("title", 120), url = s("url", 400), skills = parseSkills(s("skills", 200), 5);
  if (!EVIDENCE_KINDS.includes(kind)) fail("Pick a hackathon or an internship.");
  if (title.length < 4) fail("Say what it was, for example “Smart India Hackathon 2026”.");
  if (url && !/^https:\/\/\S+\.\S+/.test(url)) fail("The link has to start with https://");
  if (!skills.length) fail("List the skills it shows, separated by commas.");
  const value = kind === "hackathon" ? (["won", "finalist", "took_part"].includes(s("value")) ? s("value") : "took_part") : "";
  if (get("SELECT COUNT(*) n FROM evidence WHERE user_id=? AND status='pending'", me.id).n >= 3) fail("You have three items waiting already. Wait for those to be checked.");
  if (!allow(`evidence:${me.id}`, 5, 86400)) fail("You have added several items today. Try again tomorrow.");
  // The proof: a link, a file, or both. A file is judged by its bytes, like chat attachments.
  const f = fd.get("file");
  let file: { key: string; name: string; type: string } | null = null;
  if (f instanceof File && f.size > 0) {
    if (f.size > 5 * 1024 * 1024) fail("The file can be up to 5 MB.");
    const bytes = Buffer.from(await f.arrayBuffer()), t = sniff(bytes, f.name);
    if (!t || !(t.kind === "image" || t.mime === "application/pdf")) fail("Upload a photo or a PDF.");
    file = { key: saveFile(bytes), name: cleanName(f.name, t!.ext), type: t!.mime };
  }
  if (!url && !file) fail("Add a link or upload a file that proves it. Without proof it stays a “No proof” line.");
  // Optional ways to get it checked without an admin: a teammate on Connect (hackathons) or a code sent to a work email (internships).
  const mate = kind === "hackathon" && n("teammate") ? colleague(n("teammate"), me, "AND role='student' AND verified=1 AND suspended=0") : undefined;
  if (mate?.id === me.id) fail("Pick a teammate, not yourself.");
  const work = kind === "internship" ? s("work_email", 120).toLowerCase() : "";
  if (work) {
    const d = domainOf(work);
    if (!isEmail(work) || isPublicMail(d) || collegeForEmail(work)) fail("Use the address the company gave you, not a personal or community one.");
  }
  const code = work ? String(crypto.randomInt(100000, 1000000)) : null;
  const id = Number(run(
    `INSERT INTO evidence (user_id, college_id, kind, title, url, file_key, file_name, file_type, skills, value, teammate_id, work_email, code, code_expires, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    me.id, me.college_id, kind, title, url, file?.key ?? null, file?.name ?? null, file?.type ?? null, skills.join(", "), value, mate?.id ?? null, work || null, code, code ? now() + 900 : null, now()).lastInsertRowid);
  if (code) {
    if (mailReady()) await sendMail(work, "Confirm your internship on Connect", `${me.name} listed an internship on Connect: "${title}".\n\nIf that is you, your code is ${code}. It expires in 15 minutes.\nIf it is not, ignore this email.`);
    else if (process.env.NODE_ENV !== "production") console.log(`[connect] work email code for evidence ${id}: ${code}`);
  }
  if (mate) notify(mate.id, `${me.name} says you were on their team at ${title}. Confirm it if that is true.`, `/u/${me.id}?tab=work#evidence`);
  for (const a of all("SELECT id FROM users WHERE admin=1 AND college_id=?", me.college_id)) notify(a.id, `${me.name} added evidence to check: ${title}`, "/admin#evidence");
  done(back + "#evidence", code ? `Added. A code was sent to ${work}; enter it to confirm.` : "Added. It counts once it is checked.");
}
function settle(e: Row, status: "verified" | "rejected", method: string, by: number, note = "") {
  run("UPDATE evidence SET status=?, method=?, decided_by=?, note=?, decided_at=?, code=NULL WHERE id=? AND status='pending'", status, method, by, note, now(), e.id);
  notify(e.user_id, status === "verified" ? `Your evidence was verified: ${e.title}` : `Your evidence was not accepted: ${e.title}${note ? ` (${note})` : ""}`, `/u/${e.user_id}?tab=work#evidence`);
}
/* The teammate named on a hackathon item says "yes, we were on that team". Their own credibility is what it weighs. */
export async function confirmEvidence(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const e = get("SELECT * FROM evidence WHERE id=? AND status='pending' AND college_id=?", n("evidence"), me.college_id);
  if (!e || e.teammate_id !== me.id || e.user_id === me.id) fail("Only the teammate named on it can confirm it.");
  if (!allow(`confirm:${me.id}`, 5, 86400 * 7)) fail("You have confirmed several items this week. An admin will check this one.");
  settle(e, "verified", "teammate", me.id);
  done(back, "Confirmed. Your name is on it as the person who checked.");
}
export async function confirmWorkEmail(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const e = get("SELECT * FROM evidence WHERE id=? AND user_id=? AND status='pending'", n("evidence"), me.id);
  if (!e || !e.code || (e.code_expires ?? 0) < now()) fail("That code has expired. An admin can still check this item.");
  if (e.tries >= 5) fail("Too many wrong tries. An admin can still check this item.");
  if (e.code !== s("code")) {
    run("UPDATE evidence SET tries=tries+1 WHERE id=?", e.id);
    fail("Wrong code.");
  }
  settle(e, "verified", "work_email", me.id);
  done(back, `Confirmed with your ${domainOf(e.work_email)} address.`);
}
export async function decideEvidence(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  const e = get("SELECT * FROM evidence WHERE id=? AND status='pending' AND college_id=?", n("evidence"), me.college_id);
  if (!e || e.user_id === me.id) fail("That item is not waiting in your community.");
  const ok = s("answer") === "verify", note = s("note", 200);
  if (!ok && note.length < 5) fail("Say why, so they know what was wrong.");
  settle(e, ok ? "verified" : "rejected", "admin", me.id, note);
  done(back, ok ? "Verified." : "Rejected. It lowers their credibility a little.");
}
/* Only an item nobody has judged yet can be taken back. A rejected one stays on the record. */
export async function removeEvidence(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd, false);
  const e = get("SELECT * FROM evidence WHERE id=? AND user_id=? AND status='pending'", n("evidence"), me.id);
  if (!e) fail("Only an item that is still waiting can be removed.");
  removeFile(e.file_key);
  run("DELETE FROM evidence WHERE id=?", e.id);
  done(back, "Removed.");
}
export async function aiResume(fd: FormData) {
  const { me, back, fail } = await ctx(fd);
  const r = await writeResume(resumeFacts(me.id));
  if (!r.text) fail(r.error || "Could not write the resume.");
  run("UPDATE users SET resume=? WHERE id=?", r.text, me.id);
  done(back, "Resume written from your signed projects.");
}
export async function clearResume(fd: FormData) {
  const { me, back } = await ctx(fd);
  run("UPDATE users SET resume=NULL WHERE id=?", me.id);
  done(back);
}

/* ---------- clubs ---------- */
export async function createClub(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  if (!me.admin) fail("Only an admin can register a club.");
  const lead = colleague(n("lead"), me, "AND verified=1 AND role='student'");
  if (!s("name") || !lead) fail("Give the club a name and pick a verified member as lead.");
  db.transaction(() => {
    const id = run("INSERT INTO clubs (name, about, lead_id, college_id) VALUES (?,?,?,?)", s("name", 60), s("about"), lead.id, me.college_id).lastInsertRowid;
    run("INSERT INTO club_members (club_id, user_id, role, confirmed) VALUES (?,?,'Lead',1)", id, lead.id);
  })();
  done(back, "Club registered.");
}
/* Everything below goes through lib/clubs.ts, which holds the rules for who may do what. */
const clubOr = (id: number, me: Row, fail: (m: string) => never) => { const c = Club.clubFor(id, me); if (!c || !Club.seesClub(c, me)) fail("No such club."); return c!; };
const sayClub = (back: string, err: string | null, ok: string, fail: (m: string) => never) => { if (err) fail(err); done(back, ok); };
export async function requestClub(fd: FormData) {
  const { me, s, fail } = await ctx(fd);
  if (!allow(`club-ask:${me.id}`, 5, 3600)) fail("Slow down a little. Try again later.");
  const r = Club.requestClub(me, s("name", 80), s("about", 400));
  if (typeof r === "string") fail(r);
  done(`/clubs/${r}`, me.admin ? "Club started." : "Sent to your community's admins. Your club opens once one of them approves it.");
}
export async function decideClub(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const c = clubOr(n("club"), me, fail);
  sayClub(back, Club.decideClub(me, c, s("do") === "approve", s("reason")), s("do") === "approve" ? `${c.name} approved.` : `${c.name} declined.`, fail);
}
export async function updateClub(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  sayClub(back, Club.updateClub(me, clubOr(n("club"), me, fail), s("name", 80), s("about", 400)), "Club saved.", fail);
}
export async function joinClub(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  sayClub(back, Club.askToJoin(me, clubOr(n("club"), me, fail)), "Asked to join. The club's lead confirms members.", fail);
}
export async function inviteToClub(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  sayClub(back, Club.inviteMember(me, clubOr(n("club"), me, fail), n("user")), "Invited. They join once they say yes.", fail);
}
export async function answerClubInvite(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const yes = s("do") === "accept";
  sayClub(back, Club.answerInvite(me, clubOr(n("club"), me, fail), yes), yes ? "You joined the club." : "Invitation declined.", fail);
}
export async function setClubMember(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = clubOr(n("club"), me, fail);
  if (s("do") === "remove") sayClub(n("user") === me.id ? "/clubs" : back, Club.removeMember(me, c, n("user")), n("user") === me.id ? `You left ${c.name}.` : "Removed.", fail);
  sayClub(back, Club.setMember(me, c, n("user"), s("role", 60), fd.get("manage") === "on" || s("manage") === "1"), "Saved.", fail);
}
export async function transferClubLead(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  sayClub(back, Club.transferLead(me, clubOr(n("club"), me, fail), n("user")), "The lead is handed over. You stay in as a co-lead.", fail);
}
export async function deleteClub(fd: FormData) {
  const { me, s, n, fail } = await ctx(fd);
  const c = clubOr(n("club"), me, fail);
  sayClub("/clubs", Club.deleteClub(me, c, s("confirm", 80)), `${c.name} is deleted.`, fail);
}
export async function addClubPlan(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  sayClub(back, Club.addPlan(me, clubOr(n("club"), me, fail), s("title", 100), s("about", 400), s("day", 10), s("place", 100)), "Plan added. Members were told.", fail);
}
export async function removeClubPlan(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  sayClub(back, Club.removePlan(me, clubOr(n("club"), me, fail), n("plan")), "Plan removed.", fail);
}

/* ---------- alumni funding ---------- */
export async function createCall(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  if (me.role !== "alum") fail("Only approved alumni can open a funding call.");
  if (!s("title") || n("amount") <= 0 || n("min_credit") < 0) fail("Add a title and an amount.");
  run("INSERT INTO calls (alum_id, title, about, amount, min_credit, college_id) VALUES (?,?,?,?,?,?)", me.id, s("title", 80), s("about"), n("amount"), n("min_credit"), me.college_id);
  done(back, "Call opened.");
}
export async function closeCall(fd: FormData) {
  const { me, back, n } = await ctx(fd);
  run("UPDATE calls SET open=0 WHERE id=? AND alum_id=?", n("call"), me.id);
  done(back);
}
export async function applyToCall(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const c = get("SELECT * FROM calls WHERE id=? AND open=1 AND college_id=?", n("call"), me.college_id), p = project(n("id"), me);
  if (!c || !p || p.lead_id !== me.id || p.status === "dropped") fail("Only the lead of a live project can apply to an open call.");
  if (p!.hidden === 2) fail("Make the project public first: alumni need to see what they would fund.");
  const S = compute();
  const team = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id).map((r) => r.user_id as number);
  const credit = team.reduce((a, id) => a + (S.get(id)?.earned ?? 0), 0);
  if (credit < c.min_credit) fail(`Your team has ${credit} credit. This call needs ${c.min_credit}.`);
  if (!team.some((id) => (S.get(id)?.shipped ?? 0) > 0)) fail("Someone on the team has to have shipped a project before.");
  const r = run("INSERT OR IGNORE INTO applications (call_id, project_id) VALUES (?,?)", c.id, p!.id);
  if (r.changes) notify(c.alum_id, `${p!.name} applied to ${c.title}`, "/funding");
  done(back, "Application sent.");
}
export async function answerApplication(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const a = get("SELECT a.*, c.alum_id, c.amount, c.title, p.lead_id, p.name FROM applications a JOIN calls c ON c.id=a.call_id JOIN projects p ON p.id=a.project_id WHERE a.id=? AND a.status='pending'", n("application"));
  if (!a || a.alum_id !== me.id) fail("Only the alum who opened the call can answer.");
  if (s("answer") !== "accept") {
    run("UPDATE applications SET status='declined' WHERE id=?", a.id);
    notify(a.lead_id, `${a.title} did not fund ${a.name} this time`, "/funding");
    done(back, "Declined.");
  }
  // One line per payment: "8000 | Working booking flow"
  const parts = lines(s("parts", 1000)).map((l) => {
    const [amt, ...t] = l.split("|");
    return { amount: Math.trunc(Number(amt.replace(/[^\d.]/g, ""))), title: t.join("|").trim().slice(0, 120) };
  });
  const total = parts.reduce((x, p) => x + p.amount, 0);
  if (!parts.length || parts.some((p) => !(p.amount > 0) || !p.title)) fail("Write each payment as: amount | what has to be done");
  if (total > a.amount) fail(`The payments add up to more than the call's ${a.amount}.`);
  db.transaction(() => {
    const gid = run("INSERT INTO grants (project_id, alum_id, amount) VALUES (?,?,?)", a.project_id, me.id, total).lastInsertRowid;
    for (const p of parts) run("INSERT INTO grant_parts (grant_id, title, amount) VALUES (?,?,?)", gid, p.title, p.amount);
    run("UPDATE applications SET status='accepted' WHERE id=?", a.id);
    logUpdate(a.project_id, me.id, `Funded by ${me.name}`);
    notify(a.lead_id, `${me.name} is funding ${a.name}`, `/projects/${a.project_id}`);
  })();
  done(back, "Funded. Mark each payment as paid after you send it.");
}
export async function markPaid(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const part = get("SELECT gp.id, gp.title, g.alum_id, g.project_id, p.lead_id FROM grant_parts gp JOIN grants g ON g.id=gp.grant_id JOIN projects p ON p.id=g.project_id WHERE gp.id=?", n("part"));
  if (!part || part.alum_id !== me.id) fail("Only the alum funding this can mark a payment.");
  run("UPDATE grant_parts SET paid=1 WHERE id=?", part.id);
  notify(part.lead_id, `${me.name} marked a payment as sent: ${part.title}`, `/projects/${part.project_id}`);
  done(back, "Marked as paid.");
}

/* ---------- commissions: asking someone to do a piece of work for you ---------- */
const commission = (id: number, me: Row): Row | undefined => get("SELECT * FROM commissions WHERE id=? AND college_id=?", id, me.college_id);
const commRows = (cid: number) => all("SELECT * FROM commissions WHERE college_id=?", cid) as CommRow[];
const adminsOf = (cid: number) => all("SELECT id FROM users WHERE admin=1 AND suspended=0 AND college_id=?", cid).map((r) => r.id as number);

export async function postCommission(fd: FormData) {
  const { me, back, s, n, fail } = await ctx(fd);
  const C = RULES.comm, alum = me.role === "alum";
  const title = s("title", 80), brief = s("brief", 1200), skills = parseSkills(s("skills", 200), 5), ms = lines(s("milestones", 800)), reward = n("reward");
  const deadline = Math.floor(new Date(s("deadline", 12) + "T23:59:59").getTime() / 1000);
  if (title.length < 4 || brief.length < 20) fail("Give it a title and a few lines on what you need.");
  if (!skills.length) fail("List the skills it needs, most important first.");
  if (!ms.length) fail("Add at least one milestone, so both sides know what done means.");
  if (!(deadline > now())) fail("Pick a deadline in the future.");
  if (!fd.get("not_coursework")) fail("Tick the box to confirm this is not graded coursework, an assignment or an exam.");
  if (reward < C.minReward || reward > C.maxReward) fail(`The reward has to be between ${C.minReward} and ${C.maxReward} credit.`);
  if (get("SELECT COUNT(*) n FROM commissions WHERE client_id=? AND status IN ('open','assigned','delivered','disputed')", me.id).n >= C.openMax) fail(`You can have ${C.openMax} commissions running at once.`);
  if (!allow(`commission:${me.id}`, 5, 86400)) fail("You have posted several today. Try again tomorrow.");
  const club = n("club") ? get("SELECT * FROM clubs WHERE id=? AND lead_id=? AND college_id=? AND status='active'", n("club"), me.id, me.college_id) : undefined;
  if (n("club") && !club) fail("Only a club's lead can post for the club.");
  if (alum) {
    const used = alumUsed(commRows(me.college_id), me.id, now());
    if (used + reward > C.alumAllowance) fail(`Alumni commissions can award ${C.alumAllowance} credit every 30 days. Yours have used ${used}.`);
  } else {
    const st = compute().get(me.id);
    if ((st?.earned ?? 0) < C.minClientCredit) fail(`You need ${C.minClientCredit} earned credit before you can commission work.`);
    if ((st?.credit ?? 0) < reward) fail(`You have ${st?.credit ?? 0} free credit. The reward is set aside when you post.`);
  }
  // Money is only ever a note between the two people. Students paying students is not allowed: too close to paid homework.
  const money = alum || club ? Math.max(0, n("money")) : 0;
  const id = db.transaction(() => {
    const cid = Number(run(
      "INSERT INTO commissions (college_id, client_id, club_id, title, brief, deadline, reward, minted, money, money_note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      me.college_id, me.id, club?.id ?? null, title, brief, deadline, reward, alum ? 1 : 0, money, money ? s("money_note", 160) : "", now()).lastInsertRowid);
    for (const k of needsFromList(skills)) run("INSERT INTO commission_skills (commission_id, skill, importance) VALUES (?,?,?)", cid, k.skill, k.importance);
    for (const m of ms) run("INSERT INTO commission_milestones (commission_id, title) VALUES (?,?)", cid, m.slice(0, 120));
    return cid;
  })();
  done(`/commissions/${id}`, alum ? "Posted." : `Posted. ${reward} credit is set aside until it is done or you cancel.`);
}
export async function applyCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.status !== "open" || c.hidden) fail("This commission is not open.");
  if (me.role !== "student") fail("Only members take commissions.");
  if (c.client_id === me.id) fail("You cannot apply to your own commission.");
  if (!allow(`capply:${me.id}`, 10, 86400)) fail("You have applied to several today. Try again tomorrow.");
  const r = run("INSERT OR IGNORE INTO commission_apps (commission_id, user_id, note, created_at) VALUES (?,?,?,?)", c.id, me.id, s("note", 400), now());
  if (r.changes) notify(c.client_id, `${me.name} applied to do “${c.title}”`, `/commissions/${c.id}`);
  done(back, "Applied. The person who posted it picks one applicant.");
}
export async function withdrawCommissionApp(fd: FormData) {
  const { me, back, n } = await ctx(fd);
  run("DELETE FROM commission_apps WHERE commission_id=? AND user_id=? AND status='pending'", n("id"), me.id);
  done(back, "Application withdrawn.");
}
export async function pickDoer(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const app = get("SELECT * FROM commission_apps WHERE id=? AND status='pending'", n("app"));
  const c = app && commission(app.commission_id, me);
  if (!c || c.client_id !== me.id || c.status !== "open") fail("Only the person who posted an open commission can pick someone.");
  const doer = colleague(app.user_id, me, "AND role='student' AND verified=1 AND suspended=0");
  if (!doer) fail("That person can no longer take it.");
  const block = pairBlock(commRows(me.college_id), me.id, doer.id, c.reward, now());
  if (block) fail(block);
  db.transaction(() => {
    run("UPDATE commissions SET status='assigned', doer_id=?, assigned_at=? WHERE id=?", doer.id, now(), c.id);
    run("UPDATE commission_apps SET status=CASE WHEN id=? THEN 'accepted' ELSE 'declined' END WHERE commission_id=?", app.id, c.id);
    notify(doer.id, `You were picked to do “${c.title}”`, `/commissions/${c.id}`);
  })();
  done(back, `${doer.name.split(" ")[0]} is on it.`);
}
export async function cancelCommission(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.client_id !== me.id || c.status !== "open") fail("You can cancel only before you have picked someone. After that, open a dispute.");
  run("UPDATE commissions SET status='cancelled', closed_at=? WHERE id=?", now(), c!.id);
  done(back, "Cancelled. The reward is back with you.");
}
export async function toggleCommissionMilestone(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const m = get("SELECT * FROM commission_milestones WHERE id=?", n("milestone"));
  const c = m && commission(m.commission_id, me);
  if (!c || c.doer_id !== me.id || c.status !== "assigned") fail("Only the person doing it can tick milestones, while it is in progress.");
  run("UPDATE commission_milestones SET done=1-done WHERE id=?", m.id);
  done(back);
}
export async function deliverCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.doer_id !== me.id || c.status !== "assigned") fail("Only the person doing it can mark it delivered.");
  const url = s("url", 400);
  if (!/^https?:\/\/\S+\.\S+/.test(url)) fail("Add a link to the finished work, starting with https://");
  if (get("SELECT 1 FROM commission_milestones WHERE commission_id=? AND done=0", c!.id)) fail("Tick off every milestone first.");
  // Larger rewards, and credit an alum creates, also need someone with no tie to either side to confirm the proof.
  let reviewer: number | null = null;
  if (c!.reward > RULES.comm.reviewerAbove || c!.minted) {
    const S = compute();
    const ok = eligibleReviewers(all("SELECT * FROM users WHERE college_id=?", me.college_id), [c!.client_id, c!.doer_id], teamTies(all("SELECT project_id, user_id FROM members")), S);
    reviewer = pickReviewers(ok, S)[0] ?? null;
  }
  run("UPDATE commissions SET status='delivered', proof_url=?, delivered_at=?, reviewer_id=?, review_ok=NULL WHERE id=?", url, now(), reviewer, c!.id);
  notify(c!.client_id, `“${c!.title}” was delivered. Check it and sign off.`, `/commissions/${c!.id}`);
  const needs = c!.reward > RULES.comm.reviewerAbove || c!.minted;
  if (reviewer) notify(reviewer, `You were picked to check a delivered commission: ${c!.title}`, `/commissions/${c!.id}`);
  else if (needs) for (const a of adminsOf(me.college_id)) notify(a, `A commission needs an outside check and no reviewer is free: ${c!.title}`, `/commissions/${c!.id}`);
  done(back, needs ? "Delivered. It also needs a check from someone outside before sign-off." : "Delivered. Waiting for sign-off.");
}
export async function checkCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.status !== "delivered" || !(c.reward > RULES.comm.reviewerAbove || c.minted)) fail("This commission is not waiting for a check.");
  if (c!.client_id === me.id || c!.doer_id === me.id || !(me.admin || c!.reviewer_id === me.id)) fail("Only the reviewer Connect picked, or an admin, can check it.");
  const ok = s("answer") === "ok";
  run("UPDATE commissions SET review_ok=?, reviewer_id=? WHERE id=?", ok ? 1 : 0, me.id, c!.id);
  if (!ok) {
    run("UPDATE commissions SET status='disputed', dispute_by=?, dispute_reason=? WHERE id=?", me.id, "The outside reviewer did not confirm the proof: " + s("note", 200), c!.id);
    for (const a of adminsOf(me.college_id)) notify(a, `A reviewer did not confirm a commission: ${c!.title}`, "/admin#commissions");
  } else notify(c!.client_id, `An outside reviewer confirmed “${c!.title}”. You can sign off.`, `/commissions/${c!.id}`);
  done(back, ok ? "Confirmed." : "Sent to the admins.");
}
export async function signOffCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.client_id !== me.id || c.status !== "delivered") fail("Only the person who posted it can sign off, after it is delivered.");
  const rating = n("rating");
  if (rating < 1 || rating > 5) fail("Rate the work from 1 to 5.");
  if ((c!.reward > RULES.comm.reviewerAbove || c!.minted) && c!.review_ok !== 1) fail("This one also needs a check from someone outside. It is waiting for them.");
  // The limit is checked again here: it is what actually moves the credit.
  const others = commRows(me.college_id).filter((x) => (x as Row).id !== c!.id);
  const block = pairBlock(others, me.id, c!.doer_id, c!.reward, now());
  if (block) fail(block + " Open a dispute so an admin can sort this one out.");
  const yes = (k: string) => (s(k) === "1" ? 1 : 0);
  run("UPDATE commissions SET status='done', rating=?, rating_note=?, paid_credit=?, closed_at=?, on_time=?, matched_brief=?, hire_again=? WHERE id=?",
    rating, s("note", 300), c!.reward, now(), yes("on_time"), yes("matched_brief"), yes("hire_again"), c!.id);
  run("UPDATE users SET resume=NULL WHERE id=?", c!.doer_id);
  notify(c!.doer_id, `“${c!.title}” was signed off. You earned ${c!.reward} credit.`, `/commissions/${c!.id}`);
  done(back, `Signed off. ${c!.reward} credit went to them.`);
}
export async function markCommissionPaid(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || c.client_id !== me.id || !c.money || c.status !== "done") fail("Only the person who posted it can mark the money as sent, after sign-off.");
  run("UPDATE commissions SET money_paid=1 WHERE id=?", c!.id);
  notify(c!.doer_id, `${me.name} marked the payment for “${c!.title}” as sent`, `/commissions/${c!.id}`);
  done(back, "Marked as paid.");
}
export async function disputeCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const c = commission(n("id"), me);
  if (!c || !["assigned", "delivered"].includes(c.status) || ![c.client_id, c.doer_id].includes(me.id)) fail("Only the two people on a running commission can open a dispute.");
  const reason = s("reason", 400);
  if (reason.length < 15) fail("Say what went wrong, so the admins can decide.");
  run("UPDATE commissions SET status='disputed', dispute_by=?, dispute_reason=? WHERE id=?", me.id, reason, c!.id);
  notify(c!.client_id === me.id ? c!.doer_id : c!.client_id, `A dispute was opened on “${c!.title}”. An admin will decide.`, `/commissions/${c!.id}`);
  for (const a of adminsOf(me.college_id)) notify(a, `Dispute on a commission: ${c!.title}`, "/admin#commissions");
  done(back, "Sent to the admins of your community.");
}
/* An admin ends a dispute: pay the doer, give the reward back, or split it. If one side was plainly in the wrong,
   that goes on their record the same way an upheld report does. */
export async function resolveCommission(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  const c = commission(n("id"), me);
  if (!c || c.status !== "disputed") fail("That commission is not in dispute.");
  if ([c!.client_id, c!.doer_id].includes(me.id)) fail("You are part of this one. Another admin has to decide it.");
  const how = s("how"), note = s("note", 300);
  if (!["pay", "refund", "split"].includes(how) || note.length < 10) fail("Pick an outcome and say why in a line.");
  const paid = how === "pay" ? c!.reward : how === "split" ? Math.floor(c!.reward / 2) : 0;
  const fault = s("fault") === "client" ? c!.client_id : s("fault") === "doer" ? c!.doer_id : null;
  db.transaction(() => {
    run("UPDATE commissions SET status=?, paid_credit=?, resolution=?, closed_at=?, fault=? WHERE id=?", paid ? "done" : "refunded", paid, note, now(), s("fault") === "client" || s("fault") === "doer" ? s("fault") : "", c!.id);
    if (fault) run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, reason_kind, created_at, college_id) VALUES (?,?,?,?,0,'upheld','dispute',?,?)",
      me.id, "user", fault, `Commission dispute: ${note}`, now(), me.college_id);
    for (const id of [c!.client_id, c!.doer_id]) if (id) notify(id, `An admin decided the dispute on “${c!.title}”: ${paid === c!.reward ? "paid in full" : paid ? "split" : "reward returned"}.`, `/commissions/${c!.id}`);
  })();
  done(back, "Decided.");
}

/* ---------- gifts: sending spendable credit to someone ---------- */
export async function sendGift(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  if (me.role !== "student") fail("Only members have credit to send.");
  const to = colleague(n("to"), me, "AND role='student' AND verified=1 AND suspended=0");
  if (!to) fail("Pick a verified member in your community.");
  const amount = n("amount"), S = compute(), mine = S.get(me.id);
  const block = giftBlock(all("SELECT * FROM gifts WHERE college_id=?", me.college_id) as GiftRow[],
    { id: me.id, created_at: me.created_at, earned: mine?.earned ?? 0, credit: mine?.credit ?? 0 },
    { id: to.id, created_at: to.created_at, earned: 0, credit: 0 }, amount, now());
  if (block) fail(block);
  if (!allow(`gift:${me.id}`, 5, 86400)) fail("You have sent credit several times today. Try again tomorrow.");
  run("INSERT INTO gifts (college_id, from_id, to_id, amount, note, created_at) VALUES (?,?,?,?,?,?)", me.college_id, me.id, to.id, amount, s("note", 140), now());
  notify(to.id, `${me.name} sent you ${amount} credit to use`, "/credit");
  done(back, `Sent ${amount} credit to ${to.name.split(" ")[0]}. It is theirs to stake or spend; it does not change what either of you has earned.`);
}

/* ---------- admin ---------- */
export async function approveAlum(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  if (!run("UPDATE users SET verified=1 WHERE id=? AND role='alum' AND college_id=?", n("user"), me.college_id).changes) fail("They are not waiting at your college.");
  notify(n("user"), "Your alumni account is approved. You can open funding calls now.", "/funding");
  done(back, "Approved.");
}
/* For colleges without email codes: an admin who knows the student verifies them by hand. */
export async function verifyStudent(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  if (!run("UPDATE users SET verified=1 WHERE id=? AND role='student' AND deleted=0 AND college_id=?", n("user"), me.college_id).changes) fail("They are not waiting at your college.");
  notify(n("user"), `An admin verified you as a member. You start with ${RULES.starter} credit and can join projects now.`, "/");
  done(back, "Verified.");
}
export async function setSuspended(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  if (n("user") === me.id) fail("You cannot suspend yourself.");
  if (!run("UPDATE users SET suspended=? WHERE id=? AND admin=0 AND (college_id=? OR ?)", n("on") ? 1 : 0, n("user"), me.college_id, me.super ? 1 : 0).changes) fail("You can only act on people at your college.");
  done(back, n("on") ? "Suspended. They are signed out and cannot sign in." : "Restored.");
}
export async function setHidden(fd: FormData) {
  const { me, back, n, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  // Showing it again only undoes an admin's hiding; a project its team made private stays private.
  const ok = n("on") ? run("UPDATE projects SET hidden=1 WHERE id=? AND college_id=?", n("id"), me.college_id).changes
    : run("UPDATE projects SET hidden=0 WHERE id=? AND college_id=? AND hidden=1", n("id"), me.college_id).changes;
  if (!ok) fail("That project is not at your college, or it is not hidden.");
  done(back, n("on") ? "Hidden from everyone except its team and admins." : "Visible again.");
}
export async function closeReport(fd: FormData) {
  const c = await ctx(fd, false);
  const { me, back, n, fail } = c;
  if (!me.admin) fail("Admins only.");
  const { s } = c;
  // Upheld means the report was right. It lowers the reported person's credibility for a while.
  const result = s("result") === "upheld" ? "upheld" : "dismissed";
  const r = get("SELECT * FROM reports WHERE id=? AND college_id=? AND open=1", n("report"), me.college_id);
  if (!r) fail("That report is already closed.");
  db.transaction(() => {
    run("UPDATE reports SET open=0, result=? WHERE id=?", result, r.id);
    // Upholding can also take back what the cheating earned: the person's vouches, or a project's split.
    const revoke = s("revoke");
    if (result === "upheld" && ((revoke === "vouches" && r.kind === "user") || (revoke === "split" && r.kind === "project")))
      run("INSERT INTO revoked (kind, target_id, report_id, created_at) VALUES (?,?,?,?)", revoke, r.target_id, r.id, now());
    // A commission that turns out to be coursework, or otherwise against the rules, is stopped: nobody is paid,
    // the client does not get the reward back, and it goes on the client's record.
    if (r.kind === "commission" && result === "upheld") {
      const c = get("SELECT * FROM commissions WHERE id=? AND college_id=?", r.target_id, me.college_id);
      if (c && c.status !== "refunded" && c.status !== "cancelled") {
        run("UPDATE commissions SET hidden=1, status=CASE WHEN status='done' THEN 'done' ELSE 'refunded' END, resolution=?, closed_at=COALESCE(closed_at, ?) WHERE id=?",
          r.reason_kind === "coursework" ? "Removed by an admin: graded coursework is not allowed." : "Removed by an admin after a report.", now(), c.id);
        run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, reason_kind, created_at, college_id) VALUES (?,?,?,?,0,'upheld',?,?,?)",
          me.id, "user", c.client_id, `Commission removed: ${c.title}`, r.reason_kind || "commission", now(), me.college_id);
        notify(c.client_id, `Your commission “${c.title}” was removed by an admin.`, "/terms");
      }
    }
  })();
  done(back, result === "upheld" ? "Report upheld." : "Report dismissed.");
}

/* An admin spot-checks a recently shipped project. Their verdict becomes the pot, and reviewer accuracy is judged
   against it. A project found not to be real keeps its history but earns nothing. */
export async function auditProject(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd, false);
  if (!me.admin) fail("Admins only.");
  const verdict = n("verdict"), note = s("note", 300);
  if (![0, RULES.demo, RULES.live].includes(verdict) || note.length < 10) fail("Pick a verdict and say what you checked in a line.");
  const p = auditable(me.college_id, me.id).find((x) => x.id === n("id"));
  if (!p) fail(`That project cannot be spot-checked: it has to be shipped in the last ${RULES.review.auditDays} days, not checked yet, and not yours.`);
  db.transaction(() => {
    run("INSERT INTO audits (project_id, admin_id, verdict, old_pot, note, created_at) VALUES (?,?,?,?,?,?)", p!.id, me.id, verdict, p!.pot, note, now());
    run("UPDATE projects SET pot=? WHERE id=?", verdict, p!.id);
    logUpdate(p!.id, null, verdict === p!.pot ? `An admin spot-checked it and agreed with the reviewers (${verdict})` : `An admin spot-checked it and changed the pot from ${p!.pot} to ${verdict}: ${note}`);
    if (verdict !== p!.pot) for (const m of all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id))
      notify(m.user_id, `An admin spot-checked ${p!.name} and changed its pot from ${p!.pot} to ${verdict}`, `/projects/${p!.id}`);
  })();
  done(back, "Spot check recorded.");
}

/* ---------- updates, inbox, reports ---------- */
export async function postUpdate(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || !isActive(p.id, me.id) || p.status === "dropped") fail("Only the team can post updates.");
  if (!s("text")) fail("Write the update first.");
  logUpdate(p!.id, me.id, s("text", 280), "post");
  done(back);
}
export async function readInbox(fd: FormData) {
  const { me, back } = await ctx(fd, false);
  run("UPDATE notifications SET seen=1 WHERE user_id=?", me.id);
  done(back);
}
export async function report(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const kind = ["project", "commission"].includes(s("kind")) ? s("kind") : "user";
  const why = ["coursework", "fake", "abuse"].includes(s("reason_kind")) ? s("reason_kind") : "";
  const reason = s("reason", 300) || (why === "coursework" ? "This is graded coursework, an assignment or an exam." : "");
  if (!reason) fail("Say what is wrong.");
  if (!allow(`report:${me.id}`, 5, 3600)) fail("You have sent several reports. Give the admins time to look.");
  const where = get(`SELECT college_id FROM ${kind === "user" ? "users" : kind === "project" ? "projects" : "commissions"} WHERE id=?`, n("target"))?.college_id;
  if (!where) fail("Nothing to report there.");
  run("INSERT INTO reports (by_id, kind, target_id, reason, reason_kind, created_at, college_id) VALUES (?,?,?,?,?,?,?)", me.id, kind, n("target"), reason, why, now(), where);
  for (const a of all("SELECT id FROM users WHERE admin=1 AND college_id=?", where)) notify(a.id, `New report on a ${kind === "user" ? "person" : kind}`, "/admin");
  done(back, "Reported. An admin will look at it.");
}

/* ---------- questions on a project ---------- */
export async function postComment(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd);
  const p = project(n("id"), me);
  if (!p || p.status === "dropped" || p.hidden === 1 || (p.hidden === 2 && !isActive(p.id, me.id))) fail("You can't comment on this project.");
  const text = s("text", 500);
  if (text.length < 2) fail("Write something first.");
  if (!allow(`comment:${me.id}`, 10, 600)) fail("You are posting a lot. Wait a few minutes.");
  run("INSERT INTO comments (project_id, user_id, text, created_at) VALUES (?,?,?,?)", p!.id, me.id, text, now());
  const team = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", p!.id).map((r) => r.user_id as number);
  const short = text.length > 60 ? text.slice(0, 57) + "..." : text;
  if (team.includes(me.id)) {
    // The team answered: tell the outsiders who asked.
    for (const r of all("SELECT DISTINCT user_id FROM comments WHERE project_id=? AND user_id<>?", p!.id, me.id))
      if (!team.includes(r.user_id)) notify(r.user_id, `${p!.name} replied: ${short}`, `/projects/${p!.id}#questions`);
  } else {
    for (const id of team) notify(id, `${me.name} asked about ${p!.name}: ${short}`, `/projects/${p!.id}#questions`);
  }
  done(back + "#questions");
}
export async function deleteComment(fd: FormData) {
  const { me, back, n } = await ctx(fd, false);
  const c = get("SELECT c.*, p.college_id FROM comments c JOIN projects p ON p.id=c.project_id WHERE c.id=?", n("comment"));
  if (c && (c.user_id === me.id || (me.admin && c.college_id === me.college_id))) run("DELETE FROM comments WHERE id=?", c.id);
  done(back + "#questions");
}

/* ---------- AI proof check ---------- */
/* Who may run it and see it: the team (to check their proof before review), the people picked to review it, and admins. */
function mayProofCheck(p: Row, me: Row): boolean {
  if (p.status === "dropped" || p.college_id !== me.college_id) return false;
  if (isActive(p.id, me.id)) return true;
  if (me.admin) return true;
  return p.status === "review" && !mayReview(p, me);
}
export async function runProofCheck(projectId: number): Promise<{ error?: string }> {
  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) return { error: "Sign in and verify first." };
  const p = project(Math.trunc(Number(projectId)) || 0, me);
  if (!p || !mayProofCheck(p, me)) return { error: "Only the team, its reviewers and admins can run the proof check." };
  const last = get("SELECT created_at FROM proof_checks WHERE project_id=? ORDER BY id DESC LIMIT 1", p.id)?.created_at ?? 0;
  if (now() - last < 60) return { error: "This project was checked a moment ago. Try again in a minute." };
  if (!allow(`proof:${me.id}`, 8, 3600) || !allow(`proof-p:${p.id}`, 12, 3600)) return { error: "The proof check has run several times this hour. Try again later." };
  const { checkProof } = await import("@/lib/proofcheck");
  const r = await checkProof(p.id, me.id);
  if (!r.error) revalidatePath(`/projects/${p.id}`);
  return r.error ? { error: r.error } : {};
}

/* ---------- settings and your data ---------- */
export async function saveSettings(fd: FormData) {
  const { me, back } = await ctx(fd, false);
  const on = (k: string) => (fd.get(k) ? 1 : 0);
  run("UPDATE users SET email_notes=?, open_to_join=?, follow_notes=?, calls_on=?, dm_from=? WHERE id=?",
    on("email_notes"), on("open_to_join"), on("follow_notes"), on("calls_on"), fd.get("dm_from") === "team" ? "team" : "all", me.id);
  run("UPDATE users SET two_step=? WHERE id=?", on("two_step"), me.id);
  done(back, "Settings saved.");
}
/* The cookie notice was closed on this device: remember it, so it is not shown again. */
export async function setConsent(): Promise<void> {
  (await cookies()).set(CONSENT_COOKIE, "ok", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CONSENT_DAYS * 86400 });
  revalidatePath("/", "layout");
}
/* Raises the person's session counter, so every cookie made before now stops working, then signs this device back in.
   Push alerts are removed everywhere too: a signed-out phone must not keep showing message previews. */
export async function signOutEverywhere(fd: FormData) {
  const { me, back } = await ctx(fd, false);
  run("UPDATE users SET session_v=COALESCE(session_v,0)+1 WHERE id=?", me.id);
  run("DELETE FROM push_subs WHERE user_id=?", me.id);
  forgetDevices(me.id); // every device, this one included, is asked for a code at its next sign-in
  await setSession(me.id);
  done(back, "Signed out on every other device.");
}
export async function sendFeedback(fd: FormData) {
  const { me, s, fail } = await ctx(fd, false);
  const text = s("text", 1500);
  if (text.length < 10) fail("Tell us a little more, at least a sentence.");
  if (!allow(`feedback:${me.id}`, 5, 3600)) fail("You have sent a lot of feedback this hour. Thank you. Try again later.");
  addFeedback(me, s("kind"), text, s("page"));
  done("/feedback", "Sent. Thank you. You will see the answer here and in your inbox.");
}
export async function replyFeedback(fd: FormData) {
  const { me, back, n, s, fail } = await ctx(fd, false);
  if (!me.super) fail("Site admins only.");
  const err = answerFeedback(me, n("feedback"), s("status"), s("reply", 1000));
  if (err) fail(err);
  done(back, "Saved.");
}
export async function toggleOpen(fd: FormData) {
  const { me, back } = await ctx(fd, false);
  run("UPDATE users SET open_to_join=1-open_to_join WHERE id=?", me.id);
  done(back, me.open_to_join ? "You are no longer marked as open to projects." : "Project leads can now see you are open to join.");
}
/* Deleting an account removes everything about the person. Their place in past teams stays, shown as
   "Deleted user", and so do vouches they gave, because teammates' signed history and credit depend on them. */
export async function deleteAccount(fd: FormData) {
  const { me, s, fail } = await ctx(fd, false);
  if (s("confirm").toLowerCase() !== "delete") fail('Type "delete" to confirm.');
  if (me.super && get("SELECT COUNT(*) n FROM users WHERE super=1 AND deleted=0").n <= 1) fail("You are the only site admin. Add another one first.");
  db.transaction(() => {
    run(`UPDATE users SET name='Deleted user', email=NULL, college_email=NULL, picture=NULL, about='', skills='', resume=NULL,
         github='', linkedin='', website='', sub=?, admin=0, super=0, email_notes=0, open_to_join=0, deleted=1, suspended=1 WHERE id=?`, `deleted:${me.id}:${crypto.randomUUID()}`, me.id);
    for (const f of all("SELECT file_key FROM evidence WHERE user_id=? AND file_key IS NOT NULL", me.id)) removeFile(f.file_key);
    // Their uploaded photo, and the real name and photo anonymous mode kept aside, go too.
    if (me.photo_key) removeFile(me.photo_key);
    run("UPDATE users SET photo_key=NULL, photo_mime=NULL, real_name=NULL, real_picture=NULL, alias=NULL, anon=0 WHERE id=?", me.id);
    for (const q of ["DELETE FROM identities WHERE user_id=?", "DELETE FROM codes WHERE user_id=?", "DELETE FROM notifications WHERE user_id=?",
      "DELETE FROM claims WHERE user_id=?", "DELETE FROM evidence WHERE user_id=?", "DELETE FROM commission_apps WHERE user_id=? AND status='pending'",
      "UPDATE commissions SET status='cancelled' WHERE client_id=? AND status='open'", "DELETE FROM review_invites WHERE reviewer_id=?", "DELETE FROM club_members WHERE user_id=?", "DELETE FROM comments WHERE user_id=?", "DELETE FROM follows WHERE user_id=?", "DELETE FROM feedback WHERE user_id=?", "DELETE FROM trusted_devices WHERE user_id=?", "DELETE FROM login_codes WHERE user_id=?", "DELETE FROM project_seen WHERE user_id=?", "DELETE FROM activity WHERE user_id=?",
      // Proof check reports list the team's GitHub accounts and commit counts; reports on their projects go (anyone allowed can run a new one).
      "DELETE FROM proof_checks WHERE project_id IN (SELECT project_id FROM members WHERE user_id=?)",
      "DELETE FROM requests WHERE user_id=? AND status='pending'", "DELETE FROM blocks WHERE user_id=? OR blocked_id=?", "DELETE FROM push_subs WHERE user_id=?"]) run(q, ...(q.includes("OR") ? [me.id, me.id] : [me.id]));
    // Their conversations go too, attachments included.
    for (const f of all("SELECT file_key FROM messages WHERE (from_id=? OR to_id=?) AND file_key IS NOT NULL", me.id, me.id)) removeFile(f.file_key);
    run("DELETE FROM messages WHERE from_id=? OR to_id=?", me.id, me.id);
    // And what they wrote in team chats, photos included.
    for (const f of all("SELECT file_key FROM team_messages WHERE user_id=? AND file_key IS NOT NULL", me.id)) removeFile(f.file_key);
    run("DELETE FROM team_messages WHERE user_id=?", me.id);
    run("DELETE FROM team_reads WHERE user_id=?", me.id);
    forgetTeamspace(me.id);
  })();
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent("Your account is deleted."));
}

/* ---------- site admins (ADMIN_EMAILS): colleges and who runs each one ---------- */
async function superCtx(fd: FormData) {
  const c = await ctx(fd, false);
  if (!c.me.super) c.fail("Site admins only.");
  return c;
}
export async function saveCollege(fd: FormData) {
  const { back, s, n, fail } = await superCtx(fd);
  const c = collegeById(n("id"));
  if (!c) fail("No such community.");
  const name = s("name", 80);
  const domains = s("domains", 300).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (name.length < 3 || !domains.length || domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || isPublicMail(d)))
    fail("Give a name and at least one college or company email domain, like nirmauni.ac.in. Personal mail domains are not allowed.");
  for (const d of domains) {
    const other = get("SELECT name FROM colleges WHERE id<>? AND (',' || domains || ',') LIKE ?", c.id, `%,${d},%`);
    if (other) fail(`${d} already belongs to ${other.name}.`);
  }
  const status = ["active", "pending", "closed"].includes(s("status")) ? s("status") : c.status;
  run("UPDATE colleges SET name=?, domains=?, status=? WHERE id=?", name, domains.join(","), status, c.id);
  if (status === "active" && c.status !== "active")
    for (const u of all("SELECT id FROM users WHERE college_id=? AND verified=1", c.id))
      notify(u.id, `${name} is open on Connect. Welcome in.`, "/");
  done(back, "Community saved.");
}
/* A site admin opens a community before anyone from it has signed up, so its students land in it straight away. */
export async function createCollege(fd: FormData) {
  const { me, back, s, fail } = await superCtx(fd);
  const name = s("name", 80);
  const domains = s("domains", 300).toLowerCase().split(/[\s,]+/).map((d) => d.replace(/^@/, "")).filter(Boolean);
  if (name.length < 3 || !domains.length || domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || isPublicMail(d)))
    fail("Give a name and at least one college or company email domain, like nirmauni.ac.in. Personal mail domains are not allowed.");
  for (const d of domains) {
    const other = get("SELECT name FROM colleges WHERE (',' || domains || ',') LIKE ?", `%,${d},%`);
    if (other) fail(`${d} already belongs to ${other.name}.`);
  }
  const base = slugify(s("slug", 40) || name);
  let slug = base;
  for (let i = 2; get("SELECT 1 FROM colleges WHERE slug=?", slug); i++) slug = `${base}-${i}`;
  run("INSERT INTO colleges (slug, name, domains, status, requested_by, created_at) VALUES (?,?,?,'active',?,?)", slug, name, domains.join(","), me.id, now());
  done(back, `${name} is open. Anyone who verifies an email on ${domains.join(" or ")} joins it.`);
}
export async function setCollegeAdmin(fd: FormData) {
  const { back, n, s, fail } = await superCtx(fd);
  const u = get("SELECT * FROM users WHERE id=? AND college_id=? AND verified=1 AND deleted=0", n("user"), n("college"));
  if (!u) fail("Pick a verified person in that community.");
  const on = s("on") === "1";
  run("UPDATE users SET admin=? WHERE id=?", on ? 1 : 0, u.id);
  if (on) notify(u.id, "You are now an admin of your community on Connect.", "/admin");
  done(back, on ? `${u.name} is now an admin.` : `${u.name} is no longer an admin.`);
}
