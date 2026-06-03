import { DataTypes } from "sequelize";

export default function defineAdverseArticle(sequelize) {
  return sequelize.define(
    "AdverseArticle",
    {
      entityId: { type: DataTypes.INTEGER, allowNull: false },
      url: { type: DataTypes.STRING(1024), allowNull: false },
      title: DataTypes.STRING(1024),
      domain: DataTypes.STRING,
      language: DataTypes.STRING,
      sourceCountry: DataTypes.STRING,
      seenDate: DataTypes.DATE,
      tone: DataTypes.FLOAT,
      riskCategory: DataTypes.STRING,
      isAdverse: { type: DataTypes.BOOLEAN, defaultValue: false },
      relevanceScore: DataTypes.FLOAT,
      snippet: DataTypes.TEXT,
    },
    { tableName: "adverse_articles", indexes: [{ fields: ["entityId"] }] }
  );
}
