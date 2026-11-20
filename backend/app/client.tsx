"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Av, Meter, PIcon, Pill } from "./bits";
import { hideFromFeed } from "./feed-actions";

type Action = (fd: FormData) => Promise<void>;

/* ---------- navigation ---------- */
const NAV: [string, string][] = [["/", "Projects"], ["/people", "People"], ["/commissions", "Commissions"], ["/clubs", "Clubs"], ["/funding", "Funding"], ["/credit", "Credit"]];

export function NavLinks({ admin }: { admin: boolean }) {
  const path = usePathname();
  const on = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href) || (href === "/people" && path.startsWith("/u/"));
  return (
    <>
      {NAV.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}>{label}</Link>
      ))}
      {admin && <Link href="/admin" aria-current={path.startsWith("/admin") ? "page" : undefined}>Admin</Link>}
    </>
  );
}

/* ---------- toast: shows the result of the last action, passed back as ?ok= or ?err= ---------- */
export function Toast() {
  const q = useSearchParams(), path = usePathname(), router = useRouter();
  const err = q.get("err"), ok = q.get("ok");
  const [shown, setShown] = useState<{ msg: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const msg = err || ok;
    if (!msg) return;
    setShown({ msg, bad: !!err });
    const rest = new URLSearchParams(q.toString());
    rest.delete("ok");
    rest.delete("err");
    router.replace(path + (rest.size ? `?${rest}` : ""), { scroll: false });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), err ? 8000 : 4500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [err, ok]);
  if (!shown) return null;
  return (
    <div className={`toast ${shown.bad ? "err" : "ok"}`} role="status">
      <span>{shown.msg}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setShown(null)}>×</button>
    </div>
  );
}

/* ---------- a form that posts to a server action, shows it is working, and can ask "are you sure" ---------- */
export function F({ action, back, hidden, children, className, confirm }: {
  action: Action; back: string; hidden?: Record<string, string | number>; children: ReactNode; className?: string; confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  return (
    <form
      className={className}
      data-pending={pending || undefined}
      aria-busy={pending}
      action={(fd) => { setArmed(false); start(async () => { await action(fd); }); }}
      onSubmit={(e) => { if (confirm && !armed) { e.preventDefault(); setArmed(true); } }}
    >
      <input type="hidden" name="back" value={back} />
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
      {armed ? (
        <span className="row confirm">
          <span className="small">{confirm}</span>
          <button className="btn danger sm">Yes, do it</button>
          <button type="button" className="btn ghost sm" onClick={() => setArmed(false)}>Cancel</button>
        </span>
      ) : children}
    </form>
  );
}

/* ---------- a number that counts up when it appears ---------- */
export function Count({ to }: { to: number }) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || to === 0) return setN(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString("en-IN")}</>;
}

export function CopyLink({ path, label = "Copy profile link" }: { path: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(window.location.origin + path); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked */ }
    }}>{done ? "Copied" : label}</button>
  );
}

/* ---------- projects board: instant filter and search ---------- */
export type BoardItem = {
  id: number; name: string; pitch: string; status: string; done: number; total: number;
  team: { id: number; name: string; picture: string | null }[]; open: string[]; funded: boolean; mine: boolean; followed?: boolean; hidden?: number;
  fit: string[]; active: string; quiet: boolean; image?: string | null;
};
export function Board({ items, canReview, initial, forYou = [] }: { items: BoardItem[]; canReview: boolean; initial: string; forYou?: { id: number; why: string[] }[] }) {
  const [f, setF] = useState(initial);
  const [q, setQ] = useState("");
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const why = useMemo(() => new Map(forYou.map((r) => [r.id, r.why])), [forYou]);
  const filters: [string, string][] = [...(forYou.length ? [["foryou", "For you"] as [string, string]] : []), ["all", "All"], ...(items.some((p) => p.fit.length) ? [["fit", "Fits you"] as [string, string]] : []), ["open", "Needs people"], ["building", "Building"], ["shipped", "Shipped"], ["mine", "Mine"]];
  if (items.some((p) => p.followed && !p.mine)) filters.push(["following", "Following"]);
  if (canReview) filters.push(["review", "To review"]);
  const byId = new Map(items.map((p) => [p.id, p]));
  const pool = (k: string) => k === "foryou" ? forYou.map((r) => byId.get(r.id)).filter((p): p is BoardItem => !!p && !gone.has(p.id)) : items.filter((p) => match(p, k));
  const count = (k: string) => pool(k).length;
  const list = pool(f).filter((p) => !q || `${p.name} ${p.pitch} ${p.open.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const hide = (id: number, on: boolean) => {
    setGone((g) => { const n = new Set(g); if (on) n.add(id); else n.delete(id); return n; });
    start(async () => { if (!(await hideFromFeed(id, on))) setGone((g) => { const n = new Set(g); if (on) n.delete(id); else n.add(id); return n; }); });
  };
  const [undo, setUndo] = useState<number | null>(null);
  return (
    <div className="stack">
      <div className="row">
        <input type="search" id="board-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects or roles, e.g. React" aria-label="Search projects" />
      </div>
      <div className="filters">
        {filters.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{label} <span className="mono">{count(k)}</span></button>
        ))}
      </div>
      {f === "foryou" && undo !== null && byId.get(undo) && (
        <div className="note row between" role="status">
          <span>{byId.get(undo)!.name} is out of For you. Projects like it will show up less.</span>
          <button type="button" className="linkbtn" onClick={() => { hide(undo, false); setUndo(null); }}>Undo</button>
        </div>
      )}
      {list.length === 0 && <div className="note">{f === "foryou" ? "Nothing new for you right now. See All for every project." : items.length ? "Nothing matches. Try another filter." : "No projects yet. Post the first one."}</div>}
      {f === "foryou" && list.map((p) => (
        <div key={p.id} className="card lift fy">
          <span className="row between"><span className="row nowrap"><PIcon id={p.id} name={p.name} image={p.image} /><h2><Link className="fy-link" href={`/projects/${p.id}`}>{p.name}</Link></h2></span><Pill status={p.status} /></span>
          <span className="muted">{p.pitch}</span>
          <span className="row">
            <span className="avs">{p.team.map((u) => <Av key={u.id} u={u} />)}</span>
            <Meter done={p.done} total={p.total} />
            <span className="small muted mono">{p.done}/{p.total} milestones</span>
          </span>
          {p.open.length > 0 && <span className="row">{p.open.map((r) => <span key={r} className="chip">Needs: {r}</span>)}</span>}
          <span className="row between fy-foot">
            <span className="fy-why small">{(why.get(p.id) ?? []).join(" · ") || "On your community board"}</span>
            <button type="button" className="fy-hide small" onClick={() => { hide(p.id, true); setUndo(p.id); }} aria-label={`Not for me: ${p.name}`}>Not for me</button>
          </span>
        </div>
      ))}
      {f !== "foryou" && list.map((p) => (
        <Link key={p.id} className="card lift" href={`/projects/${p.id}`}>
          <span className="row between"><span className="row nowrap"><PIcon id={p.id} name={p.name} image={p.image} /><h2>{p.name}</h2></span>
            <span className="row nowrap">{p.hidden === 2 ? <span className="pill plain">Private</span> : p.hidden === 1 ? <span className="pill bad">Hidden</span> : null}<Pill status={p.status} /></span></span>
          <span className="muted">{p.pitch}</span>
          <span className="row">
            <span className="avs">{p.team.map((u) => <Av key={u.id} u={u} />)}</span>
            <Meter done={p.done} total={p.total} />
            <span className="small muted mono">{p.done}/{p.total} milestones</span>
            {p.active && <span className={`small muted ${p.quiet ? "quiet-tag" : ""}`}>{p.quiet ? "Quiet · " : "Active "}{p.active}</span>}
          </span>
          {p.open.length > 0 && <span className="row">{p.open.map((r) => <span key={r} className="chip">Needs: {r}</span>)}{p.fit.length > 0 && !p.mine && <span className="pill ok">Fits your {p.fit.slice(0, 2).join(", ")}</span>}</span>}
          {p.funded && <span><span className="pill ok">Alumni funded</span></span>}
        </Link>
      ))}
    </div>
  );
}
function match(p: BoardItem, k: string) {
  if (k === "fit") return p.fit.length > 0 && !p.mine;
  if (k === "open") return p.open.length > 0;
  if (k === "mine") return p.mine;
  if (k === "following") return !!p.followed && !p.mine;
  if (k === "review") return p.status === "review" && !p.mine;
  if (k === "all") return p.status !== "dropped" || p.mine;
  return p.status === k;
}

/* ---------- ask to join: a button that opens a short pitch for the lead ---------- */
export function JoinAsk({ action, back, role, stake, title }: { action: Action; back: string; role: number; stake: number; title: string }) {
  const [openForm, setOpen] = useState(false);
  if (!openForm) return <button type="button" className="btn" onClick={() => setOpen(true)}>Ask to join · stake {stake}</button>;
  return (
    <F action={action} back={back} hidden={{ role }} className="stack join-ask">
      <label className="field"><span>Why you, for {title}?</span>
        <textarea name="note" id={`join-note-${role}`} rows={3} maxLength={400} autoFocus
          placeholder="What you would do, and something you built that shows it. A link helps." />
        <small>Optional, but leads say yes far more often when they can see what you have done.</small></label>
      <span className="row">
        <button className="btn">Send request · stake {stake}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </F>
  );
}

/* ---------- people: instant search, branch and skill filters, sorting ---------- */
export type Person = {
  id: number; name: string; picture: string | null; branch: string; year: number; verified: boolean;
  skills: string[]; credit: number; shipped: number; joined: number; left: number; path: string; open: boolean;
};
export function PeopleList({ people }: { people: Person[] }) {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [skill, setSkill] = useState("");
  const [sort, setSort] = useState("credit");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const branches = useMemo(() => [...new Set(people.map((p) => p.branch))].sort(), [people]);
  const skills = useMemo(() => {
    const n = new Map<string, number>();
    people.forEach((p) => p.skills.forEach((s) => n.set(s, (n.get(s) ?? 0) + 1)));
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
  }, [people]);
  const list = people
    .filter((p) => (!onlyOpen || p.open) && (!branch || p.branch === branch) && (!skill || p.skills.includes(skill)) &&
      (!q || `${p.name} ${p.branch} ${p.skills.join(" ")}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === "shipped" ? b.shipped - a.shipped || b.credit - a.credit : sort === "name" ? a.name.localeCompare(b.name) : b.credit - a.credit);
  return (
    <div className="stack">
      <div className="row">
        <input ref={input} type="search" id="people-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, branch or skill (press / to jump here)" aria-label="Search people" />
        <select id="people-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={{ flex: "0 0 auto" }}>
          <option value="credit">Most credit</option><option value="shipped">Most shipped</option><option value="name">Name</option>
        </select>
      </div>
      <div className="filters">
        <button type="button" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)}>Open to projects · {people.filter((p) => p.open).length}</button>
        <button type="button" aria-pressed={!branch} onClick={() => setBranch("")}>All branches</button>
        {branches.map((b) => <button key={b} type="button" aria-pressed={branch === b} onClick={() => setBranch(branch === b ? "" : b)}>{b}</button>)}
      </div>
      {skills.length > 0 && (
        <div className="filters">
          {skills.map((s) => <button key={s} type="button" className="quiet" aria-pressed={skill === s} onClick={() => setSkill(skill === s ? "" : s)}>{s}</button>)}
        </div>
      )}
      <span className="small muted">{list.length} {list.length === 1 ? "person" : "people"}</span>
      {list.length === 0 && <div className="note">No one matches. Clear a filter.</div>}
      {list.map((u) => (
        <Link key={u.id} className="card lift" href={`/u/${u.id}`}>
          <span className="row between">
            <span className="row"><Av u={u} /><span><b>{u.name}</b> <span className="muted small">{u.branch} · {u.year}{u.verified ? "" : " · not verified"}</span>{u.open ? <> <span className="pill ok">Open to projects</span></> : null}</span></span>
            <span className="bal">{u.credit} credit</span>
          </span>
          {u.skills.length > 0 && <span className="row">{u.skills.map((k) => <span key={k} className="chip">{k}</span>)}</span>}
          <span className="row between small">
            <span className="muted">{u.path}</span>
            <span className="mono muted">{u.shipped} shipped / {u.joined} joined{u.left ? <span className="neg"> · {u.left} left</span> : null}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ---------- credit split: sliders that have to add up to 100 ---------- */
export function SplitForm({ action, back, id, mates, saved }: {
  action: Action; back: string; id: number; mates: { id: number; name: string; did: string; pct: number }[]; saved: boolean;
}) {
  const [v, setV] = useState<Record<number, number>>(() => Object.fromEntries(mates.map((m) => [m.id, m.pct])));
  const total = Object.values(v).reduce((a, b) => a + b, 0);
  const set = (mid: number, n: number) => {
    const x = Math.max(0, Math.min(100, Math.round(n) || 0));
    // With two teammates the other one is whatever is left.
    if (mates.length === 2) setV({ [mid]: x, [mates.find((m) => m.id !== mid)!.id]: 100 - x });
    else setV({ ...v, [mid]: x });
  };
  const even = () => {
    const base = Math.floor(100 / mates.length);
    setV(Object.fromEntries(mates.map((m, i) => [m.id, base + (i < 100 - base * mates.length ? 1 : 0)])));
  };
  return (
    <F action={action} back={back} hidden={{ id }} className="card">
      <h2>Split the credit between your teammates</h2>
      <p className="small muted">Give out 100 between the others, by how much each one actually did. You are not on your own list, and they are doing the same for you.</p>
      {mates.map((m) => (
        <div key={m.id} className="split">
          <label htmlFor={`pct_${m.id}`} className="stack" style={{ gap: 0 }}><b>{m.name}</b><span className="small muted">{m.did}</span></label>
          <input type="range" min={0} max={100} step={1} value={v[m.id]} onChange={(e) => set(m.id, +e.target.value)} aria-label={`Share for ${m.name}`} disabled={mates.length === 1} />
          <input type="number" name={`pct_${m.id}`} id={`pct_${m.id}`} min={0} max={100} value={v[m.id]} onChange={(e) => set(m.id, +e.target.value)} readOnly={mates.length === 1} />
        </div>
      ))}
      <div className="row between">
        <span className={`mono ${total === 100 ? "" : "neg"}`}>Total {total} / 100{total !== 100 && ` · ${total < 100 ? `${100 - total} left to give` : `${total - 100} too many`}`}</span>
        <span className="row">
          {mates.length > 1 && <button type="button" className="btn ghost sm" onClick={even}>Split evenly</button>}
          <button className="btn" disabled={total !== 100}>{saved ? "Update split" : "Save split"}</button>
        </span>
      </div>
    </F>
  );
}

/* ---------- landing page: try to game the credit ---------- */
const MOVES: { label: string; n: number; shipped?: number; joined?: number; note: string }[] = [
  { label: "Ship a live project with two teammates", n: 33, shipped: 1, joined: 1, note: "A fair third of a 100 pot" },
  { label: "Ship a second one that reviewers call demo-only", n: 20, shipped: 1, joined: 1, note: "A third of a 60 pot" },
  { label: "Get a vouch from someone you shipped with", n: 5, note: "Only teammates can vouch" },
  { label: "Write “AI | Web3 | Founder” in your bio", n: 0, note: "Words are worth nothing" },
  { label: "Collect 40 endorsements from friends", n: 0, note: "They never built with you" },
  { label: "Post about a hackathon you attended", n: 0, note: "Attending is not shipping" },
  { label: "Join a project, then disappear", n: -10, joined: 1, note: "Your stake is lost" },
  { label: "Start a project and drop it", n: -10, joined: 1, note: "It stays on your profile" },
];
export function Simulator() {
  const [on, setOn] = useState<boolean[]>(() => MOVES.map((_, i) => i === 3));
  const picked = MOVES.filter((_, i) => on[i]);
  const credit = Math.max(0, 20 + picked.reduce((a, m) => a + m.n, 0));
  const shipped = picked.reduce((a, m) => a + (m.shipped ?? 0), 0), joined = picked.reduce((a, m) => a + (m.joined ?? 0), 0);
  return (
    <div className="card sim">
      <span className="label">Try to game it</span>
      <div className="row between">
        <div className="stat"><b className="big">{credit}</b><span className="small muted">credit · {shipped} shipped of {joined} joined</span></div>
        <span className="small muted" style={{ maxWidth: "24ch" }}>Everyone starts at 20 once their college or work email is verified.</span>
      </div>
      <div className="stack tight">
        {MOVES.map((m, i) => (
          <label key={m.label} className={`move ${on[i] ? "on" : ""}`}>
            <input type="checkbox" checked={on[i]} onChange={() => setOn(on.map((x, j) => (j === i ? !x : x)))} />
            <span className="stack" style={{ gap: 0, flex: 1 }}><span>{m.label}</span><span className="small muted">{m.note}</span></span>
            <span className={`mono ${m.n < 0 ? "neg" : m.n > 0 ? "pos" : "muted"}`}>{m.n > 0 ? "+" : m.n < 0 ? "−" : ""}{Math.abs(m.n)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------- light / dark switch, remembered in a cookie so the server renders the right one ---------- */
export function ThemeToggle({ theme }: { theme?: "light" | "dark" }) {
  const [t, setT] = useState<"light" | "dark">(theme ?? "dark");
  // With no saved choice the page follows the device, so the button starts from what is showing.
  useEffect(() => { if (!theme && window.matchMedia("(prefers-color-scheme: light)").matches) setT("light"); }, [theme]);
  const flip = () => {
    const next = t === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setT(next);
  };
  return (
    <button type="button" className="iconbtn" onClick={flip} aria-label={t === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={t === "dark" ? "Light mode" : "Dark mode"}>
      {t === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.800A9 9 0 1 1 11.200 3a7 7 0 0 0 9.800 9.800z" /></svg>
      )}
    </button>
  );
}
