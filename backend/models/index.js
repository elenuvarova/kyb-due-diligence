import { sequelize } from "../db.js";
import defineEntity from "./entity.js";
import definePerson from "./person.js";
import defineEdge from "./edge.js";
import defineSourceRecord from "./sourceRecord.js";
import defineAdverseArticle from "./adverseArticle.js";
import defineLitigation from "./litigation.js";
import defineDossier from "./dossier.js";

const Entity = defineEntity(sequelize);
const Person = definePerson(sequelize);
const Edge = defineEdge(sequelize);
const SourceRecord = defineSourceRecord(sequelize);
const AdverseArticle = defineAdverseArticle(sequelize);
const Litigation = defineLitigation(sequelize);
const Dossier = defineDossier(sequelize);

Dossier.belongsTo(Entity, { as: "rootEntity", foreignKey: "rootEntityId" });
Entity.hasMany(SourceRecord, { foreignKey: "entityId" });
SourceRecord.belongsTo(Entity, { foreignKey: "entityId" });
Entity.hasMany(AdverseArticle, { foreignKey: "entityId" });
AdverseArticle.belongsTo(Entity, { foreignKey: "entityId" });
Entity.hasMany(Litigation, { foreignKey: "entityId" });
Litigation.belongsTo(Entity, { foreignKey: "entityId" });

export { sequelize, Entity, Person, Edge, SourceRecord, AdverseArticle, Litigation, Dossier };
