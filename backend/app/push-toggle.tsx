"use client";

import { useEffect, useState } from "react";

/* Turn on call and message alerts for this device. The browser asks for permission once. */
const key = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
type St = "loading" | "unsupported" | "ios" | "denied" | "off" | "on" | "busy";

export function PushToggle({ publicKey, compact = false }: { publicKey: string; compact?: boolean }) {
  const [st, setSt] = useState<St>("loading");
  const [err, setErr] = useState("");
  useEffect(() => {
    (async () => {
      if (!publicKey) return setSt("unsupported");
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const installed = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSt(ios && !installed ? "ios" : "unsupported");
      if (Notification.permission === "denied") return setSt("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setSt(sub && Notification.permission === "granted" ? "on" : "off");
      // Keep the server's copy fresh (subscriptions can change under us).
      if (sub) void fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    })().catch(() => setSt("unsupported"));
  }, [publicKey]);

  const on = async () => {
    setSt("busy"); setErr("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setSt(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not save.");
      setSt("on");
    } catch (e) { setErr((e as Error).message || "Could not turn alerts on."); setSt("off"); }
  };
  const off = async () => {
    setSt("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setSt("off");
  };

  if (st === "loading" || (compact && (st === "on" || st === "unsupported"))) return null;
  const text = {
    unsupported: "This browser cannot get call alerts while Connect is closed.",
    ios: "On iPhone: tap Share, then Add to Home Screen, and open Connect from there to get call alerts.",
    denied: "Notifications are blocked for Connect. Allow them in your browser's site settings, then come back.",
    off: "Get calls and messages even when Connect is closed.",
    on: "Calls ring and messages arrive on this device even when Connect is closed.",
    busy: "One moment…",
  }[st];
  return (
    <div className={`push-toggle ${compact ? "compact" : ""} ${st}`}>
      <span className="push-ico" aria-hidden="true">{st === "on" ? "🔔" : "🔕"}</span>
      <span className="small" style={{ flex: 1 }}>{text}{err && <><br /><span className="neg">{err}</span></>}</span>
      {(st === "off" || st === "busy") && <button type="button" className="btn sm" onClick={on} disabled={st === "busy"}>Turn on</button>}
      {st === "on" && <button type="button" className="btn ghost sm" onClick={off}>Turn off</button>}
    </div>
  );
}
