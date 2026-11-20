import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card narrow">
      <h1>Nothing here</h1>
      <p className="muted">This page does not exist, or it was removed.</p>
      <div><Link className="btn" href="/">Back to projects</Link></div>
    </div>
  );
}
