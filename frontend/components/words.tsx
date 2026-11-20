import { Fragment } from "react";

/* Splits text into word spans on the server, so the scroll-driven colour fill in components/motion.tsx only
   toggles a class and never changes the DOM React hydrated. */
export function Words({ text }: { text: string }) {
  return <>{text.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) || !w ? <Fragment key={i}>{w}</Fragment> : <span key={i} className="w">{w}</span>))}</>;
}
