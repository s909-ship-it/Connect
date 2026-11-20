/* eslint-disable @next/next/no-img-element */
import type { Avatar as Src } from "@/lib/api";
import { app } from "@/lib/api";
import { initials } from "./cover";

/* A person's picture from Connect (a photo they uploaded, or an anonymous person's pattern), else their initials. */
export function Avatar({ name, src, className = "" }: { name: string; src: Src; className?: string }) {
  if (src) return <img className={`avatar ${className}`} src={app.picture(src)} alt="" loading="lazy" decoding="async" />;
  return <span className={`avatar avatar-initials ${className}`} aria-hidden="true">{initials(name)}</span>;
}
