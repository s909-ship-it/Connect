"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addTask, editTask, removeTask, teamTasks, type Task } from "../../team-actions";
import { Face, RoleTag, type Mate } from "./team-ui";

/* The team's task board, like a Notion board: To do, Doing, Done. Drag cards between columns (or within one to
   reorder); on a phone, open a card to change its status. Each card can have someone from the team on it and a due date. */
const COLUMNS: [id: Task["status"], label: string][] = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
const dueText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function TeamTasks({ project, me, team, initial, today }: { project: number; me: number; team: Mate[]; initial: Task[]; today: string }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [filter, setFilter] = useState<"all" | "mine" | "open">("all");
  const [adding, setAdding] = useState<Task["status"] | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<Task | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ col: Task["status"]; before: number | null } | null>(null);
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const busy = useRef(false);

  // Teammates' changes show up within a few seconds, except while you are dragging or editing.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || busy.current || drag || open) return;
      const r = await teamTasks(project);
      if (!("error" in r)) setTasks(r.tasks);
    }, 6000);
    return () => clearInterval(t);
  }, [project, drag, open]);

  const apply = (r: { tasks: Task[] } | { error: string }) => { if ("error" in r) setErr(r.error); else { setErr(""); setTasks(r.tasks); } };
  const add = (col: Task["status"]) => {
    const title = draft.trim();
    if (!title) { setAdding(null); return; }
    setDraft("");
    start(async () => { busy.current = true; apply(await addTask(project, title, col)); busy.current = false; });
  };
  const edit = (id: number, patch: Parameters<typeof editTask>[2]) => start(async () => {
    busy.current = true;
    const r = await editTask(project, id, patch);
    apply(r);
    if (!("error" in r) && open?.id === id) setOpen(r.tasks.find((t) => t.id === id) ?? null);
    busy.current = false;
  });
  const del = (id: number) => { if (!confirm("Delete this task?")) return; setOpen(null); start(async () => apply(await removeTask(project, id))); };
  const drop = () => {
    if (drag && over) {
      // Show the move at once; the server's order follows.
      setTasks((ts) => ts.map((t) => (t.id === drag ? { ...t, status: over.col } : t)));
      edit(drag, { status: over.col, before: over.before });
    }
    setDrag(null); setOver(null);
  };

  const shown = tasks.filter((t) => filter === "all" || (filter === "mine" ? t.assignee?.id === me : !t.assignee));
  const mineOpen = tasks.filter((t) => t.assignee?.id === me && t.status !== "done").length;
  return (
    <div className="board-wrap">
      <div className="board-bar">
        <div className="filters" role="group" aria-label="Show">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span className="mono">{tasks.length}</span></button>
          <button type="button" aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>Mine <span className="mono">{mineOpen}</span></button>
          <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Unassigned</button>
        </div>
        {err && <span className="small neg" role="alert">{err}</span>}
      </div>
      <div className="board">
        {COLUMNS.map(([col, label]) => {
          const cards = shown.filter((t) => t.status === col);
          return (
            <section key={col} className={`board-col col-${col} ${over?.col === col ? "over" : ""}`} aria-label={label}
              onDragOver={(e) => { if (drag == null) return; e.preventDefault(); if (!over || over.col !== col) setOver({ col, before: null }); }}
              onDrop={(e) => { e.preventDefault(); drop(); }}>
              <header className="board-head"><span className={`board-dot ${col}`} aria-hidden="true" /><b>{label}</b><span className="small muted">{cards.length}</span></header>
              {cards.map((t) => {
                const overdue = t.due && t.status !== "done" && t.due < today;
                return (
                  <article key={t.id} className={`task ${drag === t.id ? "dragging" : ""} ${over?.before === t.id ? "drop-before" : ""}`} draggable
                    onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(t.id)); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { if (drag == null || drag === t.id) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const i = cards.findIndex((c) => c.id === t.id); setOver({ col, before: e.clientY < r.top + r.height / 2 ? t.id : cards[i + 1]?.id ?? null }); }}>
                    <button type="button" className="task-open" onClick={() => setOpen(t)} aria-label={`Open task: ${t.title}`}>
                      <span className={`task-title ${t.status === "done" ? "done" : ""}`}>{t.status === "done" && "✓ "}{t.title}</span>
                      <span className="task-meta">
                        {t.assignee ? <span className="task-who"><Face u={t.assignee} size={20} /><span>{t.assignee.name.split(" ")[0]}</span><RoleTag role={t.assignee.gone ? "Former member" : t.assignee.role} /></span>
                          : <span className="small muted">Unassigned</span>}
                        {t.due && <span className={`task-due ${overdue ? "late" : ""}`}>{overdue ? "Overdue · " : ""}{dueText(t.due)}</span>}
                      </span>
                    </button>
                  </article>
                );
              })}
              {adding === col ? (
                <form className="task-new" onSubmit={(e) => { e.preventDefault(); add(col); }}>
                  <input autoFocus type="text" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} onBlur={() => add(col)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setDraft(""); setAdding(null); } }} placeholder="Task name, then Enter" aria-label={`New task in ${label}`} />
                </form>
              ) : (
                <button type="button" className="task-add" onClick={() => { setAdding(col); setDraft(""); }}>+ New</button>
              )}
            </section>
          );
        })}
      </div>

      {open && (
        <div className="task-sheet-wrap" role="dialog" aria-modal="true" aria-label="Task" onClick={() => setOpen(null)} onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
          <div className="task-sheet card stack" onClick={(e) => e.stopPropagation()}>
            <textarea className="task-sheet-title" defaultValue={open.title} maxLength={200} rows={2} aria-label="Task name" autoFocus
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== open.title) edit(open.id, { title: v }); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
            <label className="field"><span>Status</span>
              <select value={open.status} onChange={(e) => edit(open.id, { status: e.target.value })}>{COLUMNS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
            </label>
            <label className="field"><span>Who is on it</span>
              <select value={open.assignee?.id ?? ""} onChange={(e) => edit(open.id, { assignee: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Nobody yet</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.lead ? " · Lead" : ""} · {u.role}</option>)}
              </select>
            </label>
            <label className="field"><span>Due</span>
              <span className="row nowrap">
                <input type="date" value={open.due ?? ""} onChange={(e) => edit(open.id, { due: e.target.value || null })} />
                {open.due && <button type="button" className="linkbtn small" onClick={() => edit(open.id, { due: null })}>Clear</button>}
              </span>
            </label>
            <div className="row between">
              <button type="button" className="btn danger sm" onClick={() => del(open.id)}>Delete task</button>
              <button type="button" className="btn sm" onClick={() => setOpen(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
