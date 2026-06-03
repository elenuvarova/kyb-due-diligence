import { useState, useRef, useEffect } from "react";
import { IdentifierBadges, SourceChips, StatusBadge } from "./Badges.jsx";

// Search screen: a query box that calls GET /api/companies/search and lists
// candidate companies. Clicking a candidate (or submitting a raw query)
// creates a dossier via POST /api/dossiers and hands the new id to the parent.
export default function SearchView({ onCreateDossier }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Abort the in-flight search when a newer one starts (or on unmount) so a slow
  // earlier response can't overwrite the results of a later query.
  const searchAbort = useRef(null);
  useEffect(() => () => searchAbort.current?.abort(), []);

  async function runSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResults(Array.isArray(json.results) ? json.results : []);
    } catch (err) {
      if (err.name === "AbortError") return; // superseded by a newer search
      setSearchError(err.message);
    } finally {
      if (searchAbort.current === controller) setSearching(false);
    }
  }

  // Create a dossier from either a clicked candidate (name/LEI) or a raw query.
  async function createDossier(queryText) {
    const q = (queryText || "").trim();
    if (!q || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.id) throw new Error("No dossier id returned");
      onCreateDossier(json.id);
    } catch (err) {
      setCreateError(err.message);
      setCreating(false); // stay on this screen so the user can retry
    }
  }

  return (
    <main className="container">
      <header className="page-head">
        <h1>KYB Due Diligence</h1>
        <p className="muted">
          Pull a company to see its ownership structure and adverse-media
          background, with sources.
        </p>
      </header>

      <form className="search-form" onSubmit={runSearch} data-tour="search">
        <input
          className="search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Company name or LEI"
          aria-label="Company name or LEI"
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={searching || !query.trim()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {createError && (
        <p className="error" role="alert">
          Couldn't start the dossier: {createError}
        </p>
      )}
      {creating && (
        <p className="muted" role="status">
          Starting dossier…
        </p>
      )}

      {searchError && (
        <p className="error" role="alert">
          Search failed: {searchError}
        </p>
      )}

      {searching && (
        <div className="result-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skeleton-block" />
          ))}
        </div>
      )}

      {results !== null && !searchError && (
        <section className="results animate-in" aria-busy={creating}>
          {results.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">No matches found.</p>
              <p className="muted small">
                You can still run diligence on this query directly.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => createDossier(query)}
                disabled={creating}
              >
                Run diligence on “{query.trim()}”
              </button>
            </div>
          ) : (
            <>
              <p className="muted results-count">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </p>
              <ul className="result-list">
                {results.map((r, i) => (
                  <ResultRow
                    key={r.lei || r.companyNumber || r.cik || `${r.name}-${i}`}
                    company={r}
                    disabled={creating}
                    onSelect={() => createDossier(r.lei || r.name)}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function ResultRow({ company, onSelect, disabled }) {
  const { name, jurisdiction, status, lei, companyNumber, cik, sources } = company;
  return (
    <li>
      <button
        className="result-row"
        type="button"
        onClick={onSelect}
        disabled={disabled}
      >
        <div className="result-main">
          <span className="result-name">{name || "Unnamed entity"}</span>
          <span className="result-meta">
            {jurisdiction && <span className="chip chip-jur">{jurisdiction}</span>}
            <StatusBadge status={status} />
          </span>
        </div>
        <IdentifierBadges lei={lei} companyNumber={companyNumber} cik={cik} />
        <SourceChips sources={sources} />
      </button>
    </li>
  );
}
