import neo4j from 'neo4j-driver'

import { QueryTypes } from 'sequelize';
import fs from 'fs';
import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { MongooseUserWO } from '../mongoose/models/UserWO';
import mongoose from 'mongoose';
import { User } from '../sequelize/models/User';
import { hrtime } from 'process';

require('dotenv').config({ path: './.env' })

// Connections (vorbereiten)
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
connect(process.env.MONGODB_URI!);

const NS_TO_MS = BigInt(1_000_000);


/**
 * Die Idee: Die Datenbank jeweils komplett clearen, wobei jeder Benutzer einzeln gelöscht wird.
 * 
 * Dabei soll berücksichtigt werden dass keine Karteileichen übrig bleiben (z.B. ObjectIds von bereits gelöschten Benutzern in
 * den users-Arrays von Todos der MongoDB).
 * 
 * Das Löschen der Benutzer startet beim zuletzt eingefügten.
 */


(async () => {
  /**
   * Vorbereitungen
   */

  const mariaUsers = await User.findAll();
  const mariaUsersIds = mariaUsers.map((e) => e.getDataValue('id')).reverse();

  const pipeline = [
    {
      '$project': {
        '_id': 1
      }
    }
  ]
  const result = await MongooseUserWO.aggregate(pipeline).exec();
  const userIds = result.map((e) => e._id).reverse();

  /**
   * MariaDB
   */

  const mariaStart = hrtime.bigint();

  for (const id of mariaUsersIds) {  
    const result = await sequelize.query(`DELETE FROM \`user\` WHERE id = ${id}`);
  }

  const mariaEnd = hrtime.bigint();
  const mariaDiff = (mariaEnd - mariaStart) / NS_TO_MS;

  console.log(`MariaDB: ${mariaDiff} ms`);  

  /**
   * Neo4j
   */
  const neoStart = hrtime.bigint();

  const session = driver.session();

  try {  
    for (const id of mariaUsersIds) {  
      const query = `
        MATCH (user: User {id: $id})-[r:CREATED]->(entry)
        DETACH DELETE user, entry
      `;   
      const result = await session.run(query, { id });
    }
  } finally {
    await session.close();
  }

  const neoEnd = hrtime.bigint();
  const neoDiff = (neoEnd - neoStart) / NS_TO_MS;

  console.log(`Neo4j: ${neoDiff} ms`);  

  /**
   * MongoDB
   */

  const mongoStart = hrtime.bigint();

  for (const userId of userIds) {  
    const removeUsersDocument = await MongooseTodoWO.updateMany({}, { $pull: { users: userId } });
    const removeTodosDocument = await MongooseTodoWO.deleteMany({ user: userId});
    const removeUserDocument = await MongooseUserWO.deleteOne({ _id: userId });
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|users=${mariaUsersIds.length}\r\n`;

  fs.appendFileSync(`benchmark_results/delete.log`, line);
})();
