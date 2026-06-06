// DATABASE_URL drives dialect selection so the same config works locally (SQLite) and on Render (Postgres)
import { Sequelize } from "sequelize";

const url = process.env.DATABASE_URL || "";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

let sequelize;
let dbKind;

if (isPostgres) {
  dbKind = "postgres";
  // Enable SSL only when the connection string requests it (e.g. Neon, Render).
  // Local/Coolify Postgres containers don't support SSL, so don't force it.
  const requireSsl = url.includes("sslmode=require") || url.includes("ssl=true");
  sequelize = new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    ...(requireSsl && {
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: true },
      },
    }),
  });
} else {
  dbKind = "sqlite";
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: process.env.SQLITE_PATH || "./data.sqlite",
    logging: false,
  });
}

export { sequelize, dbKind };
