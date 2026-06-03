import { DataTypes } from "sequelize";

export default function defineDossier(sequelize) {
  return sequelize.define(
    "Dossier",
    {
      query: { type: DataTypes.STRING, allowNull: false },
      rootEntityId: DataTypes.INTEGER,
      status: { type: DataTypes.STRING, defaultValue: "building" },
      matchCoveragePct: DataTypes.FLOAT,
      falseFlagEstimate: DataTypes.FLOAT,
      error: DataTypes.TEXT,
      completedAt: DataTypes.DATE,
      result: DataTypes.JSON,
    },
    { tableName: "dossiers" }
  );
}
