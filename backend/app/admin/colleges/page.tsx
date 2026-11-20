import Link from "next/link";
import { notFound } from "next/navigation";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createCollege, saveCollege, setCollegeAdmin } from "../../actions";
import { F, Who } from "../../ui";

export const metadata = { title: "Communities · Admin" };

/* For site admins (ADMIN_EMAILS) only: open new colleges, fix names and domains, and pick each college's admins. */
export default async function CollegesAdmin() {
  const me = await requireUser();
  if (!me.super) notFound();
  const colleges = all(`SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.college_id=c.id AND u.verified=1) people FROM colleges c
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, people DESC, c.name`);
  const admins = all("SELECT id, name, picture, college_id FROM users WHERE admin=1 AND deleted=0 AND college_id IS NOT NULL");
  const people = all("SELECT id, name, college_id FROM users WHERE verified=1 AND deleted=0 AND suspended=0 AND admin=0 AND college_id IS NOT NULL ORDER BY name");
  const back = "/admin/colleges";
  return (
    <>
      <Link href="/admin">← Admin</Link>
      <div className="head"><div className="stack tight">
        <h1>Communities</h1>
        <p>New communities on academic domains open by themselves. Others wait here until you check the domain really belongs to a community. Each community&rsquo;s admins see only their own community.</p>
      </div></div>
      <F action={createCollege} back={back} className="card stack">
        <h2>Add a community</h2>
        <span className="small muted">Open a college before its students arrive. Use the domains on its students&rsquo; email addresses; sub-domains count too, so pdpu.ac.in also covers sot.pdpu.ac.in.</span>
        <div className="row">
          <input type="text" name="name" id="new-college-name" placeholder="College name" aria-label="Community name" maxLength={80} required />
          <input type="text" name="domains" id="new-college-domains" placeholder="Email domains, like dtu.ac.in" aria-label="Email domains, comma separated" required />
          <input type="text" name="slug" id="new-college-slug" placeholder="Short link, like dtu (optional)" aria-label="Short link name" maxLength={40} />
          <button className="btn sm">Add</button>
        </div>
      </F>
      {colleges.map((c) => (
        <div key={c.id} className={`card stack ${c.status === "pending" ? "pending-college" : ""}`}>
          <span className="row between">
            <span className="row"><h2>{c.name}</h2><span className={`pill ${c.status === "active" ? "ok" : c.status === "pending" ? "warn" : "bad"}`}>{c.status === "pending" ? "Waiting" : c.status === "active" ? "Open" : "Closed"}</span></span>
            <span className="small muted">{c.people} verified · <Link href={`/c/${c.slug}`}>/c/{c.slug}</Link></span>
          </span>
          <F action={saveCollege} back={back} hidden={{ id: c.id }} className="row">
            <input type="text" name="name" id={`name-${c.id}`} defaultValue={c.name} aria-label="Community name" required />
            <input type="text" name="domains" id={`domains-${c.id}`} defaultValue={c.domains} aria-label="Email domains, comma separated" required />
            <select name="status" id={`status-${c.id}`} defaultValue={c.status} aria-label="Status">
              <option value="active">Open</option><option value="pending">Waiting</option><option value="closed">Closed</option>
            </select>
            <button className="btn ghost sm">{c.status === "pending" ? "Save (pick Open to approve)" : "Save"}</button>
          </F>
          <span className="label">Admins</span>
          <span className="row">
            {admins.filter((a) => a.college_id === c.id).map((a) => (
              <F key={a.id} action={setCollegeAdmin} back={back} hidden={{ user: a.id, college: c.id, on: 0 }} className="row nowrap">
                <Who u={a} /><button className="btn ghost sm" aria-label={`Remove ${a.name} as admin`}>×</button>
              </F>
            ))}
            {!admins.some((a) => a.college_id === c.id) && <span className="small muted">No admin yet.</span>}
          </span>
          {people.some((p) => p.college_id === c.id) && (
            <F action={setCollegeAdmin} back={back} hidden={{ college: c.id, on: 1 }} className="row">
              <select name="user" id={`admin-${c.id}`} defaultValue="" required aria-label="Make admin">
                <option value="" disabled>Make someone admin…</option>
                {people.filter((p) => p.college_id === c.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn ghost sm">Make admin</button>
            </F>
          )}
        </div>
      ))}
    </>
  );
}
