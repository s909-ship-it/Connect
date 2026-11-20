"use client";

import { useState } from "react";

/* "Bring Connect to your college". Posts to this site's /api/interest, which forwards to the backend stub
   POST /api/public/college-interest. TODO (backend): that endpoint only logs the request; see its route file. */
export function InterestForm({ signin }: { signin: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/interest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ college: f.get("college"), email: f.get("email") }) });
      if (res.status === 422) { setState("error"); setMsg("Add your college and a valid email."); return; }
      if (!res.ok) throw new Error(String(res.status));
      setState("done");
    } catch { setState("error"); setMsg("That did not go through. Try again in a minute."); }
  }
  if (state === "done") return (
    <p className="form-done" role="status">
      Thanks. Requests like this are not saved yet, so the quickest way in is still to <a href={signin}>sign in with your college email</a>: colleges on academic domains (.edu, .ac.in) open the moment the first student proves one.
    </p>
  );
  return (
    <form className="interest" onSubmit={submit} noValidate>
      <label><span className="mono">College</span><input name="college" required maxLength={120} autoComplete="organization" placeholder="Your college" /></label>
      <label><span className="mono">Email</span><input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="you@college.ac.in" /></label>
      <button className="btn-line" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Ask for Connect"} <span aria-hidden="true">→</span></button>
      {state === "error" && <p className="form-error" role="alert">{msg}</p>}
    </form>
  );
}
