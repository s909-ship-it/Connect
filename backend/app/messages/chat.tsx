"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadChat, sendMessage, shareProject, type Msg } from "../chat-actions";
import { ShareFile, VoiceNote, VoiceRecorder } from "./media";
import { AVATAR } from "../bits";

type Person = { id: number; name: string; picture: string | null };

/* Same limits as the server (lib/files.ts); checked here first so people find out before uploading. */
const MAX_IMAGE = 8 * 1024 * 1024, MAX_FILE = 10 * 1024 * 1024, MAX_VIDEO = 25 * 1024 * 1024, AT_ONCE = 4;
const DOCS = ".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv";
const OK_EXT = /\.(jpe?g|png|webp|gif|heic|mp4|mov|m4v|webm|pdf|docx|pptx|xlsx|txt|md|csv)$/i;
const kindOf = (f: File) => (f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name) ? "video" : "file");
const limitOf = (f: File) => ({ image: MAX_IMAGE, video: MAX_VIDEO, file: MAX_FILE })[kindOf(f)];
const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
type Pending = { id: string; file: File; url: string | null; w?: number; h?: number; progress: number; error?: string; voice?: boolean; seconds?: number };
export type ShareableProject = { id: number; name: string; status: string };

/* Photos are shrunk to 2000px and re-saved before upload. That keeps them small and drops hidden data such as
   the GPS location phones write into photos. GIFs are left alone so they keep moving. */
export async function prepare(file: File): Promise<{ file: File; w?: number; h?: number }> {
  if (kindOf(file) === "video") {
    const v = document.createElement("video"); v.preload = "metadata"; v.src = URL.createObjectURL(file);
    await new Promise((r) => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 3000); });
    return { file, w: v.videoWidth || undefined, h: v.videoHeight || undefined };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    if (file.type === "image/gif") {
      const img = new Image(); img.src = URL.createObjectURL(file);
      await img.decode().catch(() => {});
      return { file, w: img.naturalWidth || undefined, h: img.naturalHeight || undefined };
    }
    return { file };
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const keep = file.type !== "image/jpeg" && scale === 1 && file.size < 2 * 1024 * 1024;
    if (keep) return { file, w, h };
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.85));
    if (!blob) return { file, w, h };
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + (type === "image/webp" ? ".webp" : ".jpg");
    return { file: new File([blob], name, { type }), w, h };
  } catch { return { file }; }
}

/* Uploads one attachment with progress. */
function upload(to: number, p: { file: File; w?: number; h?: number; voice?: boolean; seconds?: number }, caption: string, onProgress: (n: number) => void): Promise<{ message?: Msg; error?: string }> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append("to", String(to)); fd.append("file", p.file); fd.append("caption", caption);
    if (p.w) fd.append("w", String(p.w)); if (p.h) fd.append("h", String(p.h));
    if (p.voice) fd.append("voice", "1"); if (p.seconds) fd.append("seconds", String(p.seconds));
    const x = new XMLHttpRequest();
    x.open("POST", "/api/messages/attach");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { try { resolve(JSON.parse(x.responseText)); } catch { resolve({ error: "Upload failed." }); } };
    x.onerror = () => resolve({ error: "Upload failed. Check your connection." });
    x.send(fd);
  });
}

function FileIcon({ type }: { type: string }) {
  const label = type.includes("pdf") ? "PDF" : type.includes("word") ? "DOC" : type.includes("presentation") ? "PPT" : type.includes("sheet") ? "XLS" : "TXT";
  return <span className={`file-ico ${label.toLowerCase()}`} aria-hidden="true">{label}</span>;
}

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
function Face({ u, size = 36 }: { u: Person; size?: number }) {
  return u.picture
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="face" src={u.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="face" style={{ width: size, height: size, background: AVATAR[Math.abs(Number(u.id) || 0) % AVATAR.length] }}>{initials(u.name)}</span>;
}
const time = (t: number) => new Date(t * 1000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
function day(t: number) {
  const d = new Date(t * 1000), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/* One conversation: bubbles grouped by day, new messages every few seconds, Enter to send. */
export function Chat({ other, initial, initialSeen, canSend, reason, projects = [], callButtons, anon = false }: {
  other: Person & { branch?: string }; initial: Msg[]; initialSeen: number; canSend: boolean; reason?: string;
  projects?: ShareableProject[]; callButtons?: React.ReactNode; anon?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [seenUpTo, setSeen] = useState(initialSeen);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, start] = useTransition();
  const [files, setFiles] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<Msg | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<"" | "attach" | "project">("");
  const [recording, setRecording] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const last = msgs.length ? msgs[msgs.length - 1].id : 0;
  const lastRef = useRef(last);
  lastRef.current = last;
  const router = useRouter();

  // Opening the chat marks its messages read; refresh once so the header badge drops.
  useEffect(() => { if (initial.some((m) => !m.mine)) router.refresh(); }, [other.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for new messages every 4 seconds while the tab is open.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      const r = await loadChat(other.id, lastRef.current);
      if (!alive || "error" in r) return;
      if (r.messages.length) {
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        if (r.messages.some((x) => !x.mine)) router.refresh();
      }
      setSeen(r.seenUpTo);
    };
    const t = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [other.id, router]);

  useLayoutEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  // Grow the box with what you type, up to five lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !el.offsetParent) return; // hidden while recording: measure when it is back
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 2, 140) + "px";
  }, [text, files.length, recording, uploading]);

  const addFiles = (list: FileList | File[]) => {
    setErr("");
    const incoming = [...list];
    const room = AT_ONCE - files.length;
    if (incoming.length > room) setErr(`Up to ${AT_ONCE} files at a time.`);
    const next: Pending[] = [];
    for (const f of incoming.slice(0, Math.max(0, room))) {
      const k = kindOf(f);
      if (!OK_EXT.test(f.name) && !/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/.test(f.type)) { setErr(`${f.name}: send photos, videos, PDFs, Word, PowerPoint, Excel or text files.`); continue; }
      // Photos get shrunk before upload, so a big one from a phone camera is fine at this point.
      if (f.size > (k === "image" ? MAX_IMAGE * 3 : limitOf(f))) { setErr(`${f.name} is ${mb(f.size)}. The limit for ${k === "image" ? "photos" : k === "video" ? "videos" : "files"} is ${mb(limitOf(f))}.`); continue; }
      next.push({ id: `${Date.now()}-${Math.random()}`, file: f, url: k !== "file" ? URL.createObjectURL(f) : null, progress: 0 });
    }
    if (next.length) setFiles((x) => [...x, ...next]);
  };
  const drop = (id: string) => setFiles((x) => { const gone = x.find((p) => p.id === id); if (gone?.url) URL.revokeObjectURL(gone.url); return x.filter((p) => p.id !== id); });

  const sendFiles = async () => {
    setUploading(true); setErr("");
    let caption = text.trim();
    for (const p of files) {
      const ready = p.voice ? { file: p.file, voice: true, seconds: p.seconds } : await prepare(p.file);
      if (ready.file.size > (p.voice ? 6 * 1024 * 1024 : limitOf(ready.file))) {
        setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, error: "Too big" } : y)));
        setErr(`${p.file.name} is too big even after shrinking.`); continue;
      }
      const r = await upload(other.id, ready, caption, (n) => setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, progress: n } : y))));
      if (r.error || !r.message) { setErr(r.error ?? "Upload failed."); setFiles((x) => x.map((y) => (y.id === p.id ? { ...y, error: r.error } : y))); break; }
      caption = "";
      setText("");
      setMsgs((m) => (m.some((x) => x.id === r.message!.id) ? m : [...m, r.message!]));
      drop(p.id);
    }
    setUploading(false);
    box.current?.focus();
  };

  const sendVoice = async (file: File, seconds: number) => {
    setRecording(false);
    const p: Pending = { id: `v-${Date.now()}`, file, url: null, progress: 0, voice: true, seconds };
    setUploading(true); setErr("");
    const r = await upload(other.id, { file, voice: true, seconds }, "", () => {});
    setUploading(false);
    if (r.error || !r.message) { setErr(r.error ?? "Could not send the voice note."); return; }
    setMsgs((m) => (m.some((x) => x.id === r.message!.id) ? m : [...m, r.message!]));
    void p;
  };
  const sendProject = (pid: number) => {
    setMenu("");
    start(async () => {
      const r = await shareProject(other.id, pid);
      if ("error" in r) { setErr(r.error); return; }
      setMsgs((m) => (m.some((x) => x.id === r.message.id) ? m : [...m, r.message]));
    });
  };

  const send = () => {
    if (files.length) { if (!uploading) void sendFiles(); return; }
    const body = text.trim();
    if (!body || sending) return;
    setErr("");
    start(async () => {
      const r = await sendMessage(other.id, body);
      if ("error" in r) { setErr(r.error); return; }
      setText("");
      setMsgs((m) => (m.some((x) => x.id === r.message.id) ? m : [...m, r.message]));
      box.current?.focus();
    });
  };

  const lastMine = useMemo(() => [...msgs].reverse().find((m) => m.mine)?.id ?? 0, [msgs]);
  let prevDay = "";

  return (
    <section className={`chat ${dragging ? "dragging" : ""}`} aria-label={`Conversation with ${other.name}`}
      onDragOver={(e) => { if (canSend && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (!canSend) return; e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      {dragging && <div className="drop-hint">Drop to attach</div>}
      <header className="chat-head">
        <Link href="/messages" className="chat-back" aria-label="All conversations">←</Link>
        <Link href={`/u/${other.id}`} className="row nowrap chat-who">
          <Face u={other} size={40} />
          <span className="stack" style={{ gap: 0, minWidth: 0 }}><b className="ellipsis">{other.name}</b>{other.branch && <span className="small muted">{other.branch}</span>}</span>
        </Link>
        {callButtons && <span className="chat-calls">{callButtons}</span>}
      </header>

      <div className="chat-scroll" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <Face u={other} size={72} />
            <b>{other.name}</b>
            <span className="small muted">Say hi. Ask what they are building, or pitch your project.</span>
          </div>
        )}
        {msgs.map((m, i) => {
          const d = day(m.created_at), showDay = d !== prevDay;
          prevDay = d;
          const next = msgs[i + 1];
          const tail = !next || next.mine !== m.mine || day(next.created_at) !== d || next.created_at - m.created_at > 300;
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day"><span>{d}</span></div>}
              <div className={`bubble-row ${m.mine ? "mine" : ""} ${tail ? "tail" : ""}`}>
                {!m.mine && (tail ? <Face u={other} size={28} /> : <span style={{ width: 28, flex: "none" }} />)}
                {m.kind === "invite" || m.kind === "project" ? (
                  <div className={`invite-card ${m.kind}`}>
                    <span className="label">{m.kind === "invite" ? "Project invite" : "Shared a project"}</span>
                    <b>{m.project_name ?? "A project"}</b>
                    <span className="small" style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
                    {m.project_id && <Link className="btn sm" href={`/projects/${m.project_id}`}>{m.mine || m.kind === "project" ? "Open project" : "See the project and ask to join"}</Link>}
                    <span className="bubble-time">{time(m.created_at)}</span>
                  </div>
                ) : m.kind === "call" ? (
                  <div className="call-log"><span aria-hidden="true">{/video/i.test(m.text) ? "🎥" : "📞"}</span>{m.text}<span className="bubble-time">{time(m.created_at)}</span></div>
                ) : m.file && m.kind === "voice" ? (
                  <div className="file-msg"><VoiceNote src={`/api/files/${m.file.key}`} seconds={m.file.secs} mine={m.mine} /><span className="bubble-time">{time(m.created_at)}</span></div>
                ) : m.file && m.kind === "video" ? (
                  <div className="photo-msg">
                    <video className="video" src={`/api/files/${m.file.key}`} controls playsInline preload="metadata"
                      width={m.file.w ?? undefined} height={m.file.h ?? undefined}
                      style={m.file.w && m.file.h ? { aspectRatio: `${m.file.w} / ${m.file.h}` } : undefined} />
                    {m.text && <div className="bubble caption">{m.text}</div>}
                    <span className="bubble-time">{time(m.created_at)} · <ShareFile url={`/api/files/${m.file.key}`} name={m.file.name} type={m.file.type} className="linklike" /></span>
                  </div>
                ) : m.file && m.kind === "image" ? (
                  <div className="photo-msg">
                    <button type="button" className="photo" onClick={() => setView(m)} aria-label={`Open photo ${m.file.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${m.file.key}`} alt={m.text || m.file.name} loading="lazy"
                        onLoad={() => { if (i >= msgs.length - 3) end.current?.scrollIntoView({ block: "end" }); }}
                        width={m.file.w ?? undefined} height={m.file.h ?? undefined}
                        style={m.file.w && m.file.h ? { aspectRatio: `${m.file.w} / ${m.file.h}` } : undefined} />
                    </button>
                    {m.text && <div className="bubble caption">{m.text}</div>}
                    <span className="bubble-time">{time(m.created_at)}</span>
                  </div>
                ) : m.file ? (
                  <div className="file-msg">
                    <a className="file-card" href={`/api/files/${m.file.key}`} target="_blank" rel="noopener">
                      <FileIcon type={m.file.type} />
                      <span className="stack" style={{ gap: 0, minWidth: 0 }}><b className="ellipsis">{m.file.name}</b><span className="small muted">{mb(m.file.size)}</span></span>
                    </a>
                    <span className="row nowrap file-acts"><a className="small file-dl" href={`/api/files/${m.file.key}?download=1`}>Download</a><ShareFile url={`/api/files/${m.file.key}`} name={m.file.name} type={m.file.type} className="linklike small" /></span>
                    {m.text && <div className="bubble caption">{m.text}</div>}
                    <span className="bubble-time">{time(m.created_at)}</span>
                  </div>
                ) : (
                  <div className="bubble" title={new Date(m.created_at * 1000).toLocaleString("en-IN")}>
                    {m.text}
                    <span className="bubble-time">{time(m.created_at)}</span>
                  </div>
                )}
              </div>
              {m.mine && m.id === lastMine && <div className="seen">{seenUpTo >= m.id ? "Seen" : "Sent"}</div>}
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {canSend ? (
        <form className={`chat-input ${recording ? "is-rec" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
          {files.length > 0 && (
            <div className="tray" aria-label="Attachments to send">
              {files.map((p) => (
                <div key={p.id} className={`tray-item ${p.error ? "bad" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.url && kindOf(p.file) === "video" ? <video src={p.url} muted playsInline /> : p.url ? <img src={p.url} alt="" /> : <span className="tray-file"><FileIcon type={p.file.name.split(".").pop() === "pdf" ? "pdf" : p.file.name.match(/\.(docx)$/i) ? "word" : p.file.name.match(/\.(pptx)$/i) ? "presentation" : p.file.name.match(/\.(xlsx)$/i) ? "sheet" : "text"} /><span className="ellipsis small">{p.file.name}</span></span>}
                  {uploading && !p.error ? <span className="tray-bar"><b style={{ width: `${Math.round(p.progress * 100)}%` }} /></span>
                    : <button type="button" className="tray-x" onClick={() => drop(p.id)} aria-label={`Remove ${p.file.name}`}>×</button>}
                </div>
              ))}
            </div>
          )}
          {menu === "attach" && (
            <div className="attach-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(""); camera.current?.click(); }}><i className="am cam">📷</i>Camera</button>
              <button type="button" role="menuitem" onClick={() => { setMenu(""); picker.current?.click(); }}><i className="am gal">🖼️</i>Photos &amp; videos</button>
              <button type="button" role="menuitem" onClick={() => { setMenu(""); docs.current?.click(); }}><i className="am doc">📄</i>Document</button>
              <button type="button" role="menuitem" onClick={() => setMenu("project")}><i className="am prj">🚀</i>Project</button>
              <span className="small muted am-note">Photos {mb(MAX_IMAGE)} · videos {mb(MAX_VIDEO)} · files {mb(MAX_FILE)}</span>
            </div>
          )}
          {menu === "project" && (
            <div className="attach-menu" role="menu">
              <span className="label">Share one of your projects</span>
              {projects.length === 0 && <span className="small muted">You are not on any project yet.</span>}
              {projects.map((p) => <button key={p.id} type="button" role="menuitem" onClick={() => sendProject(p.id)}><i className="am prj">🚀</i>{p.name}</button>)}
              <button type="button" className="small" onClick={() => setMenu("attach")}>← Back</button>
            </div>
          )}
          {recording && <VoiceRecorder anon={anon} onDone={sendVoice} onCancel={(why) => { setRecording(false); if (why) setErr(why); }} />}
          <button type="button" className={`attach ${menu ? "on" : ""}`} onClick={() => setMenu(menu ? "" : "attach")} disabled={uploading || files.length >= AT_ONCE || recording} aria-label="Attach" aria-expanded={!!menu} title="Camera, photos, videos, documents or a project">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          <input ref={picker} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={docs} type="file" accept={DOCS} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <textarea
            ref={box} rows={1} value={text} maxLength={2000} placeholder={files.length ? "Add a caption (optional)" : `Message ${other.name.split(" ")[0]}`} aria-label="Message"
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addFiles(f); } }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          />
          {!recording && !text.trim() && !files.length ? (
            <button type="button" className="send mic" disabled={uploading} aria-label="Record a voice note" title="Record a voice note" onClick={() => { setMenu(""); setErr(""); setRecording(true); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
            </button>
          ) : !recording && <button className="send" disabled={(!text.trim() && !files.length) || sending || uploading} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
          </button>}
          {err && <span className="chat-err" role="alert">{err}</span>}
        </form>
      ) : <div className="chat-input note">{reason}</div>}

      {view?.file && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={view.file.name} onClick={() => setView(null)}
          onKeyDown={(e) => e.key === "Escape" && setView(null)} tabIndex={-1} ref={(el) => el?.focus()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${view.file.key}`} alt={view.text || view.file.name} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span className="small">{view.text || view.file.name}</span>
            <ShareFile url={`/api/files/${view.file.key}`} name={view.file.name} type={view.file.type} />
            <a className="btn sm ghost" href={`/api/files/${view.file.key}?download=1`}>Download</a>
            <button type="button" className="btn sm" onClick={() => setView(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* Start a conversation: search people at your college. */
export function NewChat({ people }: { people: (Person & { branch: string; skills: string })[] }) {
  const [q, setQ] = useState("");
  const list = people.filter((p) => !q || `${p.name} ${p.branch} ${p.skills}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="stack new-chat">
      <input type="search" id="new-chat-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people in your community by name, branch or skill" aria-label="Search people to message" autoFocus />
      <div className="people-pick">
        {list.map((p) => (
          <Link key={p.id} href={`/messages/${p.id}`} className="pick">
            <Face u={p} size={40} />
            <span className="stack" style={{ gap: 0, minWidth: 0 }}><b>{p.name}</b><span className="small muted ellipsis">{p.branch}{p.skills ? ` · ${p.skills}` : ""}</span></span>
          </Link>
        ))}
        {list.length === 0 && <span className="small muted">No one matches.</span>}
      </div>
    </div>
  );
}
