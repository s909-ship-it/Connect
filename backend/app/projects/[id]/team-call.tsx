"use client";

import { useEffect, useRef, useState } from "react";
import { chooseCamera, nextCamera, type Cam } from "../../calls/camera";
import { disguise } from "../../calls/voice";
import { Face, RoleTag, type Mate } from "./team-ui";

/* A team call. Every browser in the call connects straight to every other one (a "mesh"); the server only passes
   the connection details on (app/api/team-call). Whoever joins calls everyone already in, so two people never call
   each other at once. Kept to a team-sized group: each extra person is one more connection for everyone. */

type PeerInfo = { user: number; device: string; name: string; picture: string | null; role: string; lead: boolean };
type Peer = PeerInfo & { stream: MediaStream | null; mic: boolean; cam: boolean; state: string };
type Entry = { pc: RTCPeerConnection; queue: RTCIceCandidateInit[]; initiator: boolean; restarted: boolean };
type Signal = { type: string; from: { user: number; device: string } | null; payload: unknown };

const SIZE = { width: { ideal: 960 }, height: { ideal: 540 } };
const CAM_KEY = "connect-camera";
const key = (p: { user: number; device: string }) => `${p.user}:${p.device}`;
const newDevice = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");
const touch = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
async function cameras(): Promise<Cam[]> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId); } catch { return []; }
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Tile({ name, picture, id, role, lead, stream, mic, cam, me, state }: {
  name: string; picture: string | null; id: number; role: string; lead: boolean; stream: MediaStream | null; mic: boolean; cam: boolean; me?: boolean; state?: string;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const showVideo = !!stream && cam && stream.getVideoTracks().some((t) => t.readyState === "live");
  useEffect(() => { if (v.current && v.current.srcObject !== stream) v.current.srcObject = stream; }, [stream, showVideo]);
  return (
    <div className={`tc-tile ${me ? "me" : ""}`}>
      {showVideo ? <video ref={v} autoPlay playsInline muted /> : <span className="tc-face"><Face u={{ id, name, picture }} size={84} /></span>}
      <span className="tc-name">
        {!mic && <span className="tc-muted" aria-label="Muted" title="Muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M2 2l20 20" /></svg>
        </span>}
        <b>{me ? "You" : name.split(" ")[0]}</b><RoleTag role={role} lead={lead} />
        {state && state !== "connected" && !me && <span className="tc-state">{state === "failed" ? "Lost" : "Connecting…"}</span>}
      </span>
    </div>
  );
}

/* Their voice plays through this, so it keeps playing while the call is shrunk to a bar. */
function Voice({ stream }: { stream: MediaStream | null }) {
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (a.current && a.current.srcObject !== stream) { a.current.srcObject = stream; void a.current.play().catch(() => {}); } }, [stream]);
  return <audio ref={a} autoPlay />;
}

/* `anon`: this person is in anonymous mode. They join with sound only, disguised on their device, and still see everyone else. */
export function TeamCall({ project, me, team, video, anon = false, onClose }: { project: { id: number; name: string }; me: number; team: Mate[]; video: boolean; anon?: boolean; onClose: () => void }) {
  const self = team.find((t) => t.id === me) ?? { id: me, name: "You", picture: null, role: "Member", lead: false };
  const [peers, setPeers] = useState<Peer[]>([]);
  const [phase, setPhase] = useState<"joining" | "live" | "ended">("joining");
  const [note, setNote] = useState("");
  const [mic, setMic] = useState(true), [cam, setCam] = useState(video && !anon);
  const [mini, setMini] = useState(false);
  const [secs, setSecs] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const device = useRef(""), callId = useRef(0), ice = useRef<RTCIceServer[]>([]);
  const local = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, Entry>());
  const es = useRef<EventSource | null>(null);
  const media = useRef({ mic: true, cam: video && !anon });
  const voiceStop = useRef<() => void>(() => {});
  const closed = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    closed.current = false;
    device.current = newDevice();
    const myDevice = device.current;
    const post = (body: Record<string, unknown>) => fetch("/api/team-call", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, device: myDevice }),
    }).then((r) => r.json()).catch(() => ({ error: "Network error. Check your connection." }));
    const signal = (to: { user: number; device: string }, type: string, payload: unknown) => { void post({ action: "signal", call: callId.current, to, type, payload }); };

    const upsert = (info: Partial<Peer> & { user: number; device: string }) => setPeers((ps) => {
      const i = ps.findIndex((p) => key(p) === key(info));
      if (i < 0) return [...ps, { name: "Someone", picture: null, role: "Member", lead: false, stream: null, mic: true, cam: true, state: "connecting", ...info }];
      const next = [...ps]; next[i] = { ...next[i], ...info }; return next;
    });
    const drop = (k: string) => { pcs.current.get(k)?.pc.close(); pcs.current.delete(k); setPeers((ps) => ps.filter((p) => key(p) !== k)); };

    const connection = (peer: { user: number; device: string }, initiator: boolean): Entry => {
      const k = key(peer), old = pcs.current.get(k);
      if (old) return old;
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      const e: Entry = { pc, queue: [], initiator, restarted: false };
      pcs.current.set(k, e);
      local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
      // In a video call without a camera of your own, still see everyone else.
      if (video && !local.current?.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = (ev) => upsert({ ...peer, stream: ev.streams[0] ?? new MediaStream([ev.track]) });
      pc.onicecandidate = (ev) => { if (ev.candidate) signal(peer, "ice", ev.candidate.toJSON()); };
      pc.onconnectionstatechange = async () => {
        upsert({ ...peer, state: pc.connectionState });
        // One automatic retry with fresh routes; the one who called makes the new offer.
        if (pc.connectionState === "failed" && e.initiator && !e.restarted) {
          e.restarted = true;
          const o = await pc.createOffer({ iceRestart: true }); await pc.setLocalDescription(o); signal(peer, "offer", o);
        }
      };
      return e;
    };
    const flush = async (e: Entry) => { for (const c of e.queue.splice(0)) await e.pc.addIceCandidate(c).catch(() => {}); };

    const cleanup = () => {
      if (closed.current) return;
      closed.current = true;
      es.current?.close(); es.current = null;
      pcs.current.forEach((e) => e.pc.close()); pcs.current.clear();
      local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
      voiceStop.current(); voiceStop.current = () => {};
      if (callId.current) void post({ action: "leave", call: callId.current });
    };
    const finish = (why: string) => { cleanup(); setPhase("ended"); setNote(why); setTimeout(() => closeRef.current(), 2500); };

    const onSignal = async (d: Signal) => {
      if (d.type === "ended") return finish("The call ended.");
      if (d.type === "gone" || d.type === "replaced") return finish("You joined this call from another tab or device.");
      const from = d.from!;
      if (d.type === "joined") { upsert({ ...(d.payload as PeerInfo), state: "connecting" }); return; }
      if (d.type === "left") { drop(key(from)); return; }
      if (d.type === "media") { const m = d.payload as { mic: boolean; cam: boolean }; upsert({ ...from, mic: !!m.mic, cam: !!m.cam }); return; }
      if (d.type === "offer") {
        const e = connection(from, false);
        upsert({ ...from });
        await e.pc.setRemoteDescription(d.payload as RTCSessionDescriptionInit);
        const a = await e.pc.createAnswer(); await e.pc.setLocalDescription(a);
        signal(from, "answer", a);
        signal(from, "media", media.current);
        await flush(e);
        return;
      }
      const e = pcs.current.get(key(from));
      if (!e) return;
      if (d.type === "answer") { await e.pc.setRemoteDescription(d.payload as RTCSessionDescriptionInit); await flush(e); }
      else if (d.type === "ice") { if (e.pc.remoteDescription) await e.pc.addIceCandidate(d.payload as RTCIceCandidateInit).catch(() => {}); else e.queue.push(d.payload as RTCIceCandidateInit); }
    };

    (async () => {
      // Sound always; the camera too in a video call, the computer's own one first (see app/calls/camera.ts).
      if (anon) {
        try {
          const raw = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          const d = disguise(raw); voiceStop.current = d.stop; local.current = d.stream;
          setNote("You are anonymous: your voice is disguised and your camera stays off.");
        } catch { return finish("Allow the microphone to join the call."); }
      } else try {
        let want: string | undefined;
        if (video) { let saved: string | null = null; try { saved = localStorage.getItem(CAM_KEY); } catch { /* private window */ } want = chooseCamera(await cameras(), saved, touch()); }
        local.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: video ? (want ? { deviceId: { exact: want }, ...SIZE } : { facingMode: "user", ...SIZE }) : false,
        });
      } catch {
        if (!video) return finish("Allow the microphone to join the call.");
        try {
          local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          media.current.cam = false; setCam(false); setNote("No camera, so you joined with sound only.");
        } catch { return finish("Allow the microphone to join the call."); }
      }
      if (!alive) { local.current?.getTracks().forEach((t) => t.stop()); local.current = null; return; }
      setLocalStream(local.current);
      const r = await post({ action: "join", project: project.id, video });
      if (!alive) { if (r.call) void post({ action: "leave", call: r.call }); return; }
      if (r.error) return finish(r.error);
      callId.current = r.call; ice.current = r.ice ?? [];
      const src = new EventSource(`/api/team-call/events?call=${r.call}&device=${myDevice}`);
      es.current = src;
      let chain = Promise.resolve();
      src.addEventListener("team", (ev) => {
        let d: Signal; try { d = JSON.parse((ev as MessageEvent).data); } catch { return; }
        chain = chain.then(() => onSignal(d)).catch(() => {});
      });
      setPhase("live");
      for (const p of (r.peers ?? []) as PeerInfo[]) {
        upsert({ ...p, state: "connecting" });
        const e = connection(p, true);
        const o = await e.pc.createOffer(); await e.pc.setLocalDescription(o);
        signal(p, "offer", o);
        signal(p, "media", media.current);
      }
    })();

    // Closing the tab leaves the call straight away, instead of after the others notice the silence.
    const bye = () => { if (callId.current && !closed.current) navigator.sendBeacon("/api/team-call", new Blob([JSON.stringify({ action: "leave", call: callId.current, device: myDevice })], { type: "application/json" })); };
    window.addEventListener("pagehide", bye);
    cleanupRef.current = cleanup;
    return () => { alive = false; window.removeEventListener("pagehide", bye); cleanup(); };
  }, [project.id, video, anon]);

  const tellAll = () => {
    for (const k of pcs.current.keys()) {
      const [user, dev] = k.split(":");
      void fetch("/api/team-call", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signal", call: callId.current, device: device.current, to: { user: Number(user), device: dev }, type: "media", payload: media.current }) }).catch(() => {});
    }
  };
  const toggleMic = () => { const on = !media.current.mic; media.current.mic = on; local.current?.getAudioTracks().forEach((t) => (t.enabled = on)); setMic(on); tellAll(); };
  const toggleCam = () => {
    if (!local.current?.getVideoTracks().length) { setNote("No camera in this call."); return; }
    const on = !media.current.cam; media.current.cam = on; local.current.getVideoTracks().forEach((t) => (t.enabled = on)); setCam(on); tellAll();
  };
  const switchCam = async () => {
    const l = local.current, cur = l?.getVideoTracks()[0];
    if (!l || !cur) return;
    try {
      let constraint: MediaTrackConstraints;
      let pick: Cam | undefined;
      if (touch()) constraint = { facingMode: cur.getSettings().facingMode === "environment" ? "user" : "environment" };
      else { pick = nextCamera(await cameras(), cur.getSettings().deviceId); if (!pick) { setNote("This device has only one camera."); return; } constraint = { deviceId: { exact: pick.deviceId } }; }
      const s = await navigator.mediaDevices.getUserMedia({ video: { ...constraint, ...SIZE } });
      const t = s.getVideoTracks()[0]; t.enabled = media.current.cam;
      for (const e of pcs.current.values()) await e.pc.getSenders().find((x) => x.track?.kind === "video")?.replaceTrack(t);
      cur.stop(); l.removeTrack(cur); l.addTrack(t);
      setLocalStream(new MediaStream(l.getTracks()));
      if (pick) { try { localStorage.setItem(CAM_KEY, pick.deviceId); } catch { /* not remembered */ } setNote(`Camera: ${pick.label || "next camera"}`); }
    } catch { setNote("That camera could not be opened. It may be in use by another app."); }
  };
  const leave = () => { cleanupRef.current(); onClose(); };

  useEffect(() => { if (!note || phase === "ended") return; const t = setTimeout(() => setNote(""), 4000); return () => clearTimeout(t); }, [note, phase]);

  const count = peers.length + 1;
  if (mini) return (
    <div className="tc-mini" role="region" aria-label="Team call">
      {peers.map((p) => <Voice key={key(p)} stream={p.stream} />)}
      <span className="ts-live" aria-hidden="true" />
      <span className="small"><b>Team call</b> · {count} {count === 1 ? "person" : "people"} · {clock(secs)}</span>
      <button type="button" className="tc-btn" onClick={toggleMic} aria-pressed={!mic} aria-label={mic ? "Mute" : "Unmute"}>{mic ? "Mute" : "Unmute"}</button>
      <button type="button" className="tc-btn" onClick={() => setMini(false)} aria-label="Open the call">Open</button>
      <button type="button" className="tc-btn end" onClick={leave} aria-label="Leave the call">Leave</button>
    </div>
  );
  return (
    <div className="tc" role="dialog" aria-modal="true" aria-label={`Team call, ${project.name}`}>
      {peers.map((p) => <Voice key={key(p)} stream={p.stream} />)}
      <div className="tc-top">
        <b>{project.name}</b>
        <span className="small">{phase === "joining" ? "Joining…" : phase === "ended" ? note : `${count} in the call · ${clock(secs)}`}</span>
      </div>
      <div className={`tc-grid n${Math.min(count, 9)}`}>
        <Tile {...self} stream={localStream} mic={mic} cam={cam && video} me />
        {peers.map((p) => <Tile key={key(p)} id={p.user} name={p.name} picture={p.picture} role={p.role} lead={p.lead} stream={p.stream} mic={p.mic} cam={p.cam} state={p.state} />)}
      </div>
      {phase === "live" && peers.length === 0 && <p className="tc-alone">Waiting for your team. They can join from the bar in the team space, and they got a notification.</p>}
      {note && phase !== "ended" && <div className="tc-note" role="status">{note}</div>}
      <div className="tc-controls">
        <button type="button" className={`cc ${mic ? "" : "off"}`} onClick={toggleMic} aria-pressed={!mic} aria-label={mic ? "Mute" : "Unmute"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d={mic ? "M5 10a7 7 0 0 0 14 0M12 17v5" : "M5 10a7 7 0 0 0 14 0M12 17v5M2 2l20 20"} /></svg>
        </button>
        {video && !anon && <button type="button" className={`cc ${cam ? "" : "off"}`} onClick={toggleCam} aria-pressed={!cam} aria-label={cam ? "Turn camera off" : "Turn camera on"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" />{!cam && <path d="M2 2l20 20" />}</svg>
        </button>}
        {video && !anon && <button type="button" className="cc" onClick={switchCam} aria-label="Switch camera">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M9 13a3 3 0 0 0 5.2 2M15 13a3 3 0 0 0-5.2-2" /></svg>
        </button>}
        <button type="button" className="cc" onClick={() => setMini(true)} aria-label="Shrink the call to a bar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>
        </button>
        <button type="button" className="cc end" onClick={leave} aria-label="Leave the call">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path transform="rotate(135 12 12)" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
        </button>
      </div>
    </div>
  );
}
