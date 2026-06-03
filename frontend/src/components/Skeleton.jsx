// Shimmer placeholders that mirror real layout, so loading feels like the page filling in
// rather than a blank spinner. All driven by the .skeleton CSS (reduced-motion aware).

export function SkeletonLine({ width = "100%", height }) {
  return <div className="skeleton skeleton-line" style={{ width, height }} />;
}

// A panel's worth of stacked lines (adverse media, litigation, etc. while loading).
export function PanelSkeleton({ rows = 3 }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton-row">
        <SkeletonLine width="6rem" />
        <SkeletonLine width="5rem" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-block" />
      ))}
    </div>
  );
}

// Full-page placeholder for the very first dossier load (before any data has arrived).
export function DossierSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="card">
        <div className="skeleton-stack">
          <SkeletonLine width="14rem" height="1.4rem" />
          <div className="skeleton-row">
            <div className="skeleton skeleton-chip" />
            <div className="skeleton skeleton-chip" />
            <div className="skeleton skeleton-chip" />
          </div>
          <SkeletonLine width="10rem" />
        </div>
      </div>
      <div className="panels">
        <section className="panel card">
          <SkeletonLine width="9rem" height="1rem" />
          <div className="skeleton skeleton-graph" style={{ marginTop: "var(--space-3)" }} />
        </section>
        <section className="panel card">
          <SkeletonLine width="9rem" height="1rem" />
          <div style={{ marginTop: "var(--space-3)" }}>
            <PanelSkeleton rows={4} />
          </div>
        </section>
      </div>
    </div>
  );
}
