import { useState, useEffect, useCallback } from "react";
import { nextPollAction } from "../poll.js";
import { IdentifierBadges, SourceChips, StatusBadge } from "./Badges.jsx";
import OwnershipGraph from "./OwnershipGraph.jsx";
import AdverseMedia from "./AdverseMedia.jsx";
import Litigation from "./Litigation.jsx";
import Distress from "./Distress.jsx";

const POLL_MS = 1500;
const MAX_POLL_MS = 3 * 60 * 1000; // stop polling a stuck build after ~3 min
const MAX_FAILURES = 5; // consecutive poll failures before giving up mid-build

// Dossier view: fetches GET /api/dossiers/:id and polls every ~1500ms while
// status === "building". Composes the header and the two independent panels.
export default function DossierView({ dossierId, onBack }) {
  const [dossier, setDossier] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDossier = useCallback(
    async (signal) => {
      const res = await fetch(`/api/dossiers/${dossierId}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [dossierId]
  );

  useEffect(() => {
    let active = true;
    let timer = null;
    let failures = 0;
    const controller = new AbortController();
    const deadline = Date.now() + MAX_POLL_MS;

    setDossier(null);
    setError(null);
    setLoading(true);

    async function tick() {
      let outcome, status, message;
      try {
        const json = await fetchDossier(controller.signal);
        if (!active) return;
        failures = 0;
        outcome = "ok";
        status = json.status;
        setDossier(json);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!active || err.name === "AbortError") return;
        failures += 1;
        outcome = "error";
        message = err.message;
        setLoading(false);
      }

      const action = nextPollAction({
        outcome,
        status,
        now: Date.now(),
        deadline,
        failures,
        maxFailures: MAX_FAILURES,
        pollMs: POLL_MS,
      });
      if (action.type === "schedule") {
        timer = setTimeout(tick, action.delay);
      } else if (action.type === "timeout") {
        setError("This is taking longer than expected — refresh to keep waiting.");
      } else if (action.type === "give-up") {
        setError(message || "Couldn't load this dossier.");
      }
      // action.type === "stop": terminal status reached, nothing scheduled.
    }

    tick();

    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [fetchDossier]);

  // Initial load (before we have any dossier object yet).
  if (loading && !dossier) {
    return (
      <DossierShell onBack={onBack}>
        <div className="card building-state">
          <Spinner />
          <p className="muted">Loading dossier…</p>
        </div>
      </DossierShell>
    );
  }

  if (error && !dossier) {
    return (
      <DossierShell onBack={onBack}>
        <div className="card">
          <p className="error" role="alert">
            Couldn't load this dossier: {error}
          </p>
        </div>
      </DossierShell>
    );
  }

  if (!dossier) return null;

  const isBuilding = dossier.status === "building";
  const isError = dossier.status === "error";
  const isPartial = dossier.status === "partial";

  const entity = dossier.rootEntity;
  const displayName = entity?.name || dossier.query || "Unknown entity";

  return (
    <DossierShell onBack={onBack}>
      <header className="dossier-head card">
        <div className="dossier-title-row">
          <h1 className="dossier-name">{displayName}</h1>
          <StatusBadge status={dossier.status} />
        </div>

        <div className="dossier-id-row">
          <IdentifierBadges
            lei={entity?.lei}
            companyNumber={entity?.companyNumber}
            cik={entity?.cik}
          />
          {entity?.jurisdiction && (
            <span className="chip chip-jur">{entity.jurisdiction}</span>
          )}
          {entity?.entityType && (
            <span className="muted small">{entity.entityType}</span>
          )}
        </div>

        <CoverageLine
          sources={dossier.sources}
          coverage={dossier.matchCoveragePct}
        />

        <SourceChips sources={dossier.sources} />

        {isBuilding && !error && (
          <div className="building-inline" role="status">
            <Spinner small />
            <span className="muted">
              Building dossier — pulling sources…
            </span>
          </div>
        )}
        {isBuilding && error && (
          <p className="error notice" role="alert">
            {error}
          </p>
        )}
        {isPartial && (
          <p className="muted small notice notice-warn">
            Some sources were unavailable; this dossier may be incomplete.
          </p>
        )}
        {isError && (
          <p className="error notice" role="alert">
            {dossier.error || "This dossier could not be completed."}
          </p>
        )}
      </header>

      <div className="panels">
        <section className="panel card">
          <h2 className="panel-title">Ownership structure</h2>
          {isBuilding && !hasOwnership(dossier) ? (
            <PanelBuilding label="Resolving ownership…" />
          ) : (
            <OwnershipGraph ownership={dossier.ownership} />
          )}
        </section>

        <section className="panel card">
          <h2 className="panel-title">Adverse media</h2>
          {isBuilding && !hasAdverse(dossier) ? (
            <PanelBuilding label="Scanning coverage…" />
          ) : (
            <AdverseMedia
              adverse={dossier.adverse}
              falseFlagEstimate={dossier.falseFlagEstimate}
            />
          )}
        </section>

        {hasLitigation(dossier) && (
          <section className="panel card panel-full">
            <h2 className="panel-title">Litigation &amp; bankruptcy (US)</h2>
            <Litigation litigation={dossier.litigation} />
          </section>
        )}

        {hasDistress(dossier) && (
          <section className="panel card panel-full">
            <h2 className="panel-title">Financial distress (SEC)</h2>
            <Distress distress={dossier.distress} />
          </section>
        )}

        {/* While building, say the extra sources are still being checked so their
            current absence isn't read as a clean "nothing found". */}
        {isBuilding && !hasLitigation(dossier) && !hasDistress(dossier) && (
          <p className="muted small notice panel-full" role="status">
            Still checking litigation and financial-distress sources…
          </p>
        )}
      </div>
    </DossierShell>
  );
}

function hasLitigation(d) {
  return (d.litigation?.cases?.length ?? 0) > 0;
}

function hasDistress(d) {
  return Boolean(d.distress?.cik);
}

function hasOwnership(d) {
  return (d.ownership?.nodes?.length ?? 0) > 0;
}

function hasAdverse(d) {
  return (d.adverse?.articles?.length ?? 0) > 0;
}

function CoverageLine({ sources, coverage }) {
  const n = sources?.length ?? 0;
  const hasCoverage = typeof coverage === "number";
  if (n === 0 && !hasCoverage) return null;
  return (
    <p className="muted small coverage-line">
      Matched across {n} {n === 1 ? "source" : "sources"}
      {hasCoverage && ` · coverage ${Math.round(coverage)}%`}
    </p>
  );
}

function DossierShell({ children, onBack }) {
  return (
    <main className="container container-wide">
      <button className="btn btn-back" type="button" onClick={onBack}>
        ← New search
      </button>
      {children}
    </main>
  );
}

function PanelBuilding({ label }) {
  return (
    <div className="panel-building">
      <Spinner small />
      <p className="muted">{label}</p>
    </div>
  );
}

function Spinner({ small }) {
  return <span className={`spinner ${small ? "spinner-sm" : ""}`} aria-hidden="true" />;
}
