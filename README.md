# KYB — Counterparty Due-Diligence

Pull a company → **ownership structure (UBO)** + **adverse-media background**, with sources. A KYB ("Know Your Business") tool that helps answer *"Is this company who it claims to be, and is it risky to work with them?"* — focused on ownership transparency, adverse media, litigation, and financial distress. **Not** sanctions screening.

Everything runs on **free, open data** and deploys free on Render. Built on a React + Vite frontend, an Express (ES modules) backend, and Sequelize (SQLite locally → PostgreSQL on Render).

> Full design rationale, the fact-checked data-source decisions, and the phased roadmap are in **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)**.

## What it does

- **Search** a company (by name or LEI) across multiple registries.
- **Entity resolution** — match the same company across sources via strong keys (LEI / company number / CIK) and fuzzy name matching, merged into one canonical record with a coverage %.
- **Ownership graph** — corporate parents/subsidiaries from **GLEIF** Level-2, plus real natural-person beneficial owners (**PSC**) from **UK Companies House** when configured. Undisclosed ownership (GLEIF reporting exceptions like `NATURAL_PERSONS`) is shown as a dashed node — itself a transparency signal.
- **Adverse-media scan** — recent negative news from **GDELT** with tone scoring, risk categorization, and a **false-flag guardrail** (entity disambiguation, dedup, relevance filtering) to avoid flagging benign or same-named-company news.
- **Litigation & bankruptcy (US)** — court and bankruptcy filings where the company is a party, from **CourtListener / RECAP** (when a free token is set), with the same relevance filtering.

## Stack & data sources

- **Frontend:** React 18 + Vite 5 (JavaScript), ownership graph via `reactflow`.
- **Backend:** Node.js + Express, ES modules. All DB access through **Sequelize** — SQLite locally, PostgreSQL on Render (chosen automatically from `DATABASE_URL`).
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
├── Dockerfile · render.yaml · .env.example
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

> **⚠️ iCloud Drive note:** if this repo lives in an iCloud Drive folder, macOS "Optimize Mac Storage" may evict `node_modules` files to cloud-only state, which can make `node` hang on import. If the backend hangs on boot, either move the project out of iCloud, or run `rm -rf backend/node_modules && cd backend && npm install` to re-materialize local files. This never affects the Render deploy.

## Deploy to Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, connect the repo. `render.yaml` provisions a free web service + free Postgres; `DATABASE_URL` is wired automatically.
3. To enable the optional sources in production, add their free keys as environment variables on the web service (`COMPANIES_HOUSE_API_KEY`, `SEC_USER_AGENT`, `COURTLISTENER_TOKEN`).

**Free-tier notes:** the web service sleeps after inactivity (~30s cold start); Render's free Postgres expires after 30 days.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | DB connectivity check → `{ status, db }` |
| `GET` | `/api/companies/search?q=` | Candidate companies for a query |
| `POST` | `/api/dossiers` `{ query }` | Start a dossier build → `{ id, status }` |
| `GET` | `/api/dossiers/:id` | Dossier: root entity, ownership graph, adverse media, coverage (poll while `building`) |

A dossier builds asynchronously: `POST` returns immediately with `status: "building"`; the client polls `GET /api/dossiers/:id` until `ready` / `partial` / `error`.
