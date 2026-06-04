import express from "express";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { sequelize, dbKind } from "./db.js";
import "./models/index.js";
import apiRouter from "./routes/api.js";
import { isConfigured as chConfigured } from "./services/sources/companiesHouse.js";
import { isConfigured as secConfigured } from "./services/sources/sec.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Coolify/Traefik: trust the first proxy so secure cookies / HSTS / client IP work.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The ReactFlow ownership graph injects inline styles, so style-src needs 'unsafe-inline'.
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    // Tell browsers to stick to HTTPS (Traefik terminates TLS in front of us).
    hsts: { maxAge: 15552000, includeSubDomains: true },
  })
);
app.use(compression());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: dbKind });
  } catch (err) {
    console.error("[health] db check failed:", err);
    res.status(500).json({ status: "error" });
  }
});

app.use("/api", apiRouter);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "public");
  // Vite emits content-hashed asset filenames, so they're safe to cache for a year.
  app.use(express.static(publicDir, { maxAge: "1y", index: false }));
  // SPA fallback: serve index.html for any non-/api route. Never cache it so new
  // deploys (with new asset hashes) are picked up immediately.
  app.get("*", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Log async failures instead of crashing the process; one bad third-party fan-out
// should not take the whole server down.
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
});

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
  } catch (err) {
    console.error("Database init failed:", err.message);
  }
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`db: ${dbKind}`);
    const sources = ["gleif", "gdelt"];
    if (chConfigured()) sources.push("companies_house");
    if (secConfigured()) sources.push("sec");
    if (process.env.COURTLISTENER_TOKEN) sources.push("courtlistener");
    console.log(`sources enabled: ${sources.join(", ")}`);
  });
}

start();
