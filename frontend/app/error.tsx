"use client";

/* Shown when the Connect backend cannot be reached or answers with an error. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="page-hero">
      <h1 className="display">Can’t reach Connect.</h1>
      <p className="lead">The showcase reads live data from the Connect backend, and it did not answer. Check that it is running and that CONNECT_API_URL points at it.</p>
      <button className="btn-line" onClick={reset}>Try again <span aria-hidden="true">→</span></button>
    </section>
  );
}
