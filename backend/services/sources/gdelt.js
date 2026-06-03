import { sleep } from "./http.js";

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const CONTEXT_BASE = "https://api.gdeltproject.org/api/v2/context/context";
const MIN_SPACING_MS = 5200; // GDELT throttles to ~1 req / 5s; pad a little
// DOC 2.0 ArtList only indexes the last ~3 months; asking for more silently misrepresents
// coverage. Keep the article feed and the tone trend on the same window so they align.
const TIMESPAN = "3m";

// Module-level gate so every GDELT call across the process is serialized >=5s apart.
let lastCallAt = 0;
let queue = Promise.resolve();

// Retry/degrade on throttle, timeout, 5xx, or low-level socket/DNS failures.
function isTransient(err) {
  if (!err) return false;
  if (err.throttled || err.name === "AbortError") return true;
  if (typeof err.status === "number" && err.status >= 500) return true;
  const code = err.code || err.cause?.code || "";
  return /^(UND_ERR|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE)/.test(code) ||
    err.message === "fetch failed";
}

// GDELT returns plaintext (not JSON) on throttle/error, so we cannot use fetchJson.
async function gdeltFetch(url) {
  const attempt = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000); // GDELT can be slow to first byte
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const text = await res.text();
      const trimmed = text.trim();
      // Throttle is signalled as a plaintext body, sometimes with HTTP 429.
      if (/limit requests/i.test(trimmed)) {
        const err = new Error("GDELT throttled");
        err.throttled = true;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`GDELT HTTP ${res.status}: ${trimmed.slice(0, 120)}`);
        err.status = res.status;
        throw err;
      }
      // No-results responses can also come back as non-JSON plaintext.
      if (!trimmed || trimmed[0] !== "{") return null;
      return JSON.parse(trimmed);
    } finally {
      clearTimeout(timer);
    }
  };

  const run = async () => {
    const wait = MIN_SPACING_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    // Up to two retries on transient timeout / throttle / 5xx / socket errors.
    for (let i = 0; ; i++) {
      try {
        lastCallAt = Date.now();
        return await attempt();
      } catch (err) {
        if (!isTransient(err) || i >= 2) throw err;
        // Throttling needs more than the minimum gap to clear; back off harder for it.
        await sleep(err.throttled ? MIN_SPACING_MS * 2 : MIN_SPACING_MS);
      }
    }
  };
  // Chain onto the queue so concurrent callers still respect the spacing.
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

function buildQuery(companyName) {
  return `"${companyName}" sourcelang:english`;
}

export async function fetchArtList(companyName) {
  const q = encodeURIComponent(buildQuery(companyName));
  const url = `${BASE}?query=${q}&mode=ArtList&format=json&maxrecords=75&timespan=${TIMESPAN}&sort=DateDesc`;
  let data;
  try {
    data = await gdeltFetch(url);
  } catch (err) {
    // External media is best-effort: degrade to empty rather than failing the scan.
    if (isTransient(err)) return [];
    throw err;
  }
  const arts = data?.articles || [];
  return arts.map((a) => ({
    url: a.url || null,
    title: a.title || "",
    domain: a.domain || null,
    language: a.language || null,
    sourceCountry: a.sourcecountry || null,
    seenDate: parseSeenDate(a.seendate),
  }));
}

// CONTEXT API returns, per matching article, the SENTENCE where the query appeared.
// Used to decide whether the company is the subject (vs. a passing list mention) and
// to show a snippet. Note: it rejects the sourcelang operator, so query is bare.
export async function fetchContext(companyName) {
  const q = encodeURIComponent(`"${companyName}"`);
  const url = `${CONTEXT_BASE}?query=${q}&format=json&maxrecords=75`;
  let data;
  try {
    data = await gdeltFetch(url);
  } catch (err) {
    if (isTransient(err)) return [];
    throw err;
  }
  return (data?.articles || []).map((a) => ({
    url: a.url || null,
    sentence: (a.sentence || a.context || "").trim() || null,
  }));
}

export async function fetchToneTimeline(companyName) {
  const q = encodeURIComponent(buildQuery(companyName));
  const url = `${BASE}?query=${q}&mode=TimelineTone&format=json&timespan=${TIMESPAN}`;
  let data;
  try {
    data = await gdeltFetch(url);
  } catch (err) {
    if (isTransient(err)) return [];
    throw err;
  }
  const series = data?.timeline?.[0]?.data || [];
  return series.map((p) => ({
    date: parseSeenDate(p.date) || p.date || null,
    tone: typeof p.value === "number" ? p.value : Number(p.value) || null,
  }));
}

// GDELT dates are "YYYYMMDDTHHMMSSZ" (ArtList) or ISO-ish (timeline). Return ISO or null.
function parseSeenDate(s) {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
