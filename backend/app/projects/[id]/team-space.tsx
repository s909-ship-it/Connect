"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { teamCallStatus } from "../../team-actions";
import { TeamCall } from "./team-call";
import { Face, type Mate } from "./team-ui";
import "./team.css";

type CallInfo = { id: number; video: boolean; since: number; people: { id: number; name: string; picture: string | null }[] } | null;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const names = (ps: { name: string }[]) => {
  const n = ps.map((p) => p.name.split(" ")[0]);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
};

/* The frame of a project's team space: header with the call buttons, the Chat / Notes / Tasks tabs, a bar when a
   call is on, and the call itself, which stays up while people switch tabs. */
export function TeamSpace({ project, team, me, anon = false, chatUnread, call: first, children }: {
  project: { id: number; name: string }; team: Mate[]; me: number; anon?: boolean; chatUnread: number; call: CallInfo; children: React.ReactNode;
}) {
  const path = usePathname();
  const tab = /\/notes(\/|$)/.test(path) ? "notes" : /\/tasks$/.test(path) ? "tasks" : "chat";
  const [call, setCall] = useState<CallInfo>(first);
  const [joined, setJoined] = useState<null | { video: boolean }>(null);
  const [unread, setUnread] = useState(chatUnread);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { if (tab === "chat") setUnread(0); }, [tab]);

  // Is a call on? Checked every few seconds, so the "Join" bar appears when a teammate starts one.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      setNow(Math.floor(Date.now() / 1000));
      if (document.hidden) return;
      const r = await teamCallStatus(project.id);
      if (alive && !("error" in r)) setCall(r.call);
    };
    const t = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [project.id]);

  const start = (video: boolean) => setJoined({ video: call ? call.video : video });
  const live = call && !joined;
  return (
    <div className="team-space">
      <header className="ts-head">
        <Link href={`/projects/${project.id}`} className="ts-back" aria-label={`Back to ${project.name}`}>←</Link>
        <span className="ts-title">
          <b className="ellipsis">{project.name}</b>
          <span className="small muted">Team space · {team.length} {team.length === 1 ? "person" : "people"}</span>
        </span>
        {!joined && (
          <span className="ts-call">
            <button type="button" className="ts-callbtn" onClick={() => start(false)} aria-label={call ? "Join the team call" : "Start a team voice call"} title={call ? "Join the call" : "Team voice call"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
            </button>
            <button type="button" className="ts-callbtn" onClick={() => start(true)} aria-label={call ? "Join the team call" : "Start a team video call"} title={call ? "Join the call" : "Team video call"}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
            </button>
          </span>
        )}
      </header>
      <nav className="ts-tabs" aria-label="Team space">
        <Link href={`/projects/${project.id}/chat`} aria-current={tab === "chat" ? "page" : undefined}>Chat{unread > 0 && tab !== "chat" && <b className="ts-badge">{unread > 99 ? "99+" : unread}</b>}</Link>
        <Link href={`/projects/${project.id}/notes`} aria-current={tab === "notes" ? "page" : undefined}>Notes</Link>
        <Link href={`/projects/${project.id}/tasks`} aria-current={tab === "tasks" ? "page" : undefined}>Tasks</Link>
      </nav>
      {live && (
        <div className="ts-callbar" role="status">
          <span className="ts-live" aria-hidden="true" />
          <span className="avs">{call.people.slice(0, 4).map((p) => <Face key={p.id} u={p} size={24} />)}</span>
          <span className="ts-callbar-text"><b>Team {call.video ? "video" : "voice"} call</b> <span className="muted">with {names(call.people)} · {clock(Math.max(0, now - call.since))}</span></span>
          <button type="button" className="btn sm ts-join" onClick={() => setJoined({ video: call.video })}>Join</button>
        </div>
      )}
      <div className="ts-body">{children}</div>
      {joined && (
        <TeamCall project={project} me={me} team={team} video={joined.video} anon={anon}
          onClose={() => { setJoined(null); void teamCallStatus(project.id).then((r) => { if (!("error" in r)) setCall(r.call); }); }} />
      )}
    </div>
  );
}
