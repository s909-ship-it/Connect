"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { markNoteImportant, newNote, openNote, saveNote, teamNotes, trashNote, type Note, type NoteHead } from "../../team-actions";

/* The team's notes, made to feel like Notion: pages with an icon and a title, built from blocks. Type "/" for the
   block menu, or markdown shortcuts ("# ", "- ", "1. ", "[] ", "> ", "```", "---"). Enter and Backspace move between
   blocks the way Notion does. Pages save by themselves; if a teammate saved the same page meanwhile, nothing is
   overwritten and the person chooses which version to keep. */

type BlockType = "p" | "h1" | "h2" | "h3" | "todo" | "bullet" | "number" | "quote" | "callout" | "code" | "divider";
type Block = { id: string; type: BlockType; text: string; checked?: boolean };

const TYPES: { type: BlockType; label: string; hint: string; icon: string; keys: string }[] = [
  { type: "p", label: "Text", hint: "Plain writing", icon: "Aa", keys: "text paragraph plain" },
  { type: "h1", label: "Heading 1", hint: "Big section heading", icon: "H1", keys: "heading title h1 big" },
  { type: "h2", label: "Heading 2", hint: "Medium section heading", icon: "H2", keys: "heading h2 subtitle" },
  { type: "h3", label: "Heading 3", hint: "Small section heading", icon: "H3", keys: "heading h3 small" },
  { type: "todo", label: "To-do list", hint: "Track tasks with a checkbox", icon: "☑", keys: "todo to-do checkbox task check" },
  { type: "bullet", label: "Bulleted list", hint: "A simple list", icon: "•", keys: "bullet bulleted list ul" },
  { type: "number", label: "Numbered list", hint: "A list with numbers", icon: "1.", keys: "number numbered ordered ol list" },
  { type: "quote", label: "Quote", hint: "Capture a quote", icon: "❝", keys: "quote blockquote" },
  { type: "callout", label: "Callout", hint: "Make something stand out", icon: "💡", keys: "callout note info tip warning" },
  { type: "code", label: "Code", hint: "A code snippet", icon: "</>", keys: "code snippet pre" },
  { type: "divider", label: "Divider", hint: "Separate sections", icon: "—", keys: "divider line hr separator" },
];
const ICONS = ["📄", "📝", "🎯", "🚀", "🗓️", "🔁", "💡", "📌", "✅", "🧪", "🛠️", "🎨", "📊", "📦", "🔒", "🌱", "🔥", "⭐", "🧠", "📣", "🧩", "🔧", "🗂️", "📚", "🏁", "🎉", "🐛", "⚙️", "🤝", "🧭"];
const TEMPLATES: [id: string, label: string, icon: string, about: string][] = [
  ["blank", "Empty page", "📄", "Start from nothing"],
  ["meeting", "Meeting notes", "🗓️", "Agenda, notes and action items"],
  ["brief", "Project brief", "🎯", "What, for whom, and how you will know"],
  ["retro", "Retro", "🔁", "What went well, what to change"],
  ["launch", "Ready for review", "🚀", "The checklist before you send it for review"],
];
const PLACEHOLDER: Record<BlockType, string> = {
  p: "Type '/' for commands", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", todo: "To-do", bullet: "List",
  number: "List", quote: "Quote", callout: "Something to highlight", code: "Code", divider: "",
};
const PREFIX: [RegExp, BlockType][] = [[/^###\s/, "h3"], [/^##\s/, "h2"], [/^#\s/, "h1"], [/^[-*]\s/, "bullet"], [/^1[.)]\s/, "number"], [/^\[ ?\]\s/, "todo"], [/^>\s/, "quote"]];
const LISTS: BlockType[] = ["bullet", "number", "todo"];
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
function ago(t: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
/* A pasted line, with its markdown prefix turned into a block type. */
function fromLine(line: string): Block {
  for (const [re, type] of PREFIX) { const m = line.match(re); if (m) return { id: rid(), type, text: line.slice(m[0].length), ...(type === "todo" ? { checked: false } : {}) }; }
  if (/^-{3,}$/.test(line.trim())) return { id: rid(), type: "divider", text: "" };
  return { id: rid(), type: "p", text: line };
}

/* A textarea that grows with what is in it, so a block looks like plain text on the page. */
function Grow({ value, inputRef, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef: (el: HTMLTextAreaElement | null) => void }) {
  const el = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { const t = el.current; if (!t) return; t.style.height = "0px"; t.style.height = `${t.scrollHeight}px`; }, [value]);
  return <textarea {...rest} rows={1} value={value} ref={(t) => { el.current = t; inputRef(t); }} />;
}

function NoteEditor({ project, initial, onMeta, onGone }: { project: number; initial: Note; onMeta: (m: Partial<NoteHead> & { id: number }) => void; onGone: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [icon, setIcon] = useState(initial.icon);
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks as Block[]);
  const [important, setImportant] = useState(initial.important);
  const [status, setStatus] = useState("");
  const [meta, setMeta] = useState({ by: initial.updated_by, at: initial.updated_at });
  const [conflict, setConflict] = useState<Note | null>(null);
  const [iconMenu, setIconMenu] = useState(false);
  const [slash, setSlash] = useState<{ id: string; q: string; sel: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const version = useRef(initial.version), edits = useRef(0), saved = useRef(0), lastEdit = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = useRef<{ id: string; at: number | "end" } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const live = useRef({ title, icon, blocks }); live.current = { title, icon, blocks };

  const save = useCallback(async (force = false) => {
    clearTimeout(timer.current);
    const n = edits.current, s = live.current;
    setStatus("Saving…");
    const r = await saveNote(project, initial.id, { title: s.title, icon: s.icon, blocks: s.blocks }, version.current, force);
    if ("version" in r) {
      version.current = r.version; saved.current = n; setStatus("Saved");
      setMeta({ by: "you", at: Math.floor(Date.now() / 1000) });
      onMeta({ id: initial.id, title: s.title, icon: s.icon, updated_at: Math.floor(Date.now() / 1000), updated_by: "you" });
      if (force) setConflict(null);
    } else if ("conflict" in r) { setConflict(r.conflict); setStatus(""); }
    else { setStatus(r.error); if (/deleted/i.test(r.error)) onGone(); }
  }, [project, initial.id, onMeta, onGone]);

  const changed = () => {
    edits.current++; lastEdit.current = Date.now(); setStatus("Editing…");
    clearTimeout(timer.current);
    if (!conflict) timer.current = setTimeout(() => void save(), 800);
  };
  // Leaving the page saves what is not saved yet.
  useEffect(() => () => { if (edits.current !== saved.current && !conflict) void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A teammate's edits show up while you are not typing.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || edits.current !== saved.current || Date.now() - lastEdit.current < 3000 || conflict) return;
      const r = await openNote(project, initial.id);
      if ("error" in r) { onGone(); return; }
      if (r.note.version > version.current) {
        version.current = r.note.version;
        setTitle(r.note.title); setIcon(r.note.icon); setBlocks(r.note.blocks as Block[]); setImportant(r.note.important);
        setMeta({ by: r.note.updated_by, at: r.note.updated_at });
        setStatus(`Updated by ${r.note.updated_by ?? "a teammate"}`);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [project, initial.id, conflict, onGone]);

  useLayoutEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    const el = refs.current.get(f.id);
    if (!el) return;
    focusNext.current = null;
    el.focus();
    const at = f.at === "end" ? el.value.length : Math.min(f.at, el.value.length);
    el.setSelectionRange(at, at);
  });

  const set = (fn: (bs: Block[]) => Block[]) => { setBlocks(fn); changed(); };
  const update = (id: string, patch: Partial<Block>) => set((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const insertAfter = (id: string, nb: Block) => set((bs) => { const i = bs.findIndex((b) => b.id === id); const n = [...bs]; n.splice(i + 1, 0, nb); return n; });
  const remove = (id: string) => set((bs) => (bs.length > 1 ? bs.filter((b) => b.id !== id) : [{ id: rid(), type: "p", text: "" }]));
  const move = (id: string, to: string, after: boolean) => set((bs) => {
    const from = bs.find((b) => b.id === id); if (!from || id === to) return bs;
    const rest = bs.filter((b) => b.id !== id), i = rest.findIndex((b) => b.id === to);
    rest.splice(after ? i + 1 : i, 0, from); return rest;
  });
  const shift = (id: string, d: -1 | 1) => set((bs) => { const i = bs.findIndex((b) => b.id === id), j = i + d; if (j < 0 || j >= bs.length) return bs; const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const turnInto = (b: Block, type: BlockType, text = b.text) => {
    setSlash(null); setMenuFor(null);
    if (type === "divider") {
      const next: Block = { id: rid(), type: "p", text: "" };
      set((bs) => { const i = bs.findIndex((x) => x.id === b.id); const n = [...bs]; n.splice(i, 1, { id: b.id, type: "divider", text: "" }, next); return n; });
      focusNext.current = { id: next.id, at: 0 };
      return;
    }
    update(b.id, { type, text, ...(type === "todo" ? { checked: false } : {}) });
    focusNext.current = { id: b.id, at: "end" };
  };

  const onText = (b: Block, value: string) => {
    if (b.type === "p") {
      if (value === "```") return turnInto(b, "code", "");
      if (value === "---") return turnInto(b, "divider", "");
      for (const [re, type] of PREFIX) {
        const m = value.match(re);
        if (m && !b.text.match(re)) { update(b.id, { type, text: value.slice(m[0].length), ...(type === "todo" ? { checked: false } : {}) }); focusNext.current = { id: b.id, at: 0 }; return; }
      }
    }
    if (value.startsWith("/") && b.type !== "code") setSlash({ id: b.id, q: value.slice(1).toLowerCase(), sel: 0 });
    else if (slash?.id === b.id) setSlash(null);
    update(b.id, { text: value });
  };
  const options = (q: string) => TYPES.filter((t) => !q || t.label.toLowerCase().includes(q) || t.keys.includes(q));

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, i: number) => {
    const el = e.currentTarget;
    if (slash && slash.id === b.id) {
      const list = options(slash.q);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSlash({ ...slash, sel: (slash.sel + (e.key === "ArrowDown" ? 1 : list.length - 1)) % Math.max(1, list.length) }); return; }
      if (e.key === "Enter" && list[slash.sel]) { e.preventDefault(); turnInto(b, list[slash.sel].type, ""); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (b.type === "code" && !(e.metaKey || e.ctrlKey)) return; // a new line inside the code; Ctrl or Cmd + Enter leaves it
      e.preventDefault();
      if (!b.text && (LISTS.includes(b.type) || b.type === "quote" || b.type === "callout")) { update(b.id, { type: "p" }); return; }
      const pos = el.selectionStart, before = b.text.slice(0, pos), after = b.text.slice(el.selectionEnd);
      const keep = LISTS.includes(b.type);
      const nb: Block = { id: rid(), type: keep ? b.type : "p", text: after, ...(b.type === "todo" ? { checked: false } : {}) };
      set((bs) => { const j = bs.findIndex((x) => x.id === b.id); const n = bs.map((x) => (x.id === b.id ? { ...x, text: before } : x)); n.splice(j + 1, 0, nb); return n; });
      focusNext.current = { id: nb.id, at: 0 };
      return;
    }
    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== "p") { e.preventDefault(); update(b.id, { type: "p" }); return; }
      if (i === 0) return;
      e.preventDefault();
      const prev = blocks[i - 1];
      if (prev.type === "divider") { set((bs) => bs.filter((x) => x.id !== prev.id)); focusNext.current = { id: b.id, at: 0 }; return; }
      const at = prev.text.length;
      set((bs) => bs.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)));
      focusNext.current = { id: prev.id, at };
      return;
    }
    const step = (d: -1 | 1) => { for (let j = i + d; j >= 0 && j < blocks.length; j += d) if (blocks[j].type !== "divider") return blocks[j]; return null; };
    if (e.key === "ArrowUp" && el.selectionStart === 0 && el.selectionEnd === 0) { const t = step(-1); if (t) { e.preventDefault(); focusNext.current = { id: t.id, at: "end" }; setBlocks((x) => [...x]); } else if (i === 0) { e.preventDefault(); titleRef.current?.focus(); } }
    if (e.key === "ArrowDown" && el.selectionStart === el.value.length) { const t = step(1); if (t) { e.preventDefault(); focusNext.current = { id: t.id, at: 0 }; setBlocks((x) => [...x]); } }
  };
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, b: Block) => {
    const t = e.clipboardData.getData("text/plain");
    if (b.type === "code" || !t.includes("\n")) return;
    e.preventDefault();
    const el = e.currentTarget, lines = t.replace(/\r\n?/g, "\n").split("\n");
    const head = b.text.slice(0, el.selectionStart) + lines[0], tail = b.text.slice(el.selectionEnd);
    const more = lines.slice(1).map(fromLine);
    if (more.length) more[more.length - 1].text += tail;
    set((bs) => { const j = bs.findIndex((x) => x.id === b.id); const n = bs.map((x) => (x.id === b.id ? { ...x, text: head + (more.length ? "" : tail) } : x)); n.splice(j + 1, 0, ...more); return n; });
    const last = more[more.length - 1];
    if (last) focusNext.current = { id: last.id, at: last.text.length - tail.length };
  };

  const setImportantOn = async (on: boolean) => { setImportant(on); const r = await markNoteImportant(project, initial.id, on); if ("error" in r) setImportant(!on); else onMeta({ id: initial.id, important: on }); };
  const del = async () => {
    if (!confirm("Move this page to the trash? You can restore it for 30 days.")) return;
    clearTimeout(timer.current); saved.current = edits.current;
    await trashNote(project, initial.id, true);
    onGone();
  };
  const useTheirs = () => {
    if (!conflict) return;
    version.current = conflict.version; saved.current = edits.current;
    setTitle(conflict.title); setIcon(conflict.icon); setBlocks(conflict.blocks as Block[]); setMeta({ by: conflict.updated_by, at: conflict.updated_at });
    setConflict(null); setStatus("Showing their version");
  };

  let n = 0;
  return (
    <article className="note-page" onClick={() => { setMenuFor(null); }}>
      <div className="note-top">
        <Link href={`/projects/${project}/notes`} className="note-back" aria-label="All pages">← Pages</Link>
        <span className="small muted note-meta" role="status">{status && status !== "Saved" ? status : meta.at ? `Edited ${meta.by ? `by ${meta.by} ` : ""}${ago(meta.at)}` : ""}</span>
        <button type="button" className={`note-star ${important ? "on" : ""}`} onClick={() => void setImportantOn(!important)} aria-pressed={important} title={important ? "Important: shown first" : "Mark as important"}>
          {important ? "★ Important" : "☆ Mark important"}
        </button>
        <button type="button" className="linkbtn small note-del" onClick={() => void del()}>Delete</button>
      </div>
      {conflict && (
        <div className="note-conflict" role="alert">
          <span><b>{conflict.updated_by ?? "A teammate"}</b> changed this page while you were editing it. Nothing has been overwritten.</span>
          <span className="row"><button type="button" className="btn sm" onClick={() => void save(true)}>Keep mine</button><button type="button" className="btn sm ghost" onClick={useTheirs}>Use theirs</button></span>
        </div>
      )}
      <div className="note-head">
        <span className="note-icon-wrap">
          <button type="button" className={`note-icon ${icon ? "" : "empty"}`} onClick={(e) => { e.stopPropagation(); setIconMenu(!iconMenu); }} aria-label={icon ? "Change icon" : "Add icon"}>{icon || "☺ Add icon"}</button>
          {iconMenu && (
            <span className="icon-menu" role="menu" onClick={(e) => e.stopPropagation()}>
              {ICONS.map((x) => <button key={x} type="button" role="menuitem" onClick={() => { setIcon(x); setIconMenu(false); changed(); }}>{x}</button>)}
              {icon && <button type="button" className="icon-none" onClick={() => { setIcon(""); setIconMenu(false); changed(); }}>Remove</button>}
            </span>
          )}
        </span>
        <Grow inputRef={(t) => { titleRef.current = t; }} className="note-title" value={title} placeholder="Untitled" aria-label="Page title" maxLength={120}
          onChange={(e) => { setTitle(e.target.value.replace(/\n/g, "")); changed(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); const f = blocks.find((b) => b.type !== "divider"); if (f) { focusNext.current = { id: f.id, at: 0 }; setBlocks((x) => [...x]); } } }} />
      </div>

      <div className="note-blocks">
        {blocks.map((b, i) => {
          n = b.type === "number" ? n + 1 : 0;
          const num = n;
          const drop = dropAt?.id === b.id ? (dropAt.after ? "drop-after" : "drop-before") : "";
          return (
            <div key={b.id} className={`blk blk-${b.type} ${b.checked ? "done" : ""} ${drop} ${drag === b.id ? "dragging" : ""}`}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt({ id: b.id, after: e.clientY > r.top + r.height / 2 }); }}
              onDrop={(e) => { e.preventDefault(); if (drag && dropAt) move(drag, dropAt.id, dropAt.after); setDrag(null); setDropAt(null); }}>
              <span className="blk-tools">
                <button type="button" className="blk-handle" draggable onDragStart={(e) => { setDrag(b.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); }}
                  onDragEnd={() => { setDrag(null); setDropAt(null); }} onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === b.id ? null : b.id); }}
                  aria-label="Block menu: drag to move, click for options" title="Drag to move · click for options">⋮⋮</button>
              </span>
              {menuFor === b.id && (
                <div className="blk-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                  <span className="label">Turn into</span>
                  <div className="blk-menu-types">{TYPES.filter((t) => t.type !== "divider").map((t) => <button key={t.type} type="button" role="menuitem" className={t.type === b.type ? "on" : ""} onClick={() => turnInto(b, t.type)}><i>{t.icon}</i>{t.label}</button>)}</div>
                  <button type="button" role="menuitem" onClick={() => { insertAfter(b.id, { ...b, id: rid() }); setMenuFor(null); }}>Duplicate</button>
                  <button type="button" role="menuitem" onClick={() => { shift(b.id, -1); setMenuFor(null); }} disabled={i === 0}>Move up</button>
                  <button type="button" role="menuitem" onClick={() => { shift(b.id, 1); setMenuFor(null); }} disabled={i === blocks.length - 1}>Move down</button>
                  <button type="button" role="menuitem" className="danger" onClick={() => { remove(b.id); setMenuFor(null); }}>Delete</button>
                </div>
              )}
              {b.type === "divider" ? (
                <button type="button" className="blk-hr" aria-label="Divider. Press Delete to remove it" onKeyDown={(e) => { if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); remove(b.id); } }}><hr /></button>
              ) : (
                <>
                  {b.type === "todo" && <input type="checkbox" className="blk-check" checked={!!b.checked} onChange={(e) => update(b.id, { checked: e.target.checked })} aria-label={b.text ? `Done: ${b.text}` : "Done"} />}
                  {b.type === "bullet" && <span className="blk-mark" aria-hidden="true">•</span>}
                  {b.type === "number" && <span className="blk-mark num" aria-hidden="true">{num}.</span>}
                  {b.type === "callout" && <span className="blk-mark" aria-hidden="true">💡</span>}
                  <Grow inputRef={(t) => { if (t) refs.current.set(b.id, t); else refs.current.delete(b.id); }}
                    className="blk-text" value={b.text} placeholder={PLACEHOLDER[b.type]} aria-label={TYPES.find((t) => t.type === b.type)?.label}
                    spellCheck={b.type !== "code"}
                    onChange={(e) => onText(b, e.target.value)} onKeyDown={(e) => onKey(e, b, i)} onPaste={(e) => onPaste(e, b)}
                    onBlur={() => { if (slash?.id === b.id) setTimeout(() => setSlash((s) => (s?.id === b.id ? null : s)), 150); }} />
                </>
              )}
              {slash?.id === b.id && (
                <div className="slash-menu" role="listbox" aria-label="Turn this block into">
                  <span className="label">Blocks</span>
                  {options(slash.q).length === 0 && <span className="small muted slash-none">No match</span>}
                  {options(slash.q).map((t, k) => (
                    <button key={t.type} type="button" role="option" aria-selected={k === slash.sel} className={k === slash.sel ? "on" : ""}
                      onMouseDown={(e) => { e.preventDefault(); turnInto(b, t.type, ""); }}>
                      <i>{t.icon}</i><span><b>{t.label}</b><span className="small muted">{t.hint}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="note-add" onClick={() => { const last = blocks[blocks.length - 1]; if (last && last.type === "p" && !last.text) { focusNext.current = { id: last.id, at: 0 }; setBlocks((x) => [...x]); return; } const nb: Block = { id: rid(), type: "p", text: "" }; set((bs) => [...bs, nb]); focusNext.current = { id: nb.id, at: 0 }; }}>
          + Click to add a block, or type “/” in any line
        </button>
      </div>
    </article>
  );
}

export function TeamNotes({ project, notes: first, trash: firstTrash, note }: { project: number; notes: NoteHead[]; trash: NoteHead[]; note: Note | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(first);
  const [trash, setTrash] = useState(firstTrash);
  const [making, setMaking] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setNotes(first); setTrash(firstTrash); }, [first, firstTrash]);

  // Pages teammates add, rename or delete show up within a few seconds.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await teamNotes(project);
      if (!("error" in r)) { setNotes(r.notes); setTrash(r.trash); }
    }, 8000);
    return () => clearInterval(t);
  }, [project]);

  const create = async (template: string) => {
    setMaking(false); setErr("");
    const r = await newNote(project, template);
    if ("error" in r) { setErr(r.error); return; }
    router.push(`/projects/${project}/notes/${r.id}`);
    router.refresh();
  };
  const restore = async (id: number) => {
    await trashNote(project, id, false);
    const r = await teamNotes(project);
    if (!("error" in r)) { setNotes(r.notes); setTrash(r.trash); }
  };
  const onMeta = useCallback((m: Partial<NoteHead> & { id: number }) => setNotes((ns) => {
    const next = ns.map((x) => (x.id === m.id ? { ...x, ...m } : x));
    return [...next].sort((a, b) => Number(b.important) - Number(a.important) || b.updated_at - a.updated_at);
  }), []);
  const onGone = useCallback(() => { router.push(`/projects/${project}/notes`); router.refresh(); }, [router, project]);

  const important = notes.filter((x) => x.important), rest = notes.filter((x) => !x.important);
  const link = (x: NoteHead) => (
    <Link key={x.id} href={`/projects/${project}/notes/${x.id}`} className="note-link" aria-current={note?.id === x.id ? "page" : undefined}>
      <span className="note-link-icon" aria-hidden="true">{x.icon || "📄"}</span><span className="ellipsis">{x.title || "Untitled"}</span>
    </Link>
  );
  const templates = (
    <div className="tpl-menu" role="menu">
      {TEMPLATES.map(([id, label, ic, about]) => (
        <button key={id} type="button" role="menuitem" onClick={() => void create(id)}><i aria-hidden="true">{ic}</i><span><b>{label}</b><span className="small muted">{about}</span></span></button>
      ))}
    </div>
  );
  return (
    <div className={`notes ${note ? "has-note" : ""}`}>
      <aside className="notes-side" aria-label="Pages">
        <div className="notes-side-head">
          <span className="label">Pages</span>
          <button type="button" className="btn sm" onClick={() => setMaking(!making)} aria-expanded={making}>+ New</button>
        </div>
        {making && templates}
        {err && <span className="small neg" role="alert">{err}</span>}
        {important.length > 0 && <span className="notes-group">★ Important</span>}
        {important.map(link)}
        {rest.length > 0 && important.length > 0 && <span className="notes-group">All pages</span>}
        {rest.map(link)}
        {notes.length === 0 && <span className="small muted notes-empty">No pages yet. Start one with + New.</span>}
        <button type="button" className="linkbtn small notes-trash" onClick={() => setShowTrash(!showTrash)} aria-expanded={showTrash}>Trash ({trash.length})</button>
        {showTrash && (trash.length === 0 ? <span className="small muted">Nothing in the trash.</span> : trash.map((x) => (
          <span key={x.id} className="note-link trashed"><span className="note-link-icon" aria-hidden="true">{x.icon || "📄"}</span><span className="ellipsis">{x.title || "Untitled"}</span>
            <button type="button" className="linkbtn small" onClick={() => void restore(x.id)}>Restore</button></span>
        )))}
      </aside>
      <div className="notes-main">
        {note ? <NoteEditor key={note.id} project={project} initial={note} onMeta={onMeta} onGone={onGone} /> : (
          <div className="notes-start">
            <h2>Team notes</h2>
            <p className="muted">Pages the whole team can write in: plans, meeting notes, decisions, checklists. Star the important ones so everyone sees them first.</p>
            <div className="tpl-grid">
              {TEMPLATES.map(([id, label, ic, about]) => (
                <button key={id} type="button" className="tpl-card" onClick={() => void create(id)}>
                  <i aria-hidden="true">{ic}</i><b>{label}</b><span className="small muted">{about}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
