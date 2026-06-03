// Small shared presentational chips/badges reused by search results and the
// dossier header. Kept dependency-free and resilient to missing fields.

// Identifier badges: LEI / CH (Companies House) number / CIK.
export function IdentifierBadges({ lei, companyNumber, cik }) {
  const ids = [];
  if (lei) ids.push({ label: "LEI", value: lei });
  if (companyNumber) ids.push({ label: "CH", value: companyNumber });
  if (cik) ids.push({ label: "CIK", value: cik });
  if (ids.length === 0) return null;

  return (
    <span className="badge-row">
      {ids.map((id) => (
        <span key={id.label} className="badge badge-id" title={`${id.label}: ${id.value}`}>
          <span className="badge-key">{id.label}</span>
          <span className="badge-val">{id.value}</span>
        </span>
      ))}
    </span>
  );
}

// Source provenance chips (e.g. gleif, companies_house, sec).
export function SourceChips({ sources, prefix = "Sources" }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="source-chips">
      <span className="muted source-label">{prefix}:</span>
      {sources.map((s) => (
        <span key={s} className="chip chip-source">
          {formatSource(s)}
        </span>
      ))}
    </div>
  );
}

// Coloured status pill. Falls back gracefully on unknown statuses.
export function StatusBadge({ status }) {
  if (!status) return null;
  const tone = statusTone(status);
  return <span className={`status-badge status-${tone}`}>{status}</span>;
}

function statusTone(status) {
  const s = String(status).toLowerCase();
  if (["ready", "active", "live"].includes(s)) return "good";
  if (["building", "pending", "partial"].includes(s)) return "warn";
  if (["error", "inactive", "lapsed", "dissolved"].includes(s)) return "bad";
  return "neutral";
}

// Pretty-print known source ids; otherwise upper-case the slug.
function formatSource(s) {
  const map = {
    gleif: "GLEIF",
    companies_house: "Companies House",
    sec: "SEC",
    sec_edgar: "SEC EDGAR",
    gdelt: "GDELT",
    opencorporates: "OpenCorporates",
  };
  return map[s] || String(s).replace(/_/g, " ").toUpperCase();
}
