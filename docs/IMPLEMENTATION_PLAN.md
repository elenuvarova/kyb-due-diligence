# KYB / Counterparty Due-Diligence — Implementation Plan

> **Goal:** "Pull a company → ownership structure (UBO) + adverse-media background with sources."
> A portfolio-grade KYB tool that answers *"Is this company who it claims to be, and is it risky to work with?"* — focused on **ownership transparency, litigation history, financial distress, and adverse media**. **Not** sanctions screening.
>
> **Hard constraint:** 100% free APIs / open data.
> **Built on:** the full-stack template already in this repo (React+Vite · Express ESM · Sequelize → SQLite local / Postgres on Render).

This plan is grounded in a research pass that was **adversarially fact-checked** (June 2026). Every "it's free" claim below was independently verified against the provider's own docs/pricing page. The verification overturned several common assumptions — see [§2](#2-verified-data-sources) and [§3](#3-what-we-dropped-and-why).

---

## 1. Product shape

**One screen, one job:** a search box → a **dossier**.

```
[ search: company name / LEI / company number ]
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  ACME HOLDINGS LTD   ·  UK 01234567  ·  LEI 5493...      │
│  status: active           matched across 3 sources       │
├──────────────────────────┬──────────────────────────────┤
│  OWNERSHIP GRAPH         │  ADVERSE MEDIA                │
│   (nodes = entities/     │   timeline of negative        │
│    persons, edges =      │   coverage w/ tone + source   │
│    ownership/control)    │   ⚠ 3 adverse · 12 neutral    │
├──────────────────────────┴──────────────────────────────┤
│  LITIGATION (phase 4)      FINANCIAL DISTRESS (phase 4)  │
└─────────────────────────────────────────────────────────┘
```

- **MVP = the top two panels** (ownership graph + adverse media). Litigation and financials glue on after.
- Every fact in the dossier carries a **source + retrieval timestamp** (provenance is the whole point of due diligence).

### North-star & guardrail metrics
| Metric | Definition | Why |
|--------|-----------|-----|
| **NSM** | # companies with a completed dossier | the unit of value delivered |
| **Input** | % of entities **matched/resolved** across sources | drives dossier completeness |
| **Guardrail** | **false-flag rate** on adverse media (benign news flagged negative, or wrong same-named company) | a false accusation is the worst failure mode |

---

## 2. Verified data sources

All confirmed free for portfolio/demo use **as of June 2026** unless noted. ⚠ = a verified gotcha that will bite a naive implementation.

| Source | Use | Free? | Auth | Limits | Key gotchas (verified) |
|--------|-----|-------|------|--------|------------------------|
| **GLEIF** | Ownership graph (entity↔entity) | ✅ yes, fully open | none | ~60 req/min (unofficial; not on any GLEIF page) | ⚠ Level 2 = **accounting consolidation, not true UBO**. ⚠ `…/direct-parent` returns **404** when only a reporting *exception* exists — inspect the `relationships` object first. ⚠ 99% of LEIs now report parent info (Q1 2026), so it's richer than older docs imply. |
| **UK Companies House** | **Real UBO (PSC) for UK**, status, officers | ✅ yes | free API key, **HTTP Basic Auth: key = username, blank password** | 600 req / 5 min | **PSC = persons with significant control = actual natural-person beneficial owners.** This is what fills GLEIF's UBO gap. 8 granular statuses (`liquidation`, `administration`, `voluntary-arrangement`, `active-proposal-to-strike-off`) = direct risk signals. |
| **GDELT DOC 2.0** | Adverse media + tone | ✅ yes, open | none | HTTP 429 even on light bursts; ArtList ≤ **250 results**, **last 3 months only** | ⚠ ArtList returns **metadata only — no snippet, no body, no per-article tone**. ⚠ Per-article tone is *not* in ArtList; tone only comes back in aggregate (`TimelineTone`/`ToneChart`). ✅ Use the separate free **CONTEXT 2.0 API** for snippet text to score. ⚠ No entity disambiguation — "Apple" matches the fruit. ⚠ Sparse/empty for SMEs. ⚠ **GDELT Cloud (gdeltcloud.com) is a different, paid product** — don't confuse it. |
| **SEC EDGAR** | US disclosures, distress signals, US public-co beneficial ownership (13D/G, Form 4) | ✅ yes | **User-Agent header required** (`AppName/1.0 email@domain.com`) | 10 req/sec → IP block ~10 min | ⚠ Rate-limit = **429**; missing User-Agent = **403** (distinct). ✅ EFTS full-text search **does** support a `ciks` param — must be **10-digit zero-padded** (`0000320193`, not `320193` → 500). ⚠ EFTS field names: `adsh` (not `accession_no`), `file_date` (not `filed_at`), `period_ending` (not `period_of_report`). US registrants only. |
| **CourtListener / RECAP** | US litigation & bankruptcy | ✅ free account + token | token in `Authorization` header (anonymous access removed) | **5 req/min · 50 req/hr · 125 req/day** — very tight | ⚠ `/recap-query/` endpoint is **restricted** (select users only) — don't build on it. Use `party:`, `dateFiled:`, `firm:` operators. Treat as **on-demand enrichment**, never bulk. |
| **Wikidata SPARQL** | Enrichment: PEP flags (CC0!), public-co metadata, LEI cross-ref | ✅ yes | none | 60s query-time/min budget; service degraded in 2025-26 | Use for **PEP screening without OpenSanctions' license** (query `wdt:P39` position-held). Enrichment only — slow, don't put on the hot path. |

> **The free UBO answer is split, not single-source:** GLEIF gives the *entity* ownership chain (corporate parents), **Companies House PSC** gives the *natural-person* UBO (for UK), and SEC 13D/G covers US public-co large holders. There is no single free global UBO feed — the product's value is **stitching these together with entity resolution**.

---

## 3. What we dropped and why

The brief assumed some of these were free. Verification says otherwise — building on them would either break or violate terms:

| Source | Verdict | Replace with |
|--------|---------|--------------|
| **OpenCorporates** | ❌ **NOT free for our use case.** Official terms: *"financial institutions, corporations, government departments and regulatory authorities are NOT Permitted Users."* Free at-scale access is journalists/NGOs/academics only. Paid plans start **£2,250/yr**. Default account = 200 req/mo + ODbL share-alike. | **Companies House** (UK UBO) + **GLEIF** (global corporate ownership) + national registries case-by-case |
| **OpenOwnership / BODS bulk** | ⚠ Free (CC0) but **stale** — register closed Nov 2024; bulk download last updated **March 2025** and now only contains GLEIF + UK PSC. | Live **Companies House API** (real-time PSC) |
| **OpenSanctions** | ⚠ **CC BY-NC** — non-commercial only; commercial needs a paid license. KYB graph API **shut down Dec 2025**. `wd_peps` is **not** CC0 either. | OK for a *non-commercial portfolio demo* with attribution; for PEP use **Wikidata SPARQL** (CC0) instead |
| **EU UBO registers** (Denmark CVR, Luxembourg, Germany, Austria, Belgium…) | ❌ Restricted to "legitimate interest" post-CJEU C-37/20 / AMLD6 (Denmark locked down Sep 2025). | Don't assume free EU beneficial ownership. UK remains open via PSC. |

**npm libraries the research recommended that are actually dead** (use the right-hand column):

| Avoid | Why | Use instead |
|-------|-----|-------------|
| `vader-sentiment` | 8 yrs unmaintained, ESM compat unverified | **`sentiment`** (AFINN-165, maintained, ESM) or `wink-sentiment` |
| `string-similarity` | officially deprecated | `fastest-levenshtein` / `natural` (Jaro-Winkler) |
| `talisman` | abandoned (5 yrs) | `natural`, `fastest-levenshtein` |
| Sequelize **v7** | alpha, not production-ready | **Sequelize v6** (what the template already uses ✅) |
| Fuse.js `tokenize: true` | wrong API in v7 | `useTokenSearch: true` |
| FinBERT via HF "unlimited free" | that tier no longer exists; now $0.10/mo credit | Optional enhancement only; default to local `sentiment` |

---

## 4. Architecture

Extends the existing template — no new services, no new infra cost.

```
frontend (React+Vite)
   │  GET /api/companies/search?q=
   │  POST /api/dossiers           { query }      ← kicks off a dossier build
   │  GET  /api/dossiers/:id                       ← poll/fetch assembled dossier
   ▼
backend (Express ESM)
   ├── routes/            thin HTTP layer
   ├── services/
   │     ├── sources/     one client per provider (gleif, companiesHouse, gdelt, sec, courtlistener, wikidata)
   │     ├── resolver/    entity resolution (normalize → block → match → merge w/ provenance)
   │     ├── graph/       ownership-graph assembly + traversal
   │     └── adverse/     GDELT fetch → disambiguate → score → guardrail
   ├── models/            Sequelize models (§5)
   └── db.js              (already exists) SQLite local / Postgres on Render
```

**Build strategy: cache, don't proxy.** Each source client fetches → normalizes → **persists** into our own tables. The dossier is assembled from *our* DB, so:
- rate limits (CourtListener's 125/day!) are respected — we fetch once and reuse;
- everything has a provenance row (source + `fetched_at`);
- the demo is fast and works offline of provider hiccups (GDELT 429s).

**Dossier build = a job, not a request.** `POST /api/dossiers` creates a dossier row with `status: "building"` and fans out source fetches; the frontend polls `GET /api/dossiers/:id`. (MVP: do it synchronously with a simple in-process queue; no external worker/Redis needed for free tier.)

---

## 5. Data model (Sequelize v6)

Dialect-agnostic so it runs on SQLite locally and Postgres on Render. Use `JSON` columns (Sequelize maps to JSONB on PG, TEXT-JSON on SQLite) for raw payloads.

```
Entity            id, name, normalized_name, jurisdiction, entity_type,
                  lei, company_number, cik, status, raw(JSON)
Person            id, name, normalized_name, dob_year, nationality, is_pep(bool)
Edge              id, from_id, from_type(entity|person), to_id, to_type,
                  relationship(IS_DIRECTLY_CONSOLIDATED_BY|IS_ULTIMATELY_CONSOLIDATED_BY|
                               PSC_OWNERSHIP|PSC_CONTROL|...),
                  ownership_pct(nullable), source, fetched_at
SourceRecord      id, entity_id, source(gleif|companies_house|gdelt|sec|courtlistener),
                  source_ref, payload(JSON), fetched_at        ← provenance for every fact
AdverseArticle    id, entity_id, url, title, domain, language, source_country,
                  seen_date, tone(float, nullable), risk_category, is_adverse(bool),
                  relevance_score, snippet
Litigation        id, entity_id, court, case_name, case_type, nature_of_suit,
                  date_filed, is_bankruptcy, chapter, source_ref      (phase 4)
Filing            id, entity_id, form, filed_at, distress_flags(JSON), source_ref  (phase 4)
Dossier           id, query, root_entity_id, status(building|ready|partial|error),
                  match_coverage_pct, false_flag_estimate, created_at, completed_at
```

**Ownership graph in Postgres:** plain adjacency (`Edge` table). Traverse in app code for the MVP (depths are shallow), or a **recursive CTE** on Postgres when you want server-side tree assembly. No graph database needed — Render free Postgres is enough.

---

## 6. Backend — module by module

### 6.1 Source clients (`services/sources/`)
Each exports `search(query)` and `fetchDetails(id)`, returns **normalized** objects + the raw payload for `SourceRecord`.

- **`gleif.js`** — `GET https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=…` (and `filter[q]=` fuzzy, `fuzzy-completions` for autocomplete). For ownership: read the `relationships` object, then follow `/direct-parent`, `/ultimate-parent`, `/direct-children`. **Handle the 404-on-exception case**: if `relationships.direct-parent` points to a `reporting-exception`, fetch that and record the exception code (`NO_LEI`, `NATURAL_PERSONS`, `NON_PUBLIC`…) — **an exception is itself a transparency risk signal.** Follow 302 redirects if you use Golden Copy bulk files.
- **`companiesHouse.js`** — Basic Auth (`key:` as username, blank password). `GET /search/companies?q=`, `/company/{num}`, `/company/{num}/persons-with-significant-control` (**the UBO data**), `/officers`. Map the 8 status values to a risk badge.
- **`gdelt.js`** — see §6.4. DOC 2.0 `ArtList` for the article list + CONTEXT 2.0 for snippets + `TimelineTone` for the tone trend.
- **`sec.js`** — set `User-Agent`. CIK lookup via `company_tickers.json`; `GET https://data.sec.gov/submissions/CIK{10digit}.json`; EFTS full-text `https://efts.sec.gov/LATEST/search-index?q="going concern"&forms=10-K&ciks=0000320193`. Distress signals: going-concern language, NT (late) filings, specific 8-K items. Parse with the **corrected field names** (`adsh`, `file_date`, `period_ending`).
- **`courtlistener.js`** — token in header. `GET /api/rest/v4/search/?type=r&q=party:("Acme Corp")&filed_after=…`. **Strict client-side rate limiter** (≤ 5/min). On-demand only.
- **`wikidata.js`** — SPARQL for PEP check (`wdt:P39 position held`) and LEI/metadata enrichment. Cache hard; never on the hot path.

### 6.2 Entity resolution (`services/resolver/`)
The senior-skill centerpiece. Pipeline:
1. **Normalize** — lowercase, strip legal suffixes (Ltd/Inc/GmbH/SA…), collapse punctuation/whitespace, transliterate.
2. **Strong-key match first** — if LEI / company number / CIK present, exact-join (authoritative, no fuzz).
3. **Block** — candidate-narrow by jurisdiction + first token, to avoid O(n²).
4. **Fuzzy match** — Jaro-Winkler (`natural`) + Levenshtein (`fastest-levenshtein`) on normalized names; threshold + address corroboration.
5. **Merge with provenance** — one canonical `Entity`, every contributing source kept in `SourceRecord`. Conflicts kept side-by-side, newest `fetched_at` wins for display.
6. **Compute `match_coverage_pct`** = resolved entities / total referenced entities → the **input metric**.

### 6.3 Ownership graph (`services/graph/`)
Assemble `Entity`/`Person` nodes + `Edge`s from GLEIF (entity chain) and Companies House PSC (natural-person UBO). Mark where a chain **terminates in an exception** (e.g., `NATURAL_PERSONS`, `NO_LEI`) vs. resolves to a real owner — surface that distinction in the UI. Provide `getOwnershipTree(rootId, depth)` (app-side BFS or PG recursive CTE).

### 6.4 Adverse media + guardrail (`services/adverse/`)
This is where the **false-flag guardrail** lives.
1. **Fetch** — GDELT DOC `mode=ArtList&format=json&sourcelang=english&timespan=3m&sort=ToneAsc` with the company as a quoted phrase. (English-only because the scorer is English-only.)
2. **Disambiguate** (the #1 false-flag source) — require company context: use the `near:N` proximity operator (company token near a risk keyword), filter on domain/country, drop obvious homonyms. Don't trust raw keyword hits.
3. **Get text to score** — ArtList has **no snippet**; call **CONTEXT 2.0 API** (`/api/v2/context/context`) for the matching sentence, or fetch the article URL as a fallback.
4. **Score** — `sentiment` (AFINN) on title + snippet → tone; classify `risk_category` (fraud / litigation / insolvency / regulatory / scandal) by keyword+context.
5. **Guardrail filters** — dedup by URL/title (no `dropdup` in DOC v2 — do it in code), source-credibility weighting, require the company to be the **subject** not a passing mention, relevance threshold. Track an estimated false-flag rate.
6. **Tone trend** — separate `TimelineTone` call for the sparkline (since per-article tone isn't in ArtList). Note practical tone range is ~ −10…+10, not −100…+100.

### 6.5 API endpoints (add to existing `server.js`)
```
GET  /api/health                         (exists)
GET  /api/companies/search?q=            → resolver candidate list (GLEIF + CH)
POST /api/dossiers        {query}        → create + start build, returns {id, status}
GET  /api/dossiers/:id                   → dossier w/ entity, ownership graph, adverse[]
GET  /api/dossiers/:id/ownership         → graph nodes+edges (for the viz)
GET  /api/dossiers/:id/adverse           → scored article feed
```

---

## 7. Frontend (React + Vite)

Keep the template's single-page simplicity; add:
- **`SearchBar`** → calls `/api/companies/search`, shows resolved candidates with the source badges.
- **`Dossier`** page — polls `/api/dossiers/:id` until `ready`/`partial`.
- **`OwnershipGraph`** — nodes = entities/persons, edges labelled with relationship + % where known; exceptions rendered as dashed "undisclosed" nodes. Use a small free lib (**react-flow** or **vis-network**) — both MIT.
- **`AdverseFeed`** — timeline list, each item: title, source domain, date, tone chip (red/grey/green), risk-category tag, link out. Header counts: "⚠ N adverse · M neutral". A tone sparkline from `TimelineTone`.
- **Provenance everywhere** — every panel shows "source · fetched 2d ago".

---

## 8. Delivery slices

| Phase | Deliverable | Sources | Done-when |
|-------|-------------|---------|-----------|
| **0** ✅ | Full-stack template (done in this repo) | — | boots, `/api/health` green |
| **1** | Company **search + identity resolution** | GLEIF + Companies House | type a name → resolved entity card with LEI/number, status, matched-source badges; `match_coverage_pct` computed |
| **2** | **Ownership graph** (MVP half #1) | GLEIF Level 2 + CH PSC | dossier shows an ownership tree to natural-person UBO (UK) or to a labelled exception; viz renders |
| **3** | **Adverse-media scan** (MVP half #2) | GDELT DOC + CONTEXT + Timeline | dossier shows scored adverse feed + tone trend; guardrail (disambiguation/dedup/relevance) live; false-flag estimate shown |
| **4a** | **Litigation** glue | CourtListener | bankruptcy/lawsuit hits by party, last-5-years filter |
| **4b** | **Financial distress** glue | SEC EDGAR | going-concern / late-filing / 8-K distress flags for US registrants |
| **4c** | **PEP enrichment** | Wikidata SPARQL | UBO persons flagged if politically exposed |

**Ship Phase 1→3 = the demoable MVP.** 4a/4b/4c are independent add-ons.

---

## 9. Dependencies to add

```jsonc
// backend
"node-fetch"            // or native fetch (Node 20 has it) — follow redirects for GLEIF Golden Copy
"sentiment"            // adverse-media tone (maintained, ESM)
"natural"              // Jaro-Winkler for entity resolution
"fastest-levenshtein" // fast edit distance
"p-limit"             // throttle source calls (CourtListener!)
// frontend
"reactflow"           // ownership graph viz (MIT)
```
No paid keys. Companies House + CourtListener need **free** self-service keys/tokens (env vars, wired like `DATABASE_URL`). Add to `.env.example`:
```
COMPANIES_HOUSE_API_KEY=
COURTLISTENER_TOKEN=
SEC_USER_AGENT=YourApp/1.0 you@email.com
```

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **No single free global UBO source** | Stitch GLEIF (corporate) + CH PSC (UK natural persons) + SEC 13D/G (US public); be explicit in UI about coverage by jurisdiction. |
| **GDELT sparse for SMEs / non-US** | Show "no significant coverage" honestly rather than a false all-clear; note GDELT's US/English bias. |
| **False adverse flags** (the guardrail) | Disambiguation + proximity + subject-not-mention + dedup + source weighting; surface a confidence, never assert guilt. |
| **CourtListener 125 req/day** | Cache aggressively; on-demand per dossier; `p-limit`; never bulk. |
| **Provider drift** (endpoints/limits change) | All access behind one client module per source + `SourceRecord` raw payloads → easy to adapt; provenance timestamps make staleness visible. |
| **EU UBO legally restricted** | Don't attempt; document the AMLD6 limitation. UK PSC is the open exception. |
| **Licensing** (OpenSanctions NC, OpenCorporates terms) | Excluded from the build; PEP via CC0 Wikidata. Keep the demo non-commercial-clean. |

---

## 11. Positioning (portfolio framing)

Competitors (Middesk, Sayari, D&B, Moody's/Kompany) are **all paid, no free tier** — the space is occupied, so this is a **portfolio showcase**, not a market entrant. Lead with the senior skill that's visible without a data moat:

> **"Multi-source entity resolution + beneficial-ownership graph + provenance-tracked dossier — assembled entirely from open data."**

Differentiator for a demo: the **entity-resolution + graph stitching across heterogeneous free sources**, with honest coverage/provenance — exactly the hard part the commercial tools hide behind their data licenses. Don't claim global UBO completeness or sanctions coverage (we don't do sanctions, and free UBO is jurisdiction-limited).

---

## 12. API quick-reference (verified June 2026)

```
# GLEIF — entity + ownership (no key)
GET https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=Acme
GET https://api.gleif.org/api/v1/lei-records/{LEI}/ultimate-parent      # 404 if only an exception exists
GET https://api.gleif.org/api/v1/lei-records/{LEI}/direct-children
GET https://api.gleif.org/api/v1/fuzzy-completions?field=fulltext&q=acme

# Companies House — UK UBO (Basic Auth: key as username, blank password)
GET https://api.company-information.service.gov.uk/search/companies?q=acme
GET https://api.company-information.service.gov.uk/company/{num}/persons-with-significant-control

# GDELT — adverse media (no key)  [ArtList = metadata only, ≤250, last 3mo]
GET https://api.gdeltproject.org/api/v2/doc/doc?query="Acme Corp" sourcelang:english&mode=ArtList&format=json&timespan=3m&sort=ToneAsc
GET https://api.gdeltproject.org/api/v2/context/context?query="Acme Corp"&format=json   # snippets
GET https://api.gdeltproject.org/api/v2/doc/doc?query="Acme Corp"&mode=TimelineTone&format=json

# SEC EDGAR — distress (User-Agent header required)
GET https://data.sec.gov/submissions/CIK0000320193.json
GET https://efts.sec.gov/LATEST/search-index?q="going concern"&forms=10-K&ciks=0000320193   # ciks zero-padded!

# CourtListener — litigation (token header; ≤5/min, ≤125/day)
GET https://www.courtlistener.com/api/rest/v4/search/?type=r&q=party:("Acme Corp")&filed_after=2021-01-01
```

> Field-name reminders: GDELT ArtList has **no** `snippet`/`tone` (use CONTEXT / TimelineTone). SEC EFTS uses `adsh` / `file_date` / `period_ending`. GLEIF relationship types: `IS_DIRECTLY_CONSOLIDATED_BY`, `IS_ULTIMATELY_CONSOLIDATED_BY`.
