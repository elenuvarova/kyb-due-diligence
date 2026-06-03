import { DataTypes } from "sequelize";

export default function definePerson(sequelize) {
  return sequelize.define(
    "Person",
    {
      name: { type: DataTypes.STRING, allowNull: false },
      normalizedName: { type: DataTypes.STRING, allowNull: false },
      nationality: DataTypes.STRING,
      birthYear: DataTypes.INTEGER,
      isPep: { type: DataTypes.BOOLEAN, defaultValue: false },
      raw: DataTypes.JSON,
    },
    { tableName: "persons", indexes: [{ fields: ["normalizedName"] }] }
  );
}
