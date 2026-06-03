import { fetchJson, sleep } from "./http.js";
import { significantTokens } from "../resolver/index.js";

const BASE = "https://www.courtlistener.com/api/rest/v4";
const HOST = "https://www.courtlistener.com";

// CourtListener allows only 5 req/min (and 50/hr, 125/day). Serialize every call across
// the whole process with >=12s spacing so concurrent dossier builds can't burst past the
// per-minute cap and get the token throttled/banned for the rest of the day.
const MIN_SPACING_MS = 12000;
let lastCallAt = 0;
let gate = Promise.resolve();

function rateLimited(fn) {
  const run = async () => {
    const wait = MIN_SPACING_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  };
  const result = gate.then(run, run);
  gate = result.catch(() => {});
  return result;
}

export function isConfigured() {
  return !!process.env.COURTLISTENER_TOKEN;
}

function authHeaders() {
  return { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` };
}

// The search ranks loosely (unrelated cases leak in), so require the company's own name
// tokens to appear as WHOLE WORDS in the case name / parties before trusting a hit
// (substring matching let "ace" match "spacex").
function relevant(tokens, ...fields) {
  if (!tokens.length) return false;
  const words = new Set(
    fields
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
  const hits = tokens.filter((t) => words.has(t)).length;
  return hits / tokens.length >= 0.5;
}

const partyText = (p) => (Array.isArray(p) ? p.join(" ") : p || "");

// v4 result fields have drifted between snake_case and camelCase across versions; read
// both so a casing change doesn't silently null out URLs or party-disambiguation text.
const pick = (r, ...keys) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return null;
};

export async function searchLitigation(companyName, { max = 15 } = {}) {
  if (!isConfigured()) return { cases: [], counts: { total: 0, bankruptcies: 0 }, note: null };
  const tokens = significantTokens(companyName);
  const q = encodeURIComponent(`"${companyName}"`);
  let data;
  try {
    // type=r = RECAP dockets (federal civil + bankruptcy). One call per dossier, rate-limited.
    data = await rateLimited(() =>
      fetchJson(`${BASE}/search/?q=${q}&type=r&order_by=dateFiled%20desc`, {
        headers: authHeaders(),
        timeoutMs: 15000,
        retries: 0,
      })
    );
  } catch (e) {
    // Surface the failure so the dossier can mark this section unavailable rather than
    // present an empty list as a clean "no litigation found".
    return {
      cases: [],
      counts: { total: 0, bankruptcies: 0 },
      note: "CourtListener unavailable or rate-limited",
      error: true,
    };
  }

  const matched = (data.results || []).filter((r) =>
    relevant(tokens, pick(r, "caseName", "case_name"), pick(r, "caseNameFull", "case_name_full"), partyText(r.party))
  );

  const cases = matched.slice(0, max).map((r) => {
    const rel = pick(r, "docketAbsoluteURL", "docket_absolute_url", "absolute_url") || "";
    const court = pick(r, "court", "court_id");
    const chapter = pick(r, "chapter");
    return {
      caseName: pick(r, "caseName", "case_name", "caseNameFull", "case_name_full") || "(unnamed case)",
      court: court || null,
      dateFiled: pick(r, "dateFiled", "date_filed"),
      docketNumber: pick(r, "docketNumber", "docket_number"),
      suitNature: pick(r, "suitNature", "suit_nature", "nature_of_suit"),
      chapter: chapter || null,
      isBankruptcy: !!chapter || /bankrupt/i.test(court || ""),
      url: rel.startsWith("http") ? rel : rel ? HOST + rel : null,
    };
  });

  return {
    cases,
    counts: { total: cases.length, bankruptcies: cases.filter((c) => c.isBankruptcy).length },
    note: matched.length > max ? `Showing ${max} of ${matched.length} matched cases` : null,
  };
}
