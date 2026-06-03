import pLimit from "p-limit";
import { fetchJson } from "./http.js";
import { normalizeName } from "../resolver/index.js";

const ENDPOINT = "https://query.wikidata.org/sparql";
// Wikidata's usage policy requires a descriptive User-Agent with contact info.
const UA =
  process.env.WIKIDATA_USER_AGENT ||
  "KYB-DueDiligence/1.0 (https://github.com/kyb-due-diligence; kyb-demo@example.com)";
const limit = pLimit(2); // gentle: SPARQL enforces a per-minute query-time budget
const cache = new Map(); // normalizedName -> pepInfo, per-process

// No key needed; the built-in User-Agent is enough.
export function isConfigured() {
  return true;
}

const HONORIFICS = /^(mr|mrs|ms|miss|dr|prof|sir|dame|lord|lady|rev|hon)\.?\s+/i;
const cleanName = (name) => String(name || "").replace(HONORIFICS, "").trim();
// Build a safe SPARQL string literal: collapse control whitespace (a raw newline/CR/tab is
// illegal inside "..."@en and would 400 the query), then escape backslash and quote.
const escapeLiteral = (s) =>
  String(s).replace(/[\r\n\t]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Conservative PEP check: is there an EXACT-name human in Wikidata whose occupation is
// "politician" (Q82955)? Exact-label matching keeps false positives near zero — a false
// PEP flag is a serious accusation. Result is always confidence:"low": a name match is a
// LEAD to verify, never a conclusion. Returns { isPep, wikidataId, positions[] }.
export async function checkPEP(name) {
  const clean = cleanName(name);
  if (clean.length < 4) return { isPep: false };
  const key = normalizeName(clean);
  if (cache.has(key)) return cache.get(key);

  const query = `SELECT ?person ?positionLabel WHERE {
    ?person wdt:P31 wd:Q5 ; rdfs:label "${escapeLiteral(clean)}"@en ; wdt:P106 wd:Q82955 .
    OPTIONAL { ?person wdt:P39 ?position . ?position rdfs:label ?positionLabel . FILTER(LANG(?positionLabel) = "en") }
  } LIMIT 10`;

  let data;
  try {
    data = await fetchJson(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
      timeoutMs: 12000,
    });
  } catch {
    return { isPep: false, error: true }; // don't cache a transient failure
  }

  const bindings = data?.results?.bindings || [];
  let result;
  if (!bindings.length) {
    result = { isPep: false };
  } else {
    const wikidataId = (bindings[0].person?.value || "").split("/").pop() || null;
    const positions = [
      ...new Set(bindings.map((b) => b.positionLabel?.value).filter(Boolean)),
    ].slice(0, 5);
    result = { isPep: true, confidence: "low", wikidataId, positions };
  }
  cache.set(key, result);
  return result;
}

// Enrich a PSC list -> map of normalizedName -> pepInfo for the matched natural persons.
// Capped + concurrency-limited; enrichment only, kept off the dossier's fast path.
export async function enrichPSC(psc, { max = 12 } = {}) {
  const candidates = (psc || []).filter((p) => p.isPerson !== false && p.name);
  if (candidates.length > max) {
    console.warn(`[wikidata] PEP check capped at ${max}/${candidates.length} beneficial owners`);
  }
  const persons = candidates.slice(0, max);
  const out = {};
  await Promise.all(
    persons.map((p) =>
      limit(async () => {
        const info = await checkPEP(p.name);
        if (info.isPep) out[normalizeName(p.name)] = info;
      })
    )
  );
  return out;
}
