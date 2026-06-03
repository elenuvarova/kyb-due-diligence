import Sentiment from "sentiment";

const sentiment = new Sentiment();

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "llp", "lp", "gmbh", "ag",
  "sa", "sas", "plc", "co", "corp", "corporation", "company", "group", "holdings",
  "holding", "se", "nv", "bv", "spa", "srl", "pty", "kg", "ohg", "oyj", "ab",
]);

// Generic tokens that should not, on their own, count as a name match.
const STOPWORDS = new Set(["the", "and", "of", "for", "&"]);

// Keywords are matched on WORD BOUNDARIES (see classifyRisk), so ambiguous fragments
// that collide with innocent words ("sue"→issue, "fine"→define, bare "sec"→the agency
// in neutral filings) are deliberately omitted in favor of unambiguous forms.
const RISK_BUCKETS = {
  fraud: ["fraud", "fraudulent", "embezzle", "embezzlement", "ponzi", "scam", "forgery", "bribery", "bribe", "corruption", "corrupt", "kickback", "launder", "laundering", "money laundering", "misappropriation"],
  litigation: ["lawsuit", "lawsuits", "sued", "sues", "litigation", "settlement", "plaintiff", "defendant", "verdict", "class action", "subpoena", "indicted", "indictment", "convicted", "conviction", "guilty", "prosecuted", "prosecution"],
  insolvency: ["bankruptcy", "bankrupt", "insolvency", "insolvent", "liquidation", "liquidate", "receivership", "defaulted", "collapse", "collapsed", "winding up", "creditors", "going concern", "restructuring", "chapter 11", "chapter 7"],
  regulatory: ["regulator", "regulatory", "sanction", "sanctions", "sanctioned", "fined", "fines", "penalty", "penalties", "investigation", "investigated", "probe", "antitrust", "violation", "violations", "enforcement", "watchdog", "misled regulators"],
  scandal: ["scandal", "misconduct", "whistleblower", "cover-up", "coverup", "allegation", "allegations", "alleged", "controversy", "wrongdoing", "ousted"],
  cyber: ["data breach", "hack", "hacked", "hacker", "hackers", "ransomware", "cyberattack", "cyber attack", "leaked", "malware", "phishing", "cybersecurity"],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RISK_PATTERNS = Object.entries(RISK_BUCKETS).map(([category, words]) => ({
  category,
  re: new RegExp(`\\b(?:${words.map(escapeRe).join("|")})\\b`),
}));

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Significant tokens of the company name: drop legal suffixes, stopwords, and
// single-letter fragments (e.g. the "s"/"a" left over from punctuated "S.A.").
export function nameTokens(name) {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !LEGAL_SUFFIXES.has(t) && !STOPWORDS.has(t));
}

// Fraction of company name tokens present in the title (0..1). WHOLE-TOKEN match only:
// a substring fallback let a token like "ten" match "attention" and inflate relevance
// (the #1 false-flag source), so it is intentionally gone.
export function relevanceFor(tokens, title) {
  if (!tokens.length) return 0;
  const titleSet = new Set(normalizeName(title).split(" "));
  let hits = 0;
  for (const t of tokens) {
    if (titleSet.has(t)) hits++;
  }
  return hits / tokens.length;
}

export function classifyRisk(title) {
  const t = normalizeName(title);
  for (const { category, re } of RISK_PATTERNS) {
    if (re.test(t)) return category;
  }
  return null;
}

// Map a sentiment.comparative (per-word, ~ -5..+5 in practice) to ~ -10..+10 tone.
export function titleTone(title) {
  if (!title) return null;
  const r = sentiment.analyze(title);
  const tone = r.comparative * 2;
  return Math.max(-10, Math.min(10, Number(tone.toFixed(2))));
}

export const RELEVANCE_MIN = 0.5; // at least half the name tokens must appear
// sentiment.comparative on short headlines is weak, so tone corroborates rather
// than gates: a present risk keyword is the primary adverse signal.
const TONE_ADVERSE_MAX = -0.4;

// Decide adversity for one scored article.
export function judge({ relevanceScore, tone, riskCategory, singleToken = false }) {
  const negativeEnough = tone !== null && tone <= TONE_ADVERSE_MAX;
  const relevantEnough = relevanceScore >= RELEVANCE_MIN;
  const isAdverse = Boolean(negativeEnough && riskCategory && relevantEnough);
  // Borderline = lower-confidence flag, and the real disambiguation risk: a partial name
  // match, a barely-negative tone, or a single-token company name (common-word homonym
  // risk like "Apple"/"Shell" — we can't be sure the story is the company, not the word).
  // A full multi-token name match with clear negativity is the only high-confidence case.
  const borderline = isAdverse && (relevanceScore < 1 || tone > -0.6 || singleToken);
  return { isAdverse, borderline };
}
