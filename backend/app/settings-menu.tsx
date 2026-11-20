"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Mode = "light" | "dark" | "device";

/* Light, dark, or follow the device. Used in the gear menu and on the Settings page; the two stay in step. */
export function ThemeSeg({ saved }: { saved?: "light" | "dark" }) {
  const [mode, setMode] = useState<Mode>(saved ?? "device");
  useEffect(() => {
    const hear = (e: Event) => setMode((e as CustomEvent<Mode>).detail);
    window.addEventListener("connect-theme", hear);
    return () => window.removeEventListener("connect-theme", hear);
  }, []);
  const pick = (m: Mode) => {
    const root = document.documentElement;
    if (m === "device") {
      delete root.dataset.theme;
      document.cookie = "theme=; path=/; max-age=0; samesite=lax";
    } else {
      root.dataset.theme = m;
      document.cookie = `theme=${m}; path=/; max-age=31536000; samesite=lax`;
    }
    window.dispatchEvent(new CustomEvent("connect-theme", { detail: m }));
  };
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {(["light", "dark", "device"] as Mode[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pick(m)}>
          {m === "light" ? "Light" : m === "dark" ? "Dark" : "Device"}
        </button>
      ))}
    </div>
  );
}

/* The gear in the header: who you are, light / dark / follow the device, the settings pages, and sign out. */
export function SettingsMenu({ name, profile, saved, signOut, member }: {
  name: string; profile?: string; saved?: "light" | "dark"; signOut: () => Promise<void>; member: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const id = useId(), path = usePathname();

  // Close on a click outside or on Escape, and hand focus back to the gear.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="smenu" ref={box}>
      <button ref={btn} type="button" className="iconbtn" aria-haspopup="true" aria-expanded={open} aria-controls={id}
        aria-label="Settings and sign out" title="Settings" onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="smenu-panel" id={id} role="group" aria-label="Settings">
          <div className="smenu-who">
            <span className="small muted">Signed in as</span>
            {profile ? <Link href={profile} onClick={() => setOpen(false)}>{name}</Link> : <b>{name}</b>}
          </div>
          <fieldset className="smenu-theme">
            <legend className="small muted">Appearance</legend>
            <ThemeSeg saved={saved} />
          </fieldset>
          <nav className="smenu-links" aria-label="Settings pages">
            {member && <Link href="/settings" onClick={() => setOpen(false)}>Settings<span className="small muted">Alerts, privacy, devices, your data</span></Link>}
            {member && <Link href="/settings#alerts" onClick={() => setOpen(false)}>Alerts on this device<span className="small muted">Calls and messages when Connect is closed</span></Link>}
            {profile && <Link href="/onboarding?edit=1" onClick={() => setOpen(false)}>Edit your profile<span className="small muted">Skills, links, a line about you</span></Link>}
            <Link href={`/feedback?from=${encodeURIComponent(path)}`} onClick={() => setOpen(false)}>Send feedback<span className="small muted">Report a problem or suggest an idea</span></Link>
            <Link href="/rules" onClick={() => setOpen(false)}>How credit works</Link>
          </nav>
          <form action={signOut} className="smenu-out">
            <button type="submit" className="btn ghost sm">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
