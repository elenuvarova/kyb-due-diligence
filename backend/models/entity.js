import { DataTypes } from "sequelize";

export default function defineEntity(sequelize) {
  return sequelize.define(
    "Entity",
    {
      name: { type: DataTypes.STRING, allowNull: false },
      normalizedName: { type: DataTypes.STRING, allowNull: false },
      jurisdiction: DataTypes.STRING,
      entityType: DataTypes.STRING,
      lei: { type: DataTypes.STRING, unique: true },
      companyNumber: DataTypes.STRING,
      cik: DataTypes.STRING,
      status: DataTypes.STRING,
      directParentException: DataTypes.STRING,
      ultimateParentException: DataTypes.STRING,
      raw: DataTypes.JSON,
    },
    { tableName: "entities", indexes: [{ fields: ["normalizedName"] }] }
  );
}
