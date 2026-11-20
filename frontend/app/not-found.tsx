import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-hero">
      <h1 className="display">Not here.</h1>
      <p className="lead">Only shipped projects, open colleges and verified builders are public. This one is not, or it never existed.</p>
      <Link className="btn-line" href="/">Back to the start <span aria-hidden="true">→</span></Link>
    </section>
  );
}
