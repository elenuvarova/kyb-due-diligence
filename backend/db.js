// DATABASE_URL drives dialect selection so the same config works locally (SQLite) and on Render (Postgres)
import { Sequelize } from "sequelize";

const url = process.env.DATABASE_URL || "";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

let sequelize;
let dbKind;

if (isPostgres) {
  dbKind = "postgres";
  sequelize = new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
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
