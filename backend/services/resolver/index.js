import { distance as levenshtein } from "fastest-levenshtein";

// Jaro-Winkler implemented locally (avoids the heavy/fragile `natural` data files).
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (!len1 || !len2) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t /= 2;
  const jaro = (matches / len1 + matches / len2 + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited",
  "llc", "llp", "lp", "plc", "gmbh", "ag", "sa", "nv", "bv", "ab", "as", "oyj",
  "sas", "sarl", "srl", "spa", "kg", "kgaa", "kk", "pte", "pty", "ulc", "llc.",
  "holding", "holdings", "group", "international",
]);

export function normalizeName(name) {
  if (!name) return "";
  const cleaned = String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,/#!$%^*;:{}=\-_`~()'"]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const stripped = cleaned.filter((tok) => !LEGAL_SUFFIXES.has(tok));
  // If a name is ENTIRELY legal-form words (e.g. "Holdings Group"), keep them rather than
  // collapsing to "" — otherwise distinct such companies all normalize to the same empty
  // string and either all-merge or never-merge.
  return (stripped.length ? stripped : cleaned).join(" ").trim();
}

// Significant tokens (for adverse-media disambiguation / overlap scoring).
export function significantTokens(name) {
  return normalizeName(name).split(/\s+/).filter((t) => t.length > 1);
}

// 0..1 name similarity: Jaro-Winkler, corroborated by normalized Levenshtein.
export function similarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const jw = jaroWinkler(na, nb);
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  return 0.7 * jw + 0.3 * lev;
}

export function bestMatch(query, candidates) {
  let best = null;
  for (const c of candidates || []) {
    const score = similarity(query, c.name);
    if (!best || score > best.score) best = { candidate: c, score };
  }
  return best;
}

// Decide whether two records from different sources refer to the same company.
// Strong keys (LEI/companyNumber/CIK) are authoritative; otherwise fuzzy name match.
const STRONG = ["lei", "companyNumber", "cik"];
function sameEntity(a, b, threshold = 0.86) {
  for (const k of STRONG) {
    if (a[k] && b[k] && String(a[k]).toUpperCase() === String(b[k]).toUpperCase()) return true;
  }
  // Different known jurisdictions => a shared name is not enough (e.g. a US company
  // vs. a UK company that merely shares the name). Require a strong key instead.
  if (a.jurisdiction && b.jurisdiction && a.jurisdiction !== b.jurisdiction) return false;
  return similarity(a.name, b.name) >= threshold;
}

// Merge a primary record with matching records from other sources into one canonical entity.
function merge(primary, matches) {
  const canonical = {
    name: primary.name,
    normalizedName: normalizeName(primary.name),
    lei: primary.lei || null,
    companyNumber: primary.companyNumber || null,
    cik: primary.cik || null,
    jurisdiction: primary.jurisdiction || null,
    entityType: primary.entityType || null,
    status: primary.status || null,
    contributingSources: [primary.source],
  };
  for (const m of matches) {
    canonical.lei = canonical.lei || m.lei || null;
    canonical.companyNumber = canonical.companyNumber || m.companyNumber || null;
    canonical.cik = canonical.cik || m.cik || null;
    canonical.jurisdiction = canonical.jurisdiction || m.jurisdiction || null;
    canonical.status = canonical.status || m.status || null;
    if (!canonical.contributingSources.includes(m.source)) {
      canonical.contributingSources.push(m.source);
    }
  }
  return canonical;
}

/**
 * Resolve a query against per-source candidate lists.
 * sourceResults: { gleif:[...], companies_house:[...], sec:[...] }
 * Returns { canonical, picks, matchedSources, matchCoveragePct }.
 */
export function resolve(query, sourceResults) {
  const sources = Object.keys(sourceResults);

  // Pick the strongest primary candidate across all sources (best name match, prefer ACTIVE).
  let primary = null;
  for (const s of sources) {
    const m = bestMatch(query, sourceResults[s]);
    if (!m) continue;
    const activeBonus = m.candidate.status === "ACTIVE" ? 0.02 : 0;
    const score = m.score + activeBonus;
    if (!primary || score > primary.score) primary = { ...m, score, source: s };
  }
  if (!primary) {
    return { canonical: null, picks: {}, matchedSources: [], matchCoveragePct: 0 };
  }

  const primaryRec = { ...primary.candidate, source: primary.source };
  const picks = { [primary.source]: primaryRec };
  const matches = [];

  // For each other source, find the record that matches the primary.
  for (const s of sources) {
    if (s === primary.source) continue;
    for (const cand of sourceResults[s] || []) {
      const rec = { ...cand, source: s };
      if (sameEntity(primaryRec, rec)) {
        picks[s] = rec;
        matches.push(rec);
        break;
      }
    }
  }

  const canonical = merge(primaryRec, matches);
  const matchedSources = Object.keys(picks);
  // Input metric: of the registries we actually queried, how many resolved to this subject.
  // Denominator is all queried sources (not just those with hits) so a single-source hit
  // doesn't read as 100% coverage. The dossier passes only sources it genuinely queried.
  const denom = sources.length || 1;
  const matchCoveragePct = Math.round((matchedSources.length / denom) * 100);

  return { canonical, picks, matchedSources, matchCoveragePct };
}
