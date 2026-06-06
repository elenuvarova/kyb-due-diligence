import express from "express";
import rateLimit from "express-rate-limit";
import { Dossier } from "../models/index.js";
import { searchCompanies, buildDossier } from "../services/dossier/index.js";

const router = express.Router();

// Loose global limiter for all /api traffic — a backstop against runaway clients.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many requests" },
});

// Strict limiter for the expensive dossier build (fans out to several third-party APIs).
const dossierLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many requests" },
});

router.use(apiLimiter);

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
  if (q.length > 200) return res.status(400).json({ error: "query too long" });
  try {
    res.json({ results: await searchCompanies(q) });
  } catch (e) {
    console.error("[api] companies/search failed:", e);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/dossiers", dossierLimiter, async (req, res) => {
  const query = (req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });
  if (query.length > 200) return res.status(400).json({ error: "query too long" });
  try {
    const dossier = await Dossier.create({ query, status: "building" });
    // Build in the background; the client polls GET /api/dossiers/:id.
    buildDossier(dossier.id).catch((e) => console.error("[dossier] async build error:", e));
    res.status(201).json({ id: dossier.id, status: dossier.status });
  } catch (e) {
    console.error("[api] dossier create failed:", e);
    res.status(500).json({ error: "internal error" });
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
    console.error("[api] dossier fetch failed:", e);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
