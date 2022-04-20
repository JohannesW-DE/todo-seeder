import neo4j from 'neo4j-driver'

import { QueryTypes } from 'sequelize';

import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { MongooseUserWO } from '../mongoose/models/UserWO';
import mongoose from 'mongoose';

require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

/**
 * Die Idee: Die Datenbank jeweils komplett clearen, wobei jeder Benutzer einzeln gelöscht wird.
 * 
 * Dabei soll berücksichtigt werden dass keine Karteileichen übrig bleiben (z.B. ObjectIds von bereits gelöschten Benutzern in
 * den users-Arrays von Todos der MongoDB).
 * 
 * Das Löschen der Benutzer startet beim zuletzt eingefügten.
 */

console.log("Testcase: DELETE")

const ids = [...Array(+(process.env.DB!)).keys()].map((e) => e + 1).reverse(); // 1 ... Anzahl der Benutzer (5, 50, 500, 5000)

(async () => {
  // MariaDB
  console.log("MariaDB");

  console.time("MariaDB");

  for (const id of ids) {  
    const result = await sequelize.query(
      `DELETE FROM \`user\` WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
  }

  console.timeEnd("MariaDB");

  // Neo4J
  console.log("Neo4j");

  console.time("Neo4j");

  const session = driver.session();

  try {  
    for (const id of ids) {  
      const query = `
        MATCH (user: User {id: $id})-[r:CREATED]->(entry)
        DETACH DELETE user, entry
      `;   

      const result = await session.run(query, { id });
    }
  } finally {
    await session.close();
    console.timeEnd("Neo4j");
  }

  // MongoDB
  console.log("MongoDB");

  const pipeline = [
    {
      '$project': {
        '_id': 1
      }
    }
  ]
  const result = await MongooseUserWO.aggregate(pipeline).exec();
  const userIds = result.map((e) => e._id).reverse();

  console.time("MongoDB");

  for (const userId of userIds) {  
    const removeUsersDocument = await MongooseTodoWO.updateMany({}, { $pull: { users: userId } });
    const removeTodosDocument = await MongooseTodoWO.deleteMany({ user: userId});
    const removeUserDocument = await MongooseUserWO.deleteOne({ _id: userId });
  }

  console.timeEnd("MongoDB"); 
})();
