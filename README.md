# KYB — Counterparty Due-Diligence

Pull a company → **ownership structure (UBO)** + **adverse-media background**, with sources. A KYB ("Know Your Business") tool that helps answer *"Is this company who it claims to be, and is it risky to work with them?"* — focused on ownership transparency, adverse media, litigation, and financial distress. **Not** sanctions screening.

Everything runs on **free, open data**. It deploys as a single container (Dockerfile build pack) on Coolify, backed by a Coolify-managed Postgres. Built on a React + Vite frontend, an Express (ES modules) backend, and Sequelize (SQLite locally → PostgreSQL in production).

> Full design rationale, the fact-checked data-source decisions, and the phased roadmap are in **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)**.

## What it does

- **Search** a company (by name or LEI) across multiple registries.
- **Entity resolution** — match the same company across sources via strong keys (LEI / company number / CIK) and fuzzy name matching, merged into one canonical record with a coverage %.
- **Ownership graph** — corporate parents/subsidiaries from **GLEIF** Level-2, plus real natural-person beneficial owners (**PSC**) from **UK Companies House** when configured. Undisclosed ownership (GLEIF reporting exceptions like `NATURAL_PERSONS`) is shown as a dashed node — itself a transparency signal.
- **Adverse-media scan** — recent negative news from **GDELT** with tone scoring, risk categorization, and a **false-flag guardrail** (entity disambiguation, dedup, relevance filtering) to avoid flagging benign or same-named-company news.
- **Litigation & bankruptcy (US)** — court and bankruptcy filings where the company is a party, from **CourtListener / RECAP** (when a free token is set), with the same relevance filtering.

## Stack & data sources

- **Frontend:** React 18 + Vite 5 (JavaScript), ownership graph via `reactflow`.
- **Backend:** Node.js + Express, ES modules. All DB access through **Sequelize** — SQLite locally, PostgreSQL in production (chosen automatically from `DATABASE_URL`).
- **Free data sources** (verified June 2026):

| Source | Role | Key needed? |
|--------|------|-------------|
| **GLEIF** | Corporate ownership graph (LEI Level-2) | No |
| **GDELT** | Adverse media + tone | No |
| **UK Companies House** | Natural-person beneficial owners (PSC) | Free key (optional) |
| **SEC EDGAR** | US disclosures / distress signals | No (User-Agent only) |
| **CourtListener** | US litigation & bankruptcy | Free token (optional) |

The app works with **zero keys** (GLEIF + GDELT). Companies House / SEC / CourtListener light up automatically when their free keys are present in the environment; otherwise those sources stay dormant and the dossier is marked `partial`.

## Project structure

```text
.
├── backend/
│   ├── server.js              Express app + model sync
│   ├── db.js                  Sequelize instance (SQLite / Postgres)
│   ├── models/                Entity, Person, Edge, SourceRecord, AdverseArticle, Dossier
│   ├── routes/api.js          /api/companies/search, /api/dossiers
│   └── services/
│       ├── sources/           gleif · gdelt · companiesHouse · sec (+ http helper)
│       ├── resolver/          entity resolution (normalize · fuzzy · merge · coverage)
│       ├── graph/             ownership-graph assembly
│       ├── adverse/           adverse-media scoring + guardrail
│       └── dossier/           orchestration + persistence
├── frontend/
│   └── src/
│       ├── App.jsx            search ↔ dossier view switch
│       └── components/        SearchView · DossierView · OwnershipGraph · AdverseMedia · Badges
├── docs/IMPLEMENTATION_PLAN.md
├── Dockerfile · .env.example
```

## Local development

No database to install — SQLite is built in.

**Terminal 1 — backend:**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` → the backend on port 3001. Search a well-known company (e.g. *Apple Inc*, *HSBC*, *Tesco*) and open its dossier.

Optionally, copy `.env.example` to `backend/.env` and add the free **Companies House** key to enable UK beneficial-owner (PSC) data.

> **⚠️ iCloud Drive note:** if this repo lives in an iCloud Drive folder, macOS "Optimize Mac Storage" may evict `node_modules` files to cloud-only state, which can make `node` hang on import. If the backend hangs on boot, either move the project out of iCloud, or run `rm -rf backend/node_modules && cd backend && npm install` to re-materialize local files. This never affects the deployed container.

## Deploy (Coolify, single container)

The app ships as one Docker image built from the [Dockerfile](Dockerfile): a multi-stage build that compiles the Vite frontend, installs production-only backend deps, and runs `node server.js`, which serves both the `/api` routes and the built SPA on port **3001**. No nginx — Express is the edge (helmet, compression, static caching).

1. Push this repo to GitHub.
2. In Coolify: **New Resource → Docker / Dockerfile**, connect this repo. Build pack = Dockerfile; exposed port = **3001**.
3. Provision a **Coolify-managed Postgres** (or bring your own) and copy its internal connection string (`postgres://postgres:PASSWORD@CONTAINER_NAME:5432/postgres` — no `?sslmode=require` for Coolify-internal Postgres).
4. Set the environment variables in **Configuration → Environment Variables** (never in a file baked into the image):
   - `NODE_ENV=production`
   - `PORT=3001`
   - `DATABASE_URL=…` (the Postgres string above)
   - Optional source keys to light up extra data: `COMPANIES_HOUSE_API_KEY`, `SEC_USER_AGENT`, `COURTLISTENER_TOKEN`, `WIKIDATA_USER_AGENT`. Without them, GLEIF + GDELT still work; the dossier is marked `partial`.
5. Add the subdomain (Cloudflare A record → Coolify host) and set it under **Configuration → General → Domains**, then **Redeploy**.

Health is reported by the image's `HEALTHCHECK` (`wget` against `/api/health`, which pings the DB). The same `DATABASE_URL` works with any Postgres host — [db.js](backend/db.js) selects the dialect from it and only enables SSL when the string requests it (`sslmode=require` / `ssl=true`).

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | DB connectivity check → `{ status, db }` |
| `GET` | `/api/companies/search?q=` | Candidate companies for a query |
| `POST` | `/api/dossiers` `{ query }` | Start a dossier build → `{ id, status }` |
| `GET` | `/api/dossiers/:id` | Dossier: root entity, ownership graph, adverse media, coverage (poll while `building`) |

A dossier builds asynchronously: `POST` returns immediately with `status: "building"`; the client polls `GET /api/dossiers/:id` until `ready` / `partial` / `error`.
