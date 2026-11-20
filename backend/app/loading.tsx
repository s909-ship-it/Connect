/* Shown while a page's data loads. */
export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 38, width: "45%" }} />
      <div className="skel" style={{ height: 110 }} />
      <div className="skel" style={{ height: 110 }} />
      <div className="skel" style={{ height: 110 }} />
    </div>
  );
}
