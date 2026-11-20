"use client";
import Link from "next/link";
import { useState, useTransition } from "react";

/* Shown once per device until it is closed. Connect sets only cookies it needs, so there is nothing to choose. */
export function ConsentBanner({ action }: { action: () => Promise<void> }) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  return (
    <section className="consent" role="region" aria-label="Cookies">
      <p><b>Cookies.</b> Connect uses only the cookies it needs: to keep you signed in and remember your settings. No ads, no tracking. <Link href="/cookies">Details</Link></p>
      <div className="row consent-btns">
        <button type="button" className="btn sm" disabled={pending} onClick={() => start(async () => { await action(); setGone(true); })}>Got it</button>
      </div>
    </section>
  );
}
