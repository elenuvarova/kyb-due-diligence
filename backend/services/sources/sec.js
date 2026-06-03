import { fetchJson } from "./http.js";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
const EFTS_BASE = "https://efts.sec.gov/LATEST/search-index";

function userAgent() {
  return process.env.SEC_USER_AGENT || "KYB-DueDiligence/1.0 kyb-demo@example.com";
}

function get(url) {
  return fetchJson(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    timeoutMs: 12000,
  });
}

// SEC needs only a User-Agent, no key.
export function isConfigured() {
  return true;
}

function padCik(cik) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

let tickersCache = null;
async function loadTickers() {
  if (tickersCache) return tickersCache;
  const raw = await get(TICKERS_URL);
  tickersCache = Object.values(raw || {});
  return tickersCache;
}

export async function search(name) {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return [];
  const all = await loadTickers();
  const matches = all.filter(
    (r) => typeof r.title === "string" && r.title.toLowerCase().includes(needle)
  );
  // Prefer exact title matches, then shorter titles (less noisy), cap the list.
  matches.sort((a, b) => {
    const ax = a.title.toLowerCase() === needle ? 0 : 1;
    const bx = b.title.toLowerCase() === needle ? 0 : 1;
    return ax - bx || a.title.length - b.title.length;
  });
  return matches.slice(0, 8).map((r) => ({
    source: "sec",
    name: r.title,
    cik: padCik(r.cik_str),
    raw: r,
  }));
}

// Throws on a real failure (403 missing UA / 429 rate-limit / 5xx). A 200 with no hits
// returns []. The caller must distinguish "no hits" (clean) from "call failed" (unknown)
// rather than swallowing a 403/429 into a false "no distress".
async function eftsCount(cik, query, forms) {
  const params = new URLSearchParams({ q: query, ciks: cik });
  if (forms) params.set("forms", forms);
  const d = await get(`${EFTS_BASE}?${params.toString()}`);
  return d?.hits?.hits || [];
}

function topFiling(hits) {
  const h = hits[0]?._source;
  if (!h) return null;
  return { form: h.form || null, filedAt: h.file_date || null, ref: h.adsh || null };
}

export async function getDistressSignals(cik) {
  const padded = padCik(cik);
  const flags = [];
  const filings = [];
  const unavailable = [];

  // Submissions: catch late-filing notifications (NT 10-K / NT 10-Q) and recent 8-Ks.
  try {
    const sub = await get(`${SUBMISSIONS_BASE}/CIK${padded}.json`);
    const recent = sub?.filings?.recent || {};
    const forms = recent.form || [];
    const dates = recent.filingDate || [];
    const accns = recent.accessionNumber || [];

    let lateCount = 0;
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      if (typeof form === "string" && form.startsWith("NT ")) {
        lateCount++;
        if (lateCount <= 3) {
          filings.push({ form, filedAt: dates[i] || null, ref: accns[i] || null });
        }
      }
    }
    if (lateCount > 0) {
      flags.push({
        type: "late_filing",
        label: "Late filing notification(s)",
        detail: `${lateCount} NT (notification of late filing) form(s) found in recent submissions.`,
      });
    }
  } catch {
    // Distinct from "no late filings": the submissions call itself failed.
    unavailable.push("submissions");
  }

  // EFTS full-text checks. Use PRECISE phrases, not bare keywords: bare "bankruptcy"
  // or "going concern" appear in healthy companies' risk factors/boilerplate (e.g. Apple
  // has 91 "bankruptcy" 8-K hits). The auditor's "substantial doubt" qualification and a
  // "voluntary petition" (Chapter 7/11 filing) are real distress signals — both verified
  // to be 0 for Apple while catching WeWork (going concern) and Bed Bath & Beyond (filing).
  try {
    const [goingConcern, bankruptcy] = await Promise.all([
      eftsCount(padded, '"substantial doubt"', "10-K,10-Q"),
      eftsCount(padded, '"voluntary petition"', "8-K"),
    ]);

    if (goingConcern.length) {
      flags.push({
        type: "going_concern",
        label: "Going-concern doubt",
        detail: `Auditor "substantial doubt" language found in ${goingConcern.length}+ annual/quarterly filing(s).`,
      });
      const top = topFiling(goingConcern);
      if (top) filings.push(top);
    }

    if (bankruptcy.length) {
      flags.push({
        type: "bankruptcy",
        label: "Bankruptcy-petition language",
        detail: `"voluntary petition" (Chapter 7/11) language found in ${bankruptcy.length}+ 8-K filing(s) — open the filing to confirm whether an actual filing vs. risk disclosure.`,
      });
      const top = topFiling(bankruptcy);
      if (top) filings.push(top);
    }
  } catch (e) {
    // A 403/429/5xx here is NOT a clean result — flag the section as unavailable so the
    // dossier reads "could not check" rather than "no distress found".
    console.warn("[sec] EFTS distress check failed:", e.message);
    unavailable.push("full-text-search");
  }

  return { flags, filings, unavailable: unavailable.length ? unavailable : null };
}
