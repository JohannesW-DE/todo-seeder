import { hrtime } from 'process';
import fs from 'fs';
import assert from 'assert';

import neo4j, { ResultSummary } from 'neo4j-driver'

import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";

import sequelize from '../sequelize';
import { User } from '../sequelize/models/User';
import { Tag } from '../sequelize/models/Tag';
import { MongooseUserWO } from '../mongoose/models/UserWO';
import { UserUser } from '../sequelize/models/UserUser';


require('dotenv').config({ path: './.env' })

const NS_TO_MS = BigInt(1_000_000);

// Connections (vorbereiten)
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
connect(process.env.MONGODB_URI!);

/**
 * Testfall: Mit welchem Benutzer wurde ich am häufigsten zu einer Todo hinzugefügt?
 * 
 * Hier wird nicht der Sonderfall gehandhabt dass es mehrere Benutzer geben kann, es wird einfach der Erstbeste genommen.
 */

(async () => {

  /**
   * Vorbereitungen
   */

  const mariaUsers = await User.findAll();
  const mariaUsersIds = mariaUsers.map((e) => e.getDataValue('id'));

  const mongoUsers = await MongooseUserWO.find();
  const mongoUserIds = mongoUsers.map((e) => e._id);

  assert(mariaUsersIds.length === mongoUserIds.length);

  /**
   * MariaDB
   */

  const mariaStart = hrtime.bigint();

  for (const id of mariaUsersIds) { 
    const query = `
      SELECT *, COUNT(*) as \`count\` 
      FROM \`todo_user\` 
      JOIN user ON user.id = user_id
      WHERE \`todo_id\` IN (
        SELECT \`todo_id\` FROM \`todo_user\` WHERE user_id = ${id}
      )
      AND user_id != ${id}
      GROUP BY user_id
      ORDER BY \`count\`
      DESC LIMIT 1
    `;
  
    const [results, metadata] = await sequelize.query(query);
    //console.log("MariaDB", results[0]);
  }

  const mariaEnd = hrtime.bigint();
  const mariaDiff = (mariaEnd - mariaStart) / NS_TO_MS;

  console.log(`MariaDB: ${mariaDiff} ms`);  

  /**
   * Neo4j
   */

  const neoStart = hrtime.bigint();

  for (const id of mariaUsersIds) {  
    const query = `
      MATCH (user:User {id: ${id}})-[:ASSIGNED_TO]->(todo:Todo)
      WITH todo
      MATCH (otherUser: User)-[assignment:ASSIGNED_TO]->(todo)
      WHERE otherUser.id <> ${id}
      RETURN otherUser, count(otherUser) AS count
      ORDER BY count DESC
      LIMIT 1
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(query);
      //if (result.records.length > 0) {
      //  console.log("Neo4j", result.records[0].get('otherUser'), result.records[0].get('count'));
      //}
    } finally {
      await session.close()
    }
  }

  const neoEnd = hrtime.bigint();
  const neoDiff = (neoEnd - neoStart) / NS_TO_MS;

  console.log(`Neo4j: ${neoDiff} ms`);  

  /**
   * MongoDB
   */

  const mongoStart = hrtime.bigint();

  for (const id of mongoUserIds) {
    const pipeline = [
      {
        '$match': {
          'users': id
        }
      }, {
        '$unwind': {
          'path': '$users'
        }
      }, {
        '$match': {
          'users': {
            '$ne': id
          }
        }
      }, {
        '$group': {
          '_id': '$users', 
          'count': {
            '$sum': 1
          }
        }
      }, {
        '$limit': 1
      }, {
        '$lookup': {
          'from': 'wo_user', 
          'localField': '_id', 
          'foreignField': '_id', 
          'as': 'user'
        }
      }, {
        '$project': {
          'count': 1, 
          'user': {
            '$first': '$user'
          }
        }
      } 
    ];
    const result = await MongooseTodoWO.aggregate(pipeline).exec();
    //console.log("MongoDB: ", result);
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|queries=${mariaUsers.length}\r\n`;

  fs.appendFileSync(`benchmark_results/${mariaUsers.length}_8.log`, line);
})();