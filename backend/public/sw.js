/* Connect service worker: shows call and message notifications when the app is closed or hidden. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function anyVisible() {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return wins.some((w) => w.visibilityState === "visible");
}

async function handle(d) {
  const reg = self.registration;
  if (d.type === "call") {
    // An open, visible Connect tab rings by itself.
    if (await anyVisible()) return;
    return reg.showNotification(`${d.from.name} is calling`, {
      body: d.video ? "Incoming video call on Connect" : "Incoming voice call on Connect",
      tag: `call-${d.id}`, renotify: true, requireInteraction: true,
      vibrate: [500, 250, 500, 250, 500, 250, 500], icon: "/app-icon/192", badge: "/app-icon/192",
      data: d, actions: [{ action: "answer", title: "Answer" }, { action: "decline", title: "Decline" }],
    });
  }
  if (d.type === "call-end") {
    for (const n of await reg.getNotifications({ tag: `call-${d.id}` })) n.close();
    if (!d.missed) return;
    return reg.showNotification(`Missed ${d.video ? "video" : "voice"} call`, {
      body: `from ${d.from.name}`, tag: `missed-${d.id}`, icon: "/app-icon/192", badge: "/app-icon/192",
      data: { url: `/messages/${d.from.id}` },
    });
  }
  if (d.type === "team") {
    if (await anyVisible()) return;
    return reg.showNotification(d.title, {
      body: d.text, tag: `team-${d.project}`, renotify: true, icon: "/app-icon/192", badge: "/app-icon/192",
      data: { url: d.url },
    });
  }
  if (d.type === "msg") {
    if (await anyVisible()) return;
    return reg.showNotification(d.from.name, {
      body: d.text, tag: `chat-${d.from.id}`, renotify: true, icon: "/app-icon/192", badge: "/app-icon/192",
      data: { url: `/messages/${d.from.id}` },
    });
  }
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { return; }
  e.waitUntil(handle(d));
});

async function open(url) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const here = wins.find((w) => new URL(w.url).origin === self.location.origin);
  if (here) { await here.focus(); return here.navigate(url); }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  if (d.type === "call") {
    if (e.action === "decline") {
      e.waitUntil(fetch("/api/calls", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline", id: d.id }) }));
      return;
    }
    // Tapping the notification or Answer opens the chat and picks up.
    e.waitUntil(open(`/messages/${d.from.id}?answer=${d.id}`));
    return;
  }
  e.waitUntil(open(d.url || "/messages"));
});
