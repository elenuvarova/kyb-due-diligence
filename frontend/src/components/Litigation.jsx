import { formatDate } from "../format.js";

// Litigation panel: US court/bankruptcy filings from CourtListener.
// Resilient to an empty case list and missing fields.
export default function Litigation({ litigation }) {
  const cases = litigation?.cases ?? [];
  const counts = litigation?.counts ?? {};
  const total = counts.total ?? cases.length;
  const bankruptcies = counts.bankruptcies ?? 0;

  return (
    <div className="litigation-wrap">
      <div className="adverse-counts">
        <span className="count count-total">{total} cases</span>
        {bankruptcies > 0 && (
          <span className="count count-adverse">⚠ {bankruptcies} bankruptcy</span>
        )}
      </div>

      {cases.length === 0 ? (
        <p className="muted panel-empty">No US litigation found.</p>
      ) : (
        <ul className="article-list">
          {cases.map((c, i) => (
            <CaseRow key={c.url || `${c.docketNumber}-${i}`} item={c} />
          ))}
        </ul>
      )}

      {litigation?.note && <p className="muted small honesty-note">{litigation.note}</p>}
    </div>
  );
}

function CaseRow({ item }) {
  const { caseName, court, dateFiled, docketNumber, suitNature, chapter, isBankruptcy, url } = item;
  return (
    <li className={`article ${isBankruptcy ? "article-adverse" : ""}`}>
      <div className="article-head">
        {url ? (
          <a className="article-title" href={url} target="_blank" rel="noopener noreferrer">
            {caseName || "(unnamed case)"}
          </a>
        ) : (
          <span className="article-title">{caseName || "(unnamed case)"}</span>
        )}
      </div>
      <div className="article-meta">
        {court && <span className="article-domain">{court}</span>}
        {dateFiled && <span className="article-date">{formatDate(dateFiled)}</span>}
        {isBankruptcy && (
          <span className="chip chip-risk">bankruptcy{chapter ? ` ch. ${chapter}` : ""}</span>
        )}
        {!isBankruptcy && suitNature && <span className="chip chip-jur">{suitNature}</span>}
        {docketNumber && <span className="muted small">{docketNumber}</span>}
      </div>
    </li>
  );
}
