import { formatDate } from "../format.js";

// Financial-distress panel: SEC EDGAR signals (going-concern, late filings,
// bankruptcy 8-Ks) for US registrants. Resilient to empty flags / missing CIK.
export default function Distress({ distress }) {
  const flags = distress?.flags ?? [];
  const filings = distress?.filings ?? [];
  const cik = distress?.cik;

  if (!cik) {
    return (
      <p className="muted panel-empty">
        No US SEC registration found — financial-distress signals are US-only.
      </p>
    );
  }

  return (
    <div className="distress-wrap">
      {flags.length === 0 ? (
        <p className="muted panel-empty">
          No distress signals found in SEC filings (no going-concern, late-filing, or bankruptcy flags).
        </p>
      ) : (
        <ul className="flag-list">
          {flags.map((f, i) => (
            <li key={`${f.type}-${i}`} className="flag">
              <span className="flag-label">⚠ {f.label}</span>
              <span className="muted small flag-detail">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {filings.length > 0 && (
        <div className="filings">
          <p className="muted small">Related filings:</p>
          <ul className="filing-list">
            {filings.map((f, i) => (
              <li key={`${f.ref}-${i}`} className="muted small">
                <span className="filing-form">{f.form || "filing"}</span>
                {f.filedAt && ` · ${formatDate(f.filedAt)}`}
                {f.ref && ` · ${f.ref}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
