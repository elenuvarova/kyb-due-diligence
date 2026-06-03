import { normalizeName } from "../resolver/index.js";

// Assemble the ownership graph for the dossier API.
// Convention: an edge points FROM an entity TO the entity/person that owns/consolidates it.
// So the graph reads bottom-up: children -> root -> (direct parent / ultimate parent / beneficial owners).

// Human-readable labels for GLEIF reporting-exception reason/category codes. The raw code
// is still kept in the node sublabel for provenance. NATURAL_PERSONS in particular is a
// neutral, common case (owned by individuals, who have no LEI) — not a suspicious gap.
const EXCEPTION_LABELS = {
  NATURAL_PERSONS: "Owned by natural person(s)",
  NON_CONSOLIDATING: "No consolidating parent",
  NO_LEI: "Parent has no LEI",
  NON_PUBLIC: "Parent not publicly disclosed",
  NO_KNOWN_PERSON: "No known parent",
  LEGAL_OBSTACLES: "Disclosure legally restricted",
  BINDING_LEGAL_COMMITMENTS: "Disclosure legally restricted",
  CONSENT_NOT_OBTAINED: "Disclosure consent not obtained",
  DISCLOSURE_DETRIMENTAL: "Disclosure withheld (detrimental)",
  DETRIMENT_NOT_EXCLUDED: "Disclosure withheld (detrimental)",
};

function exceptionLabel(code) {
  if (!code) return "Owner not disclosed";
  // `code` may be a comma/space-joined list of reasons; map the primary one.
  const primary = String(code).split(/[,\s]+/).filter(Boolean)[0]?.toUpperCase();
  return EXCEPTION_LABELS[primary] || "Owner not disclosed";
}

function pctFromNature(natures) {
  const s = (natures || []).join(" ");
  if (/75-to-100/.test(s)) return 87;
  if (/50-to-75/.test(s)) return 62;
  if (/25-to-50/.test(s)) return 37;
  return null;
}

export function buildOwnershipGraph({ canonical, gleifOwnership, psc, pepByName = {} }) {
  const nodes = new Map();
  const edges = [];
  const addNode = (n) => { if (!nodes.has(n.id)) nodes.set(n.id, n); };

  const rootId = "entity:root";
  addNode({
    id: rootId,
    type: "entity",
    label: canonical?.name || "Unknown",
    sublabel: [canonical?.lei && `LEI ${canonical.lei}`, canonical?.jurisdiction].filter(Boolean).join(" · "),
    status: canonical?.status || null,
    isRoot: true,
  });

  if (gleifOwnership) {
    const { directParent, ultimateParent, children } = gleifOwnership;

    const addParent = (rel, p, exceptionKey) => {
      if (!p) return;
      if (p.entity) {
        const id = `entity:lei:${p.entity.lei}`;
        addNode({ id, type: "entity", label: p.entity.name, sublabel: `LEI ${p.entity.lei}`, status: p.entity.status, isRoot: false });
        edges.push({ from: rootId, to: id, relationship: rel, ownershipPct: null });
      } else if (p.exception) {
        const code = p.exception.reason || p.exception.category || null;
        const id = `exception:${exceptionKey}`;
        addNode({
          id, type: "exception",
          label: exceptionLabel(code),
          sublabel: [code, "GLEIF reporting exception"].filter(Boolean).join(" · "),
          status: null, isRoot: false,
        });
        edges.push({ from: rootId, to: id, relationship: rel, ownershipPct: null });
      }
    };

    addParent("IS_DIRECTLY_CONSOLIDATED_BY", directParent, "direct");
    // Only add ultimate if it resolves to a different entity than the direct parent.
    const directLei = directParent?.entity?.lei;
    if (ultimateParent?.entity && ultimateParent.entity.lei !== directLei) {
      addParent("IS_ULTIMATELY_CONSOLIDATED_BY", ultimateParent, "ultimate");
    } else if (ultimateParent?.exception && !directParent?.exception) {
      addParent("IS_ULTIMATELY_CONSOLIDATED_BY", ultimateParent, "ultimate");
    }

    for (const c of children || []) {
      if (!c.entity) continue;
      const id = `entity:lei:${c.entity.lei}`;
      addNode({ id, type: "entity", label: c.entity.name, sublabel: `LEI ${c.entity.lei}`, status: c.entity.status, isRoot: false });
      edges.push({ from: id, to: rootId, relationship: c.relationship || "IS_DIRECTLY_CONSOLIDATED_BY", ownershipPct: null });
    }
  }

  // Companies House PSC = real natural-person beneficial owners (the UBO data GLEIF lacks).
  // Dedupe entity PSCs against entity nodes already added from GLEIF (same company,
  // two sources) so they don't appear twice; persons are always distinct.
  const idByName = new Map();
  for (const n of nodes.values()) {
    if (n.type === "entity") idByName.set(normalizeName(n.label), n.id);
  }
  (psc || []).forEach((p, i) => {
    const pct = pctFromNature(p.naturesOfControl);
    const isPerson = p.isPerson !== false;
    if (!isPerson) {
      const existing = idByName.get(normalizeName(p.name));
      if (existing) {
        edges.push({ from: rootId, to: existing, relationship: "HAS_BENEFICIAL_OWNER", ownershipPct: pct });
        return;
      }
    }
    const pep = isPerson ? pepByName[normalizeName(p.name)] : null;
    const id = isPerson ? `person:${i}` : `entity:psc:${i}`;
    addNode({
      id,
      type: isPerson ? "person" : "entity",
      label: p.name,
      sublabel: [p.nationality, pep?.isPep ? "PEP" : null, "beneficial owner (PSC)"].filter(Boolean).join(" · "),
      status: null, isRoot: false,
      isPep: !!pep?.isPep,
      pepPositions: pep?.positions || null,
    });
    idByName.set(normalizeName(p.name), id);
    edges.push({ from: rootId, to: id, relationship: "HAS_BENEFICIAL_OWNER", ownershipPct: pct });
  });

  return { nodes: Array.from(nodes.values()), edges };
}
