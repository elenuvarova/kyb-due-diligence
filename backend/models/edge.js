import { DataTypes } from "sequelize";

// Polymorphic ownership/control edge: a node (entity|person) -> another node.
// Queried manually by from/to ids rather than via Sequelize associations.
export default function defineEdge(sequelize) {
  return sequelize.define(
    "Edge",
    {
      fromType: { type: DataTypes.STRING, allowNull: false },
      fromId: { type: DataTypes.INTEGER, allowNull: false },
      toType: { type: DataTypes.STRING, allowNull: false },
      toId: { type: DataTypes.INTEGER, allowNull: false },
      relationship: { type: DataTypes.STRING, allowNull: false },
      ownershipPct: DataTypes.FLOAT,
      source: DataTypes.STRING,
      sourceRef: DataTypes.STRING,
      fetchedAt: DataTypes.DATE,
    },
    {
      tableName: "edges",
      indexes: [
        { fields: ["fromType", "fromId"] },
        { fields: ["toType", "toId"] },
      ],
    }
  );
}
