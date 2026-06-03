import pLimit from "p-limit";
import { fetchJson } from "./http.js";

const BASE = "https://api.gleif.org/api/v1";
const limit = pLimit(4); // stay well under GLEIF's ~60 req/min
const LEI_RE = /^[A-Z0-9]{18}[0-9]{2}$/i;

const get = (path) => limit(() => fetchJson(`${BASE}${path}`, { timeoutMs: 12000 }));

function normalize(rec) {
  const a = rec.attributes || {};
  const e = a.entity || {};
  const isGB = (e.jurisdiction || "").startsWith("GB") || e.legalAddress?.country === "GB";
  return {
    source: "gleif",
    lei: rec.id,
    name: e.legalName?.name || "",
    jurisdiction: e.legalAddress?.country || e.jurisdiction || null,
    // For UK entities GLEIF's registration number IS the Companies House number. Surface it
    // so entity resolution can strong-key match GLEIF↔Companies House (which otherwise share
    // no key) instead of relying on fuzzy name + jurisdiction alone.
    companyNumber: isGB && e.registeredAs ? e.registeredAs : null,
    entityType: e.category || "GENERAL",
    status: e.status || null,
    raw: rec,
  };
}

export async function search(query, { size = 8 } = {}) {
  if (LEI_RE.test(query.trim())) {
    try {
      const d = await get(`/lei-records/${query.trim().toUpperCase()}`);
      return [normalize(d.data)];
    } catch {
      return [];
    }
  }
  const q = encodeURIComponent(query);
  const d = await get(`/lei-records?filter[entity.legalName]=${q}&page[size]=${size}`);
  return (d.data || []).map(normalize);
}

export async function getRecord(lei) {
  const d = await get(`/lei-records/${lei}`);
  return normalize(d.data);
}

// Resolve a parent via GLEIF's dedicated relationship endpoints.
// The `/{lei}/direct-parent` (or `/ultimate-parent`) endpoint returns HTTP 404 when the
// entity reports a *reporting exception* instead of a parent LEI — that is an expected
// case (and itself a transparency signal), not an error. On 404 we fetch the matching
// `-reporting-exception` endpoint to capture WHY (NO_LEI / NATURAL_PERSONS / NON_PUBLIC…).
// Returns {entity} OR {exception:{category,reason}} OR null.
async function resolveParent(lei, which) {
  try {
    const d = await get(`/lei-records/${lei}/${which}-parent`);
    if (d?.data) return { entity: normalize(d.data) };
  } catch (err) {
    if (err.status !== 404) throw err; // a real error (not "no parent") — let it surface
  }
  try {
    const d = await get(`/lei-records/${lei}/${which}-parent-reporting-exception`);
    const a = d?.data?.attributes || {};
    const reason = Array.isArray(a.reason) ? a.reason.join(", ") : a.reason || null;
    return { exception: { category: a.category || null, reason: reason || a.category || null } };
  } catch (err) {
    if (err.status === 404) return null; // genuinely no parent and no exception filed
    throw err;
  }
}

// The dedicated `/{lei}/direct-children` endpoint returns the child LEI records directly,
// so each child IS_DIRECTLY_CONSOLIDATED_BY the root (no relationship-record direction
// guessing). Drop self/empty references defensively.
async function getChildren(rec, max = 8) {
  let d;
  try {
    d = await get(`/lei-records/${rec.lei}/direct-children?page[size]=${max}`);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
  return (d.data || [])
    .map(normalize)
    .filter((e) => e.lei && e.lei !== rec.lei)
    .map((entity) => ({ relationship: "IS_DIRECTLY_CONSOLIDATED_BY", entity }));
}

// Assemble the ownership picture for one LEI: parents (with exception awareness) + children.
// Each leg degrades independently so one failing call doesn't drop the whole graph.
export async function getOwnership(lei) {
  const root = await getRecord(lei);
  const [directParent, ultimateParent, children] = await Promise.all([
    resolveParent(lei, "direct").catch(() => null),
    resolveParent(lei, "ultimate").catch(() => null),
    getChildren(root).catch(() => []),
  ]);
  return { root, directParent, ultimateParent, children };
}
