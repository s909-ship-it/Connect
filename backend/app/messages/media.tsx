"use client";

import { useEffect, useRef, useState } from "react";
import { disguise } from "../calls/voice";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const VOICE_MAX_SECONDS = 300;

/* Records a voice note with the microphone. Shows a live timer and level; stops by itself at five minutes. */
/* `anon`: the person is anonymous, so the note is recorded in the disguised voice (app/calls/voice.ts). */
export function VoiceRecorder({ onDone, onCancel, anon = false }: { onDone: (f: File, seconds: number) => void; onCancel: (why?: string) => void; anon?: boolean }) {
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, timer = 0, ctx: AudioContext | null = null, stopVoice = () => {};
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (anon) { const d = disguise(stream); stopVoice = d.stop; stream = d.stream; }
      } catch {
        onCancel("Allow the microphone to record a voice note.");
        return;
      }
      // Chrome and Firefox record WebM/Opus; Safari records MP4/AAC.
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      rec.current = r;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop()); stopVoice();
        if (cancelled.current) return;
        const mime = r.mimeType || type || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const s = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        onDone(new File(chunks.current, `voice-note.${ext}`, { type: mime.split(";")[0] }), s);
      };
      r.start(500);
      started.current = Date.now();
      timer = window.setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setSecs(s);
        if (s >= VOICE_MAX_SECONDS && r.state === "recording") r.stop();
      }, 200);
      // A small level meter so you can see the mic is hearing you.
      ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteTimeDomainData(data); let m = 0; for (const v of data) m = Math.max(m, Math.abs(v - 128)); setLevel(m / 128); raf = requestAnimationFrame(tick); };
      tick();
    })();
    return () => {
      cancelAnimationFrame(raf); clearInterval(timer); void ctx?.close();
      if (rec.current?.state === "recording") { cancelled.current = true; rec.current.stop(); }
      stream?.getTracks().forEach((t) => t.stop()); stopVoice();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="recorder" role="group" aria-label="Recording a voice note">
      <button type="button" className="rec-x" aria-label="Cancel recording" onClick={() => { cancelled.current = true; rec.current?.stop(); onCancel(); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
      </button>
      <span className="rec-dot" aria-hidden="true" />
      <span className="mono">{clock(secs)}</span>
      <span className="rec-level" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ height: `${Math.max(12, Math.min(100, level * 260 * (0.5 + Math.abs(Math.sin(i * 1.7 + secs * 3)) / 1.4)))}%` }} />)}</span>
      <span className="small muted hide-sm">max {clock(VOICE_MAX_SECONDS)}</span>
      <button type="button" className="send" aria-label="Send voice note" onClick={() => rec.current?.state === "recording" && rec.current.stop()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
      </button>
    </div>
  );
}

/* A voice note in the chat: play/pause, a bar you can tap to jump, and the time. */
export function VoiceNote({ src, seconds, mine }: { src: string; seconds: number | null; mine: boolean }) {
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(seconds ?? 0);
  return (
    <div className={`voice ${mine ? "mine" : ""}`}>
      <audio ref={a} src={src} preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setDur(d); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setT(0); }}
        onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button type="button" className="voice-play" aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={() => { const el = a.current!; if (el.paused) { document.querySelectorAll("audio").forEach((x) => x !== el && x.pause()); void el.play(); } else el.pause(); }}>
        {playing ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>}
      </button>
      <span className="voice-bar" role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} tabIndex={0}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (a.current && dur) a.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}
        onKeyDown={(e) => { if (!a.current) return; if (e.key === "ArrowRight") a.current.currentTime += 5; if (e.key === "ArrowLeft") a.current.currentTime -= 5; }}>
        <b style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} />
      </span>
      <span className="mono small">{clock(playing || t ? t : dur)}</span>
    </div>
  );
}

/* Send a chat file to another app (WhatsApp, Instagram, Mail...) with the phone's share sheet.
   Where sharing files is not supported, it downloads instead. */
export function ShareFile({ url, name, type, className = "btn sm ghost" }: { url: string; name: string; type: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} onClick={async (e) => {
      e.stopPropagation();
      setBusy(true);
      try {
        const blob = await fetch(url).then((r) => r.blob());
        const file = new File([blob], name, { type });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
        else { const a = document.createElement("a"); a.href = url + "?download=1"; a.click(); }
      } catch { /* closed the share sheet */ }
      setBusy(false);
    }}>Share</button>
  );
}

/* Share a page link to other apps, or copy it where the share sheet is not available. */
export function ShareLink({ path, title, text, label = "Share" }: { path: string; title: string; text?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm share-btn" onClick={async () => {
      const url = location.origin + path;
      try {
        if (navigator.share) await navigator.share({ title, text, url });
        else { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1800); }
      } catch { /* closed the share sheet */ }
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>
      {done ? "Link copied" : label}
    </button>
  );
}
