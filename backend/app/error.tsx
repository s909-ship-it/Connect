"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card narrow">
      <h1>Something broke on our side</h1>
      <p className="muted">Nothing you did was lost. Try again, and if it keeps happening tell an admin what you were doing.</p>
      <div><button className="btn" onClick={() => retry()}>Try again</button></div>
    </div>
  );
}
