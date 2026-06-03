import { fetchArtList, fetchToneTimeline, fetchContext } from "../sources/gdelt.js";
import {
  nameTokens,
  relevanceFor,
  classifyRisk,
  titleTone,
  judge,
  RELEVANCE_MIN,
} from "./scoring.js";

// Body-check mode (default on): when the company isn't in the headline, fall back to
// the CONTEXT API sentence and keep the article only if the company AND a risk keyword
// appear in the SAME sentence (proximity). Disable with ADVERSE_BODY_CHECK=false.
const BODY_CHECK = process.env.ADVERSE_BODY_CHECK !== "false";

export async function scanAdverse(companyName) {
  const tokens = nameTokens(companyName);
  // A single-token name (e.g. "Apple", "Shell") collides with common words, so every
  // flag against it is inherently lower-confidence — mark it borderline below.
  const singleToken = tokens.length <= 1;

  // GDELT calls are serialized >=5s apart inside gdelt.js.
  const articlesRaw = await fetchArtList(companyName);
  const toneTrend = await fetchToneTimeline(companyName);
  const contextRaw = BODY_CHECK ? await fetchContext(companyName) : [];

  const sentenceFor = new Map();
  for (const c of contextRaw) {
    if (c.url && c.sentence) sentenceFor.set(c.url, c.sentence);
  }

  const seen = new Set();
  const articles = [];
  let scanned = 0;

  for (const a of articlesRaw) {
    // Dedupe primarily on the URL (the stable identity GDELT gives), falling back to
    // normalized title for the snippet-less syndication case.
    const key = a.url
      ? a.url.replace(/[#?].*$/, "").toLowerCase()
      : `${(a.title || "").toLowerCase().trim()}|${a.domain || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scanned++;

    const titleRel = relevanceFor(tokens, a.title);
    const sentence = sentenceFor.get(a.url) || null;

    // Decide relevance. Headline match is high-confidence. Otherwise, body-rescue
    // only if the company AND a risk keyword co-occur in its own sentence — this is
    // what filters law-firm boilerplate that name-drops the company in passing.
    let relevanceScore = titleRel;
    let bodyMatched = false;
    if (titleRel < RELEVANCE_MIN && BODY_CHECK && sentence) {
      const sentRel = relevanceFor(tokens, sentence);
      if (sentRel >= RELEVANCE_MIN && classifyRisk(sentence)) {
        relevanceScore = sentRel;
        bodyMatched = true;
      }
    }
    if (titleRel < RELEVANCE_MIN && !bodyMatched) continue; // off-topic, drop

    // Score tone/risk on the headline plus the company's sentence when available.
    const scoreText = sentence ? `${a.title}. ${sentence}` : a.title;
    const tone = titleTone(scoreText);
    const riskCategory = classifyRisk(scoreText);
    const { isAdverse, borderline } = judge({ relevanceScore: Number(relevanceScore.toFixed(3)), tone, riskCategory, singleToken });

    articles.push({
      url: a.url,
      title: a.title,
      domain: a.domain,
      language: a.language,
      sourceCountry: a.sourceCountry,
      seenDate: a.seenDate,
      tone,
      riskCategory,
      isAdverse,
      relevanceScore: Number(relevanceScore.toFixed(3)),
      snippet: sentence,
      // Body-rescued hits are inherently lower-confidence than a headline match.
      _borderline: borderline || bodyMatched,
    });
  }

  const adverseSet = articles.filter((x) => x.isAdverse);
  const counts = {
    adverse: adverseSet.length,
    neutral: articles.length - adverseSet.length,
    total: articles.length,
    scanned, // mentions seen before the relevance filter
  };

  // Honesty metric: share of flagged-adverse items resting on weak signal.
  const falseFlagEstimate = adverseSet.length
    ? Number((adverseSet.filter((x) => x._borderline).length / adverseSet.length).toFixed(3))
    : 0;

  for (const x of articles) delete x._borderline;

  return { articles, counts, toneTrend, falseFlagEstimate };
}
