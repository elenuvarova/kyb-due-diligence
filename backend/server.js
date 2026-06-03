import express from "express";
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

app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: dbKind });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from the backend 👋" });
});

app.use("/api", apiRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
}

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
