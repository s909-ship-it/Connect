import Link from "next/link";
import { all } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { CLUB } from "@/lib/clubs";
import { requestClub } from "../actions";
import { Av, F } from "../ui";

export const metadata = { title: "Clubs" };

export default async function Clubs() {
  const me = await requireMember();
  const clubs = all("SELECT * FROM clubs WHERE college_id=? AND status='active' ORDER BY name", me.college_id);
  const members = all("SELECT cm.club_id, u.* FROM club_members cm JOIN users u ON u.id=cm.user_id JOIN clubs c ON c.id=cm.club_id WHERE cm.confirmed=1 AND c.college_id=?", me.college_id);
  const asked = all("SELECT * FROM clubs WHERE created_by=? AND status<>'active' ORDER BY created_at DESC", me.id);
  const canStart = me.role === "student" && !!me.verified;
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>Clubs</h1>
        <p>Each club keeps its roster and plans here. Open a member to see what they have built.</p>
      </div></div>
      {asked.length > 0 && (
        <div className="card stack">
          <span className="label">Your club requests</span>
          {asked.map((c) => (
            <div key={c.id} className="row between">
              <Link href={`/clubs/${c.id}`}>{c.name}</Link>
              {c.status === "pending" ? <span className="pill warn">Waiting for an admin</span> : <span className="pill bad">Not approved</span>}
            </div>
          ))}
        </div>
      )}
      {clubs.length === 0 && <div className="note">No clubs yet in your community. {canStart ? "Start the first one below." : ""}</div>}
      <div className="grid">
        {clubs.map((c) => {
          const m = members.filter((x) => x.club_id === c.id);
          return (
            <Link key={c.id} className="card lift" href={`/clubs/${c.id}`}>
              <h2>{c.name}</h2>
              <span className="muted">{c.about}</span>
              <span className="row between"><span className="avs">{m.slice(0, 8).map((u) => <Av key={u.id} u={u} />)}</span><span className="small muted">{m.length} member{m.length === 1 ? "" : "s"}</span></span>
            </Link>
          );
        })}
      </div>
      {canStart && (
        <div id="start"><F action={requestClub} back="/clubs" className="card stack">
          <h2>Start a club</h2>
          <p className="small muted">{me.admin
            ? "You are an admin, so your club opens straight away. You become its lead."
            : "An admin of your community approves every new club, even one with only you in it. You become its lead, and you can add members and plans once it is approved."}</p>
          <label className="field"><span>Name</span>
            <input type="text" name="name" id="club-new-name" minLength={CLUB.nameMin} maxLength={CLUB.nameMax} placeholder="e.g. Robotics Club" required /></label>
          <label className="field"><span>What the club does</span>
            <textarea name="about" id="club-new-about" rows={2} maxLength={CLUB.aboutMax} placeholder="Who it is for and what you do together" /></label>
          <div><button className="btn">{me.admin ? "Start the club" : "Ask the admins"}</button></div>
        </F></div>
      )}
    </>
  );
}
