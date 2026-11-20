"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { loadTeamChat, pinTeamMessage, sendTeamMessage, type Pin, type TeamMsg } from "../../team-actions";
import { prepare } from "../../messages/chat";
import { Face, PersonLink, RoleTag, type Mate } from "./team-ui";

export { RoleTag } from "./team-ui";
type Pending = { id: string; file: File; url: string; progress: number; error?: string };

const MAX_PHOTO = 8 * 1024 * 1024, AT_ONCE = 6;
const time = (t: number) => new Date(t * 1000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
function day(t: number) {
  const d = new Date(t * 1000), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/* Uploads one photo to the team chat, with progress. */
function upload(project: number, p: { file: File; w?: number; h?: number }, caption: string, onProgress: (n: number) => void): Promise<{ message?: TeamMsg; error?: string }> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append("project", String(project)); fd.append("file", p.file); fd.append("caption", caption);
    if (p.w) fd.append("w", String(p.w)); if (p.h) fd.append("h", String(p.h));
    const x = new XMLHttpRequest();
    x.open("POST", "/api/team/attach");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { try { resolve(JSON.parse(x.responseText)); } catch { resolve({ error: "Upload failed." }); } };
    x.onerror = () => resolve({ error: "Upload failed. Check your connection." });
    x.send(fd);
  });
}

/* The team's group chat: everyone's name with their role tag, photos, pinned messages, and lines when people join or leave. */
export function TeamChat({ project, team, initial, initialPins }: { project: number; team: Mate[]; initial: TeamMsg[]; initialPins: Pin[] }) {
  const [msgs, setMsgs] = useState<TeamMsg[]>(initial);
  const [pinned, setPinned] = useState<Pin[]>(initialPins);
  const [showPins, setShowPins] = useState(false);
  const [flash, setFlash] = useState(0);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, start] = useTransition();
  const [files, setFiles] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<TeamMsg | null>(null);
  const picker = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null), box = useRef<HTMLTextAreaElement>(null);
  const lastRef = useRef(0);
  lastRef.current = msgs.length ? msgs[msgs.length - 1].id : 0;
  const pinnedIds = new Set(pinned.map((p) => p.id));

  // New messages and pins every 4 seconds while the tab is open.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      const r = await loadTeamChat(project, lastRef.current);
      if (!alive || "error" in r) return;
      setPinned(r.pins);
      if (r.messages.length) setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
    };
    const t = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [project]);

  useLayoutEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 2, 140) + "px";
  }, [text, files.length]);

  const addFiles = (list: FileList | File[]) => {
    setErr("");
    const incoming = [...list], room = AT_ONCE - files.length;
    if (incoming.length > room) setErr(`Up to ${AT_ONCE} photos at a time.`);
    const next: Pending[] = [];
    for (const f of incoming.slice(0, Math.max(0, room))) {
      if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)) { setErr(`${f.name}: only photos can be sent here.`); continue; }
      if (f.size > MAX_PHOTO * 3) { setErr(`${f.name} is too big.`); continue; }
      next.push({ id: `${Date.now()}-${Math.random()}`, file: f, url: URL.createObjectURL(f), progress: 0 });
    }
    if (next.length) setFiles((x) => [...x, ...next]);
  };
  const drop = (id: string) => setFiles((x) => { const gone = x.find((p) => p.id === id); if (gone) URL.revokeObjectURL(gone.url); return x.filter((p) => p.id !== id); });
  const add = (m: TeamMsg) => setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));

  const sendPhotos = async () => {
    setUploading(true); setErr("");
    let caption = text.trim();
    for (const p of files) {
      const ready = await prepare(p.file);
      if (ready.file.size > MAX_PHOTO) { setErr(`${p.file.name} is too big even after shrinking.`); setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, error: "Too big" } : y))); continue; }
      const r = await upload(project, ready, caption, (n) => setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, progress: n } : y))));
      if (r.error || !r.message) { setErr(r.error ?? "Upload failed."); setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, error: r.error } : y))); break; }
      caption = ""; setText(""); add(r.message); drop(p.id);
    }
    setUploading(false);
    box.current?.focus();
  };
  const send = () => {
    if (files.length) { if (!uploading) void sendPhotos(); return; }
    const body = text.trim();
    if (!body || sending) return;
    setErr("");
    start(async () => {
      const r = await sendTeamMessage(project, body);
      if ("error" in r) { setErr(r.error); return; }
      setText(""); add(r.message); box.current?.focus();
    });
  };
  const pin = (id: number, on: boolean) => start(async () => {
    const r = await pinTeamMessage(project, id, on);
    if ("error" in r) { setErr(r.error); return; }
    setPinned(r.pins);
    const fresh = await loadTeamChat(project, lastRef.current);
    if (!("error" in fresh) && fresh.messages.length) setMsgs((m) => [...m, ...fresh.messages.filter((x) => !m.some((y) => y.id === x.id))]);
  });
  const jump = (id: number) => {
    setShowPins(false);
    const el = document.getElementById(`tm-${id}`);
    if (!el) { setErr("That message is further back than this chat has loaded."); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id); setTimeout(() => setFlash(0), 1800);
  };

  let prevDay = "";
  return (
    <section className={`chat team-chat ${dragging ? "dragging" : ""}`} aria-label="Team chat"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      {dragging && <div className="drop-hint">Drop photos to send</div>}
      <div className="team-roster" aria-label="The team">
        {team.map((u) => (
          <Link key={u.id} href={`/u/${u.id}`} className="roster-chip" title={`Open ${u.name}'s profile`}>
            <Face u={u} size={22} /><span className="ellipsis">{u.name.split(" ")[0]}</span><RoleTag role={u.role} lead={u.lead} />
          </Link>
        ))}
      </div>
      {pinned.length > 0 && (
        <div className="pin-bar">
          <button type="button" className="pin-top" onClick={() => setShowPins(!showPins)} aria-expanded={showPins}>
            <span aria-hidden="true">📌</span>
            <span className="ellipsis"><b>{pinned[0].from}:</b> {pinned[0].text}</span>
            <span className="small muted pin-count">{pinned.length === 1 ? "1 pinned" : `${pinned.length} pinned`}</span>
          </button>
          {showPins && (
            <ul className="pin-list">
              {pinned.map((p) => (
                <li key={p.id}>
                  <button type="button" className="pin-go" onClick={() => jump(p.id)}>
                    <span className="ellipsis"><b>{p.from}</b> {p.text}</span>
                    <span className="small muted">Pinned by {p.by.split(" ")[0]}</span>
                  </button>
                  <button type="button" className="linkbtn small" onClick={() => pin(p.id, false)}>Unpin</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="chat-scroll" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <b>Say hello to your team</b>
            <span className="small muted">Only the people on this project can read this chat. Plan the next milestone, share screenshots, ask for help. Pin what everyone needs to see.</span>
          </div>
        )}
        {msgs.map((m, i) => {
          const d = day(m.created_at), showDay = d !== prevDay;
          prevDay = d;
          if (m.kind === "system") return <div key={m.id}>{showDay && <div className="chat-day"><span>{d}</span></div>}<div className="team-system"><span>{m.text}</span></div></div>;
          const prev = msgs[i - 1], next = msgs[i + 1];
          const sameAs = (o?: TeamMsg) => !!o && o.kind !== "system" && o.from?.id === m.from?.id && day(o.created_at) === d && Math.abs(o.created_at - m.created_at) < 300;
          const head = !sameAs(prev) || showDay, tail = !sameAs(next);
          const who = m.from!, isPinned = pinnedIds.has(m.id);
          const tools = (
            <button type="button" className={`msg-pin ${isPinned ? "on" : ""}`} onClick={() => pin(m.id, !isPinned)}
              aria-label={isPinned ? "Unpin this message" : "Pin this message"} title={isPinned ? "Unpin" : "Pin for the team"}>📌</button>
          );
          return (
            <div key={m.id} id={`tm-${m.id}`} className={flash === m.id ? "tm-flash" : undefined}>
              {showDay && <div className="chat-day"><span>{d}</span></div>}
              {head && !m.mine && (
                <div className="team-who"><PersonLink u={{ id: who.id, name: who.name, picture: who.picture }} /><RoleTag role={who.gone ? "Former member" : who.role} lead={who.lead && !who.gone} /></div>
              )}
              <div className={`bubble-row ${m.mine ? "mine" : ""} ${tail ? "tail" : ""}`}>
                {!m.mine && (tail ? <Link href={`/u/${who.id}`} aria-label={`Open ${who.name}'s profile`}><Face u={who} size={28} /></Link> : <span style={{ width: 28, flex: "none" }} />)}
                {m.mine && tools}
                {m.file ? (
                  <div className="photo-msg">
                    <button type="button" className="photo" onClick={() => setView(m)} aria-label={`Open photo from ${who.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${m.file.key}`} alt={m.text || `Photo from ${who.name}`} loading="lazy"
                        onLoad={() => { if (i >= msgs.length - 3) end.current?.scrollIntoView({ block: "end" }); }}
                        width={m.file.w ?? undefined} height={m.file.h ?? undefined}
                        style={m.file.w && m.file.h ? { aspectRatio: `${m.file.w} / ${m.file.h}` } : undefined} />
                    </button>
                    {m.text && <div className="bubble caption">{m.text}</div>}
                    <span className="bubble-time">{isPinned && "📌 "}{time(m.created_at)}</span>
                  </div>
                ) : (
                  <div className="bubble" title={new Date(m.created_at * 1000).toLocaleString("en-IN")}>{m.text}<span className="bubble-time">{isPinned && "📌 "}{time(m.created_at)}</span></div>
                )}
                {!m.mine && tools}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {files.length > 0 && (
          <div className="tray" aria-label="Photos to send">
            {files.map((p) => (
              <div key={p.id} className={`tray-item ${p.error ? "bad" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" />
                {uploading && !p.error ? <span className="tray-bar"><b style={{ width: `${Math.round(p.progress * 100)}%` }} /></span>
                  : <button type="button" className="tray-x" onClick={() => drop(p.id)} aria-label={`Remove ${p.file.name}`}>×</button>}
              </div>
            ))}
          </div>
        )}
        <button type="button" className="attach" onClick={() => picker.current?.click()} disabled={uploading || files.length >= AT_ONCE} aria-label="Send photos" title="Send photos">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
        </button>
        <button type="button" className="attach cam-only" onClick={() => camera.current?.click()} disabled={uploading || files.length >= AT_ONCE} aria-label="Take a photo" title="Take a photo">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        </button>
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <textarea ref={box} rows={1} value={text} maxLength={2000} placeholder={files.length ? "Add a caption (optional)" : "Message the team"} aria-label="Message the team"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addFiles(f); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="send" disabled={(!text.trim() && !files.length) || sending || uploading} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
        </button>
        {err && <span className="chat-err" role="alert">{err}</span>}
      </form>

      {view?.file && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setView(null)}
          onKeyDown={(e) => e.key === "Escape" && setView(null)} tabIndex={-1} ref={(el) => el?.focus()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${view.file.key}`} alt={view.text || "Photo"} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span className="small">{view.from?.name}{view.text ? `: ${view.text}` : ""}</span>
            <button type="button" className="btn sm ghost" onClick={() => { pin(view.id, !pinnedIds.has(view.id)); setView(null); }}>{pinnedIds.has(view.id) ? "Unpin" : "Pin"}</button>
            <a className="btn sm ghost" href={`/api/files/${view.file.key}?download=1`}>Download</a>
            <button type="button" className="btn sm" onClick={() => setView(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
