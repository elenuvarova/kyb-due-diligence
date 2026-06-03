import { fetchJson } from "./http.js";

const BASE = "https://api.company-information.service.gov.uk";

export function isConfigured() {
  return !!process.env.COMPANIES_HOUSE_API_KEY;
}

// Companies House uses HTTP Basic with the API key as username and a blank password.
function authHeader() {
  const key = process.env.COMPANIES_HOUSE_API_KEY || "";
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

function get(path) {
  return fetchJson(`${BASE}${path}`, {
    headers: { Authorization: authHeader() },
    timeoutMs: 12000,
  });
}

export async function search(query) {
  if (!isConfigured()) return [];
  const q = encodeURIComponent(query);
  const d = await get(`/search/companies?q=${q}&items_per_page=8`);
  return (d.items || []).map((it) => ({
    source: "companies_house",
    name: it.title || "",
    companyNumber: it.company_number || null,
    jurisdiction: "GB",
    status: it.company_status || null,
    raw: it,
  }));
}

// kind values: individual- / corporate-entity- / legal-person- / super-secure-
// -person-with-significant-control. A natural-person UBO is anything that isn't a
// corporate or legal-person PSC (so the anonymized "super-secure" person still counts).
function isPersonKind(kind) {
  if (typeof kind !== "string") return false;
  if (!kind.includes("person-with-significant-control")) return false;
  return !kind.includes("corporate") && !kind.includes("legal-person");
}

export async function getPSC(companyNumber) {
  if (!isConfigured()) return [];
  const out = [];
  const pageSize = 100;
  let start = 0;
  // PSC is paginated (default 25/page); loop so a company with many beneficial owners
  // doesn't get its UBO list silently truncated. Guard bounds the loop defensively.
  for (let guard = 0; guard < 20; guard++) {
    const d = await get(
      `/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control?items_per_page=${pageSize}&start_index=${start}`
    );
    const items = d.items || [];
    for (const it of items) {
      if (typeof it.kind === "string" && it.kind.includes("statement")) continue; // not an owner
      out.push({
        name: it.name || "",
        kind: it.kind || null,
        isPerson: isPersonKind(it.kind),
        nationality: it.nationality || null,
        naturesOfControl: it.natures_of_control || [],
        ceased: !!it.ceased_on,
        raw: it,
      });
    }
    const total = typeof d.total_results === "number" ? d.total_results : items.length;
    start += items.length || pageSize;
    if (!items.length || start >= total) break;
  }
  return out;
}
