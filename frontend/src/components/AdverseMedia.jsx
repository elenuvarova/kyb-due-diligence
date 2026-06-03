import { formatDate } from "../format.js";

// Adverse-media panel: header counts + honesty note, then a list of articles.
// Resilient to missing counts, null tone, and an empty article list.
export default function AdverseMedia({ adverse, falseFlagEstimate }) {
  const articles = adverse?.articles ?? [];
  const counts = adverse?.counts ?? {};
  const adverseCount = counts.adverse ?? 0;
  const neutralCount = counts.neutral ?? 0;
  const totalCount = counts.total ?? articles.length;
  const filtered = Math.max(0, (counts.scanned ?? totalCount) - totalCount);

  return (
    <div className="adverse-wrap">
      <div className="adverse-counts">
        <span className="count count-adverse">⚠ {adverseCount} adverse</span>
        <span className="count count-neutral">{neutralCount} neutral</span>
        <span className="count count-total">{totalCount} total</span>
      </div>

      {typeof falseFlagEstimate === "number" && (
        <p className="muted small honesty-note">
          Estimated false-flag rate: {Math.round(falseFlagEstimate * 100)}% —
          treat individual hits as leads to verify, not conclusions.
        </p>
      )}

      {filtered > 0 && (
        <p className="muted small">
          {filtered} off-topic {filtered === 1 ? "mention" : "mentions"} filtered out (company not the subject).
        </p>
      )}

      {articles.length === 0 ? (
        <p className="muted panel-empty">
          No significant adverse coverage found
          {filtered > 0 ? ` (${filtered} off-topic ${filtered === 1 ? "mention" : "mentions"} filtered out).` : "."}
        </p>
      ) : (
        <ul className="article-list">
          {articles.map((a, i) => (
            <ArticleRow key={a.url || `${a.title}-${i}`} article={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArticleRow({ article }) {
  const { url, title, domain, seenDate, tone, riskCategory, isAdverse, snippet } =
    article;

  return (
    <li className={`article ${isAdverse ? "article-adverse" : ""}`}>
      <div className="article-head">
        <ToneChip tone={tone} />
        {url ? (
          <a className="article-title" href={url} target="_blank" rel="noopener noreferrer">
            {title || url}
          </a>
        ) : (
          <span className="article-title">{title || "Untitled"}</span>
        )}
      </div>
      <div className="article-meta">
        {domain && <span className="article-domain">{domain}</span>}
        {seenDate && <span className="article-date">{formatDate(seenDate)}</span>}
        {riskCategory && <span className="chip chip-risk">{riskCategory}</span>}
      </div>
      {snippet && <p className="article-snippet">{snippet}</p>}
    </li>
  );
}

// Red if tone < 0, green if > 0, grey at/near 0 or unknown.
function ToneChip({ tone }) {
  if (tone === null || tone === undefined) {
    return <span className="tone-chip tone-unknown" title="Tone unavailable">—</span>;
  }
  const n = Number(tone);
  let tclass = "tone-neutral";
  if (n < 0) tclass = "tone-negative";
  else if (n > 0) tclass = "tone-positive";
  return (
    <span className={`tone-chip ${tclass}`} title={`Tone ${n}`}>
      {n > 0 ? "+" : ""}
      {Number.isInteger(n) ? n : n.toFixed(1)}
    </span>
  );
}
