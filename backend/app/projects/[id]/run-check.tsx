"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* The button that runs the AI proof check. It says what it is doing while it works: reading the links takes a few
   seconds, then Gemini compares. The report itself is drawn by the server once it is saved. */
export function RunCheck({ id, action, again }: { id: number; action: (id: number) => Promise<{ error?: string }>; again: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [secs, setSecs] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);
  const run = () => start(async () => {
    setErr(null);
    const r = await action(id);
    if (r.error) setErr(r.error);
    else router.refresh();
  });
  return (
    <div className="stack tight pc-run">
      <button type="button" className="btn sm" disabled={pending} aria-busy={pending} onClick={run}>
        {pending ? "Checking…" : again ? "Run again" : "Run AI proof check"}
      </button>
      {pending && <span className="small muted" role="status">{secs < 6 ? "Reading GitHub and the live site" : "Gemini is comparing the claims with the evidence"} · {secs}s</span>}
      {err && <span className="small neg" role="alert">{err}</span>}
    </div>
  );
}
