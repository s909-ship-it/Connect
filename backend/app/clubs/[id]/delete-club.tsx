"use client";

import { useRef, useState } from "react";
import { F } from "../../client";

type Action = (fd: FormData) => Promise<void>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/* Deleting a club lives behind its own panel: a quiet button in the club's settings opens a sheet that slides up
   (a centred card on a computer). The delete button only wakes up once the club's name is typed exactly. */
export function DeleteClub({ club, name, back, action }: { club: number; name: string; back: string; action: Action }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const close = () => { sheet.current?.close(); setTyped(""); };
  const ready = norm(typed) === norm(name);
  return (
    <>
      <div className="danger-row">
        <span className="small muted">Deleting removes the club for everyone.</span>
        <button type="button" className="linkbtn danger-link" onClick={() => sheet.current?.showModal()}>Delete club…</button>
      </div>
      <dialog ref={sheet} className="sheet" aria-labelledby="delete-club-title" onClose={() => setTyped("")}
        onClick={(e) => { if (e.target === sheet.current) close(); }}>
        <div className="sheet-grip" aria-hidden="true" />
        <F action={action} back={back} hidden={{ club }} className="stack">
          <h2 id="delete-club-title">Delete {name}?</h2>
          <p className="small muted">The club, its roster and its plans are removed, and every member is told. Projects and credit are not touched. This cannot be undone.</p>
          <label className="field"><span>Type <b>{name}</b> to confirm</span>
            <input type="text" name="confirm" id="club-delete-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} required /></label>
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button className="btn danger" disabled={!ready}>Delete for good</button>
          </div>
        </F>
      </dialog>
    </>
  );
}
