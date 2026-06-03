import { DataTypes } from "sequelize";

export default function defineLitigation(sequelize) {
  return sequelize.define(
    "Litigation",
    {
      entityId: { type: DataTypes.INTEGER, allowNull: false },
      caseName: DataTypes.STRING(1024),
      court: DataTypes.STRING,
      dateFiled: DataTypes.DATEONLY,
      docketNumber: DataTypes.STRING,
      suitNature: DataTypes.STRING,
      chapter: DataTypes.STRING,
      isBankruptcy: { type: DataTypes.BOOLEAN, defaultValue: false },
      url: DataTypes.STRING(1024),
    },
    { tableName: "litigation", indexes: [{ fields: ["entityId"] }] }
  );
}
