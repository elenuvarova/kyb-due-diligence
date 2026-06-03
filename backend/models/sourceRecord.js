import { DataTypes } from "sequelize";

// Provenance: every fact in a dossier traces back to one of these.
export default function defineSourceRecord(sequelize) {
  return sequelize.define(
    "SourceRecord",
    {
      entityId: DataTypes.INTEGER,
      source: { type: DataTypes.STRING, allowNull: false },
      sourceRef: DataTypes.STRING,
      payload: DataTypes.JSON,
      fetchedAt: DataTypes.DATE,
    },
    { tableName: "source_records", indexes: [{ fields: ["entityId"] }] }
  );
}
