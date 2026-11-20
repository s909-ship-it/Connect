"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";
import type { Account } from "@/lib/api";
import { initials } from "./cover";
import { TierChip } from "./tier";

/* The round picture at the top right. It asks Connect who is signed in (GET /api/public/me, sent with Connect's own
   sign-in cookie), then opens a menu: your profile, rank, messages, settings and sign out; or sign in.
   If Connect can't be reached, or the browser keeps its cookie from this site, it simply shows the signed-out menu. */
export function AccountMenu({ appUrl }: { appUrl: string }) {
  const [me, setMe] = useState<Account | null>(null); // null while asking
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const link = (path: string) => `${appUrl}${path}`;
  const pic = (src: string) => (/^https?:\/\//.test(src) ? src : link(src));

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    fetch(link("/api/public/me"), { credentials: "include", signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((a: Account) => setMe(a?.signedIn ? a : { signedIn: false }))
      .catch(() => setMe({ signedIn: false }))
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl]);

  // Close on a click outside or Escape, and hand focus back to the button.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function signOut() {
    setBusy(true); setError("");
    try {
      const r = await fetch(link("/api/public/signout"), { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error();
      setMe({ signedIn: false });
      setOpen(false);
    } catch {
      setError("Couldn't sign out from here.");
    } finally { setBusy(false); }
  }

  const signedIn = me?.signedIn === true ? me : null;
  const face = signedIn
    ? signedIn.picture ? <img src={pic(signedIn.picture)} alt="" referrerPolicy="no-referrer" /> : <span>{initials(signedIn.name)}</span>
    : <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8.5" r="3.75" /><path d="M4.75 19.5c1.2-3.4 3.9-5.25 7.25-5.25s6.05 1.85 7.25 5.25" strokeLinecap="round" /></svg>;

  return (
    <div className={`account${open ? " is-open" : ""}`} ref={box}>
      <button ref={btn} type="button" className={`account-btn${signedIn ? " has-user" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        aria-label={signedIn ? `Account: ${signedIn.name}` : "Account and sign in"} onClick={() => setOpen((v) => !v)} data-loading={me === null || undefined}>
        {face}
      </button>
      <div id={id} className="account-panel" role="menu" aria-hidden={!open} inert={!open}>
        {signedIn ? (
          <>
            <div className="account-who">
              <span className="account-face" aria-hidden="true">{face}</span>
              <span className="account-id">
                <b>{signedIn.name}</b>
                <span className="mono muted">{signedIn.college?.name ?? (signedIn.onboarded ? "Connect" : "Finish setting up")}</span>
              </span>
            </div>
            {signedIn.rank && <TierChip tier={signedIn.rank} className="account-rank" />}
            {signedIn.anonymous && <span className="mono muted account-note">You're anonymous. Others see this alias.</span>}
            <nav className="account-links" aria-label="Account">
              <a role="menuitem" href={link(`/u/${signedIn.id}`)}>Your profile <span aria-hidden="true">↗</span></a>
              {signedIn.rank && <a role="menuitem" href={link(`/u/${signedIn.id}?tab=progress`)}>Rank and progress <span aria-hidden="true">↗</span></a>}
              <a role="menuitem" href={link("/messages")}>Messages <span aria-hidden="true">↗</span></a>
              <a role="menuitem" href={link("/inbox")}>Inbox <span aria-hidden="true">↗</span></a>
              <a role="menuitem" href={link("/settings")}>Settings <span aria-hidden="true">↗</span></a>
            </nav>
            <button role="menuitem" type="button" className="account-out" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
            {error && <p className="account-error">{error} <a href={link("/settings")}>Open Connect</a></p>}
          </>
        ) : (
          <>
            <p className="account-lead">{me === null ? "Checking…" : "You're not signed in."}</p>
            <a role="menuitem" className="account-cta" href={link("/signin")}>Sign in to Connect</a>
            <nav className="account-links" aria-label="Account">
              <a role="menuitem" href={link("/signin")}>Join with your college email <span aria-hidden="true">↗</span></a>
              <a role="menuitem" href={link("/rules")}>How credit works <span aria-hidden="true">↗</span></a>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
