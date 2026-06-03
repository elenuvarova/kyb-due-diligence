import express from "express";
import { Dossier } from "../models/index.js";
import { searchCompanies, buildDossier } from "../services/dossier/index.js";

const router = express.Router();

const EMPTY_RESULT = {
  rootEntity: null,
  ownership: { nodes: [], edges: [] },
  adverse: { articles: [], counts: { adverse: 0, neutral: 0, total: 0 }, toneTrend: [] },
  litigation: { cases: [], counts: { total: 0, bankruptcies: 0 }, note: null },
  distress: { flags: [], filings: [], cik: null },
  sources: [],
};

router.get("/companies/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  try {
    res.json({ results: await searchCompanies(q) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/dossiers", async (req, res) => {
  const query = (req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });
  try {
    const dossier = await Dossier.create({ query, status: "building" });
    // Build in the background; the client polls GET /api/dossiers/:id.
    buildDossier(dossier.id).catch((e) => console.error("[dossier] async build error:", e));
    res.status(201).json({ id: dossier.id, status: dossier.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/dossiers/:id", async (req, res) => {
  // The PK is an integer; a non-numeric id would raise a DB type error (500) on Postgres,
  // so reject it as a clean 404 before querying.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ error: "dossier not found" });
  }
  try {
    const d = await Dossier.findByPk(id);
    if (!d) return res.status(404).json({ error: "dossier not found" });
    const result = d.result || EMPTY_RESULT;
    res.json({
      id: d.id,
      query: d.query,
      status: d.status,
      matchCoveragePct: d.matchCoveragePct,
      falseFlagEstimate: d.falseFlagEstimate,
      error: d.error,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
