import Link from "next/link";
import { AVATAR } from "../../bits";

/* Small pieces shared by the team space: role tags, faces, and names that open the person's profile. */
export type Mate = { id: number; name: string; picture: string | null; role: string; lead: boolean };

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
/* Each role gets its own colour, the same everywhere, so a glance tells who is who. */
const TAG_COLOURS = ["blue", "purple", "teal", "pink", "indigo", "green", "red"];
export const tagColour = (role: string) => TAG_COLOURS[[...role.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLOURS.length];

export function RoleTag({ role, lead }: { role: string; lead?: boolean }) {
  return <span className="role-tags">{lead && <span className="role-tag lead">Lead</span>}<span className={`role-tag ${tagColour(role)}`}>{role}</span></span>;
}

export function Face({ u, size = 32 }: { u: { id: number; name: string; picture: string | null }; size?: number }) {
  return u.picture
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="face" src={u.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="face" style={{ width: size, height: size, fontSize: size / 2.6, background: AVATAR[Math.abs(u.id) % AVATAR.length] }}>{initials(u.name)}</span>;
}

/* A person's name (and face) that opens their profile. */
export function PersonLink({ u, size, children }: { u: { id: number; name: string; picture: string | null }; size?: number; children?: React.ReactNode }) {
  return (
    <Link href={`/u/${u.id}`} className="person-link" title={`Open ${u.name}'s profile`}>
      {size ? <Face u={u} size={size} /> : null}
      {children ?? <b>{u.name}</b>}
    </Link>
  );
}
