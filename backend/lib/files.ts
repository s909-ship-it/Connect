import fs from "fs";
import path from "path";
import crypto from "crypto";

/* Chat attachments. Stored on disk next to the database (so the same volume keeps both), under random names.
   A file is accepted by what its bytes are, never by its name or the type the browser claims. */

export const LIMITS = {
  imageBytes: 8 * 1024 * 1024,
  fileBytes: 10 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024,
  voiceBytes: 6 * 1024 * 1024,
  perHour: 30,
  bytesPerDay: 100 * 1024 * 1024,
  atOnce: 4,
};

export type Kind = "image" | "file" | "video" | "voice";
export type Checked = { kind: Kind; mime: string; ext: string };

const dbFile = () => process.env.DATABASE_PATH || path.join(process.cwd(), "data", "connect.db");
export const uploadDir = () => path.join(path.dirname(dbFile()), "uploads");

const starts = (b: Buffer, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Buffer, s: string, at = 0) => b.subarray(at, at + s.length).toString("latin1") === s;

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const TEXT: Record<string, string> = { txt: "text/plain", md: "text/markdown", csv: "text/csv" };

/* What the file really is, or null if it is not something we accept. SVG and HTML are never accepted:
   both can carry scripts. `voice` marks a recording made in the chat, so a WebM or MP4 container is audio. */
export function sniff(b: Buffer, name: string, voice = false): Checked | null {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? "");
  if (starts(b, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: "png" };
  if (ascii(b, "GIF87a") || ascii(b, "GIF89a")) return { kind: "image", mime: "image/gif", ext: "gif" };
  if (ascii(b, "RIFF") && ascii(b, "WEBP", 8)) return { kind: "image", mime: "image/webp", ext: "webp" };
  // Video and audio. MP4 and MOV start with a size then "ftyp"; WebM with the EBML header; Ogg with "OggS".
  if (ascii(b, "ftyp", 4)) {
    const brand = b.subarray(8, 12).toString("latin1");
    if (voice || brand === "M4A ") return { kind: "voice", mime: "audio/mp4", ext: "m4a" };
    return brand === "qt  " ? { kind: "video", mime: "video/quicktime", ext: "mov" } : { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return voice ? { kind: "voice", mime: "audio/webm", ext: "webm" } : { kind: "video", mime: "video/webm", ext: "webm" };
  if (ascii(b, "OggS")) return { kind: "voice", mime: "audio/ogg", ext: "ogg" };
  if (ascii(b, "%PDF-")) return { kind: "file", mime: "application/pdf", ext: "pdf" };
  // Word, PowerPoint and Excel files are zip archives; the name says which.
  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) && OFFICE[ext]) return { kind: "file", mime: OFFICE[ext], ext };
  if (TEXT[ext] && !b.includes(0) && isUtf8(b)) return { kind: "file", mime: TEXT[ext], ext };
  return null;
}
function isUtf8(b: Buffer) {
  try { new TextDecoder("utf-8", { fatal: true }).decode(b); return true; } catch { return false; }
}

/* A display name that is safe to show and to put in a download header. */
export function cleanName(name: string, ext: string) {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[^\p{L}\p{N} ._()-]+/gu, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
  return `${base}.${ext}`;
}

export function save(b: Buffer): string {
  const key = crypto.randomBytes(18).toString("base64url");
  fs.mkdirSync(uploadDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), key), b, { flag: "wx" });
  return key;
}
export function read(key: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{24}$/.test(key)) return null;
  try { return fs.readFileSync(path.join(uploadDir(), key)); } catch { return null; }
}
export function remove(key: string | null | undefined) {
  if (key && /^[A-Za-z0-9_-]{24}$/.test(key)) fs.rmSync(path.join(uploadDir(), key), { force: true });
}

export const sizeText = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const maxFor = (k: Kind) => (k === "image" ? LIMITS.imageBytes : k === "video" ? LIMITS.videoBytes : k === "voice" ? LIMITS.voiceBytes : LIMITS.fileBytes);
