"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { prepare } from "./messages/chat";

/* Uploads one image to `url` (a profile photo or a project's image), shrunk and stripped of hidden data first. */
async function send(url: string, file: File): Promise<string | null> {
  const ready = await prepare(file);
  const fd = new FormData();
  fd.append("file", ready.file);
  const r = await fetch(url, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Upload failed. Check your connection." }));
  return r.error ?? null;
}

function Picker({ label, url, removeLabel, hasOwn, after }: { label: string; url: string; removeLabel: string; hasOwn: boolean; after?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)) { setMsg({ ok: false, text: "Pick a photo." }); return; }
    setBusy(true); setMsg(null);
    const err = await send(url, f);
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: after ?? "Saved." });
    if (!err) router.refresh();
  };
  const drop = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "Could not remove it." }));
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Removed." });
    if (!r.error) router.refresh();
  };
  return (
    <span className="stack tight">
      <span className="row">
        <button type="button" className="btn sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : label}</button>
        {hasOwn && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void drop()}>{removeLabel}</button>}
      </span>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {msg && <span className={`small ${msg.ok ? "muted" : "neg"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </span>
  );
}

/* Your own profile photo. While anonymous it is kept aside and the pattern still shows. */
export function PhotoUpload({ hasOwn, anon }: { hasOwn: boolean; anon: boolean }) {
  return <Picker label={hasOwn ? "Change photo" : "Upload a photo"} url="/api/me/photo" removeLabel="Use my sign-in photo" hasOwn={hasOwn}
    after={anon ? "Saved. You are anonymous, so people still see your pattern until you turn that off." : "Saved. Everyone now sees this photo."} />;
}

/* A project's own image, for its team. */
export function ProjectImageUpload({ id, hasOwn }: { id: number; hasOwn: boolean }) {
  return <Picker label={hasOwn ? "Change image" : "Upload an image"} url={`/api/projects/${id}/image`} removeLabel="Use the cover from the name" hasOwn={hasOwn} after="Saved." />;
}
