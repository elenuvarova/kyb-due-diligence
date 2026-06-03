import { Op } from "sequelize";
import { Dossier, Entity, Person, Edge, SourceRecord, AdverseArticle, Litigation } from "../../models/index.js";
import * as gleif from "../sources/gleif.js";
import { resolve, normalizeName, similarity } from "../resolver/index.js";
import { buildOwnershipGraph } from "../graph/index.js";

// Agent-owned source modules are loaded lazily so a missing/broken source degrades
// the dossier to "partial" instead of crashing the whole build.
async function optional(path) {
  try {
    return await import(path);
  } catch (e) {
    console.warn(`[dossier] source unavailable: ${path} (${e.message})`);
    return null;
  }
}

const EMPTY_ADVERSE = { articles: [], counts: { adverse: 0, neutral: 0, total: 0 }, toneTrend: [], falseFlagEstimate: 0 };
const EMPTY_LITIGATION = { cases: [], counts: { total: 0, bankruptcies: 0 }, note: null };
const EMPTY_DISTRESS = { flags: [], filings: [], cik: null };

export async function searchCompanies(query) {
  const out = [];
  try {
    const hits = await gleif.search(query, { size: 8 });
    for (const r of hits) {
      out.push({
        name: r.name, lei: r.lei, companyNumber: null, cik: null,
        jurisdiction: r.jurisdiction, status: r.status, sources: ["gleif"],
      });
    }
  } catch (e) {
    console.warn("[search] gleif failed:", e.message);
  }
  const ch = await optional("../sources/companiesHouse.js");
  if (ch?.isConfigured?.()) {
    try {
      const items = await ch.search(query);
      for (const r of items) {
        out.push({
          name: r.name, lei: null, companyNumber: r.companyNumber, cik: null,
          jurisdiction: r.jurisdiction || "GB", status: r.status, sources: ["companies_house"],
        });
      }
    } catch (e) {
      console.warn("[search] companies_house failed:", e.message);
    }
  }
  return out;
}

async function upsertEntity(c) {
  const normalized = normalizeName(c.name);
  // Prefer strong keys; otherwise key on (normalizedName + jurisdiction) so two
  // different companies that merely share a normalized name in different
  // jurisdictions are not collapsed into one row.
  const where = c.lei
    ? { lei: c.lei }
    : c.companyNumber
    ? { companyNumber: c.companyNumber }
    : { normalizedName: normalized, jurisdiction: c.jurisdiction || null };
  const [entity] = await Entity.findOrCreate({
    where,
    defaults: {
      name: c.name, normalizedName: normalized, lei: c.lei,
      companyNumber: c.companyNumber, cik: c.cik, jurisdiction: c.jurisdiction,
      entityType: c.entityType, status: c.status,
    },
  });
  // `lei` is unique: only adopt one onto an existing row if no other row owns it,
  // otherwise the update throws a UniqueConstraintError and aborts the whole build.
  let leiToSet = entity.lei;
  if (!entity.lei && c.lei) {
    const clash = await Entity.findOne({ where: { lei: c.lei } });
    if (!clash || clash.id === entity.id) leiToSet = c.lei;
  }
  await entity.update({
    name: c.name,
    cik: entity.cik || c.cik,
    companyNumber: entity.companyNumber || c.companyNumber,
    lei: leiToSet,
    jurisdiction: c.jurisdiction || entity.jurisdiction,
    status: c.status || entity.status,
  });
  return entity;
}

// Persist the normalized graph (entities + persons + edges) for provenance / caching.
async function persistGraph(root, own, psc) {
  const ts = new Date();
  // Idempotent: clear this root's previously-persisted ownership (edges touching the
  // root, plus the PSC persons that hung off them) before reinserting, so repeated
  // builds of the same company don't accumulate duplicate edges/persons.
  const prior = await Edge.findAll({
    where: {
      [Op.or]: [
        { fromType: "entity", fromId: root.id },
        { toType: "entity", toId: root.id },
      ],
    },
  });
  const priorPersonIds = prior.filter((e) => e.toType === "person").map((e) => e.toId);
  if (priorPersonIds.length) await Person.destroy({ where: { id: priorPersonIds } });
  if (prior.length) await Edge.destroy({ where: { id: prior.map((e) => e.id) } });

  const upsertRelated = async (rec) => {
    if (!rec?.lei) return null;
    const [e] = await Entity.findOrCreate({
      where: { lei: rec.lei },
      defaults: {
        name: rec.name, normalizedName: normalizeName(rec.name), lei: rec.lei,
        jurisdiction: rec.jurisdiction, status: rec.status, entityType: rec.entityType,
      },
    });
    return e;
  };
  if (own) {
    if (own.directParent?.entity) {
      const p = await upsertRelated(own.directParent.entity);
      if (p) await Edge.create({ fromType: "entity", fromId: root.id, toType: "entity", toId: p.id, relationship: "IS_DIRECTLY_CONSOLIDATED_BY", source: "gleif", sourceRef: p.lei, fetchedAt: ts });
    }
    if (own.ultimateParent?.entity && own.ultimateParent.entity.lei !== own.directParent?.entity?.lei) {
      const p = await upsertRelated(own.ultimateParent.entity);
      if (p) await Edge.create({ fromType: "entity", fromId: root.id, toType: "entity", toId: p.id, relationship: "IS_ULTIMATELY_CONSOLIDATED_BY", source: "gleif", sourceRef: p.lei, fetchedAt: ts });
    }
    for (const c of own.children || []) {
      const ce = await upsertRelated(c.entity);
      if (ce) await Edge.create({ fromType: "entity", fromId: ce.id, toType: "entity", toId: root.id, relationship: c.relationship || "IS_DIRECTLY_CONSOLIDATED_BY", source: "gleif", sourceRef: ce.lei, fetchedAt: ts });
    }
  }
  for (const p of psc || []) {
    if (p.isPerson === false) continue;
    const person = await Person.create({ name: p.name, normalizedName: normalizeName(p.name), nationality: p.nationality || null, raw: p.raw || p });
    await Edge.create({ fromType: "entity", fromId: root.id, toType: "person", toId: person.id, relationship: "HAS_BENEFICIAL_OWNER", source: "companies_house", sourceRef: null, fetchedAt: ts });
  }
}

function rootSummary(c) {
  return {
    id: c.id, name: c.name, lei: c.lei, companyNumber: c.companyNumber, cik: c.cik,
    jurisdiction: c.jurisdiction, entityType: c.entityType, status: c.status,
  };
}

export async function buildDossier(dossierId) {
  const dossier = await Dossier.findByPk(dossierId);
  if (!dossier) return;
  const query = dossier.query;
  const issues = [];

  try {
    const ch = await optional("../sources/companiesHouse.js");
    const sec = await optional("../sources/sec.js");
    const cl = await optional("../sources/courtlistener.js");

    const [gleifHits, chHits, secHits] = await Promise.all([
      gleif.search(query, { size: 8 }).catch(() => { issues.push("gleif"); return []; }),
      ch?.isConfigured?.() ? ch.search(query).catch(() => { issues.push("companies_house"); return []; }) : Promise.resolve([]),
      sec ? sec.search(query).catch(() => { issues.push("sec"); return []; }) : Promise.resolve([]),
    ]);

    // Only include sources we genuinely queried so coverage % isn't deflated by a source
    // that was never asked (e.g. Companies House when no key is configured).
    const sourceResults = { gleif: gleifHits };
    if (ch?.isConfigured?.()) sourceResults.companies_house = chHits;
    if (sec) sourceResults.sec = secHits;
    const { canonical, picks, matchedSources, matchCoveragePct } = resolve(query, sourceResults);

    if (!canonical) {
      await dossier.update({ status: "error", error: `No matching company found for "${query}".`, completedAt: new Date(), result: { rootEntity: null, ownership: { nodes: [], edges: [] }, adverse: EMPTY_ADVERSE, litigation: EMPTY_LITIGATION, distress: EMPTY_DISTRESS, sources: [] } });
      return;
    }

    // When the query was an LEI (or CH returned nothing), recover the UK company
    // number by name so we can still pull beneficial owners (PSC). UK-only:
    // Companies House must never attach to a non-UK company by name alone.
    if (ch?.isConfigured?.() && !canonical.companyNumber && canonical.jurisdiction === "GB") {
      try {
        const byName = await ch.search(canonical.name);
        const m = byName.find((r) => similarity(canonical.name, r.name) >= 0.9);
        if (m) {
          canonical.companyNumber = m.companyNumber;
          picks.companies_house = { ...m, source: "companies_house" };
          if (!matchedSources.includes("companies_house")) matchedSources.push("companies_house");
        }
      } catch { /* best effort */ }
    }

    const rootEntity = await upsertEntity(canonical);
    canonical.id = rootEntity.id;
    // Idempotent provenance: replace this entity's prior source records.
    await SourceRecord.destroy({ where: { entityId: rootEntity.id } });
    for (const s of Object.keys(picks)) {
      const pick = picks[s];
      await SourceRecord.create({
        entityId: rootEntity.id, source: s,
        sourceRef: pick.lei || pick.companyNumber || pick.cik || null,
        payload: pick.raw || pick, fetchedAt: new Date(),
      });
    }

    // ---- Ownership (fast: GLEIF + Companies House PSC) ----
    let gleifOwnership = null;
    if (canonical.lei) {
      try {
        gleifOwnership = await gleif.getOwnership(canonical.lei);
        await rootEntity.update({
          directParentException: gleifOwnership.directParent?.exception?.reason || null,
          ultimateParentException: gleifOwnership.ultimateParent?.exception?.reason || null,
        });
      } catch { issues.push("gleif-ownership"); }
    }
    let psc = [];
    if (ch?.isConfigured?.() && canonical.companyNumber && canonical.jurisdiction === "GB") {
      try { psc = await ch.getPSC(canonical.companyNumber); } catch { issues.push("companies_house-psc"); }
    }

    const ownership = buildOwnershipGraph({ canonical, gleifOwnership, psc });
    // Persisting the graph is best-effort caching; a DB hiccup here must not discard
    // the ownership we already assembled in memory and are about to publish.
    try {
      await persistGraph(rootEntity, gleifOwnership, psc);
    } catch (e) {
      console.warn("[dossier] persistGraph failed:", e.message);
      issues.push("persist-graph");
    }

    const ownershipSources = Array.from(new Set([
      ...matchedSources,
      ...(gleifOwnership ? ["gleif"] : []),
      ...(psc.length ? ["companies_house"] : []),
    ]));

    // Publish ownership immediately so the graph renders without waiting for the
    // slower external scans below. Status stays "building"; the client keeps polling.
    await dossier.update({
      rootEntityId: rootEntity.id,
      matchCoveragePct,
      result: { rootEntity: rootSummary(canonical), ownership, adverse: EMPTY_ADVERSE, litigation: EMPTY_LITIGATION, distress: EMPTY_DISTRESS, sources: ownershipSources },
    });

    // ---- Slower external scans: adverse media + litigation + SEC distress, in parallel ----
    const adverseMod = await optional("../adverse/index.js");
    const [adverse, litigation, distressRaw] = await Promise.all([
      adverseMod?.scanAdverse
        ? adverseMod.scanAdverse(canonical.name).catch((e) => { console.warn("[dossier] adverse failed:", e.message); issues.push("gdelt"); return EMPTY_ADVERSE; })
        : (issues.push("gdelt"), Promise.resolve(EMPTY_ADVERSE)),
      cl?.isConfigured?.()
        ? cl.searchLitigation(canonical.name).catch((e) => { console.warn("[dossier] litigation failed:", e.message); issues.push("courtlistener"); return EMPTY_LITIGATION; })
        : Promise.resolve(EMPTY_LITIGATION),
      sec && canonical.cik
        ? sec.getDistressSignals(canonical.cik).catch((e) => { console.warn("[dossier] sec distress failed:", e.message); issues.push("sec-distress"); return { flags: [], filings: [] }; })
        : Promise.resolve({ flags: [], filings: [] }),
    ]);
    const distress = { ...distressRaw, cik: canonical.cik || null };

    // A source that returned a typed "unavailable" (vs. a genuine empty result) must mark
    // the dossier partial — an empty list is not a clean bill of health if the call failed.
    if (litigation.error) issues.push("courtlistener");
    if (distressRaw.unavailable) issues.push("sec-distress");

    // Idempotent + isolated: replace this entity's prior articles/cases. A persistence
    // failure degrades to "partial" rather than discarding the already-published graph.
    try {
      await AdverseArticle.destroy({ where: { entityId: rootEntity.id } });
      for (const a of adverse.articles || []) {
        if (!a.url) continue; // url is required (allowNull:false) and is the article's identity
        await AdverseArticle.create({
          entityId: rootEntity.id, url: a.url, title: a.title, domain: a.domain,
          language: a.language, sourceCountry: a.sourceCountry,
          seenDate: a.seenDate ? new Date(a.seenDate) : null, tone: a.tone,
          riskCategory: a.riskCategory, isAdverse: !!a.isAdverse,
          relevanceScore: a.relevanceScore, snippet: a.snippet,
        });
      }
      await Litigation.destroy({ where: { entityId: rootEntity.id } });
      for (const c of litigation.cases || []) {
        await Litigation.create({
          entityId: rootEntity.id, caseName: c.caseName, court: c.court,
          dateFiled: c.dateFiled, docketNumber: c.docketNumber, suitNature: c.suitNature,
          chapter: c.chapter, isBankruptcy: c.isBankruptcy, url: c.url,
        });
      }
    } catch (e) {
      console.warn("[dossier] persist adverse/litigation failed:", e.message);
      issues.push("persist");
    }

    const sources = Array.from(new Set([
      ...ownershipSources,
      ...((adverse.articles || []).length ? ["gdelt"] : []),
      ...((litigation.cases || []).length ? ["courtlistener"] : []),
      ...(canonical.cik ? ["sec"] : []),
    ]));

    await dossier.update({
      status: issues.length ? "partial" : "ready",
      falseFlagEstimate: adverse.falseFlagEstimate || 0,
      result: { rootEntity: rootSummary(canonical), ownership, adverse, litigation, distress, sources },
      completedAt: new Date(),
      error: issues.length ? `Some sources unavailable: ${issues.join(", ")}` : null,
    });
  } catch (err) {
    console.error("[dossier] build failed:", err);
    // If an ownership graph was already published, degrade to "partial" rather than
    // discarding it; only a failure before that first publish is a hard "error".
    const fresh = await Dossier.findByPk(dossierId).catch(() => null);
    const hadResult = (fresh?.result?.ownership?.nodes?.length ?? 0) > 0;
    await dossier.update({
      status: hadResult ? "partial" : "error",
      error: err.message,
      completedAt: new Date(),
    });
  }
}
