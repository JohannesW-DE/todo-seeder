import neo4j from 'neo4j-driver'
import { QueryTypes } from 'sequelize';
import { hrtime } from 'process';
import sequelize from '../sequelize';
import fs from 'fs';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { MongooseUserWO } from '../mongoose/models/UserWO';
import { User } from '../sequelize/models/User';


require('dotenv').config({ path: './.env' })

// Connections (vorbereiten)
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
connect(process.env.MONGODB_URI!);

const NS_TO_MS = BigInt(1_000_000);

/**
 * Die Idee: Für alle Benutzer die ersten $LIMIT ungecheckten Todos nehmen und auf gecheckt setzen.
 * 
 * Wenn es weniger als $LIMIT ungecheckte Todos gibt ist das Okay und es werden dem entsprechend weniger Todos "umgeschaltet".
 * 
 * Das Updaten der Todos startet beim zuletzt eingefügten Benutzer.
 */

const LIMIT = 1;

(async () => {
  /**
   * Vorbereitungen
   */

  const mariaUsers = await User.findAll();
  const mariaUsersIds = mariaUsers.map((e) => e.getDataValue('id'));

  const mariaMap = new Map<number, number[]>();

  for (const userId of mariaUsersIds) {
    console.log(userId);
    const [results, metadata] = await sequelize.query(`SELECT * FROM \`todo\` WHERE \`user_id\` = ${userId} AND \`checked\` = 0 LIMIT ${LIMIT}`);
    const mariaTodoIds = results.map((e) => JSON.parse(JSON.stringify(e)).id);
    mariaMap.set(userId, mariaTodoIds)
  }

  console.log(mariaMap);

  const mongoMap = new Map<Types.ObjectId, Types.ObjectId[]>();

  const mongoUsers = await MongooseUserWO.aggregate([
    {
      '$project': {
        '_id': 1
      }
    }
  ]).exec();
  const mongoUserIds = mongoUsers.map((e) => e._id).reverse();

  for (const userId of mongoUserIds) {
    const mongoTodos = await MongooseTodoWO.aggregate([
      {
        '$match': {
          'user': userId,
          'checked': 0
        }
      }, {
        '$limit': LIMIT
      }, {
        '$project': {
          '_id': 1
        }
      }
    ]).exec();
    const mongoTodoIds = mongoTodos.map((e) => e._id)
    mongoMap.set(userId, mongoTodoIds)
  }

  /**
   * MariaDB
   */

  const mariaStart = hrtime.bigint();

  for (const [userId, todoIds] of mariaMap) {
    if (todoIds.length > 0) {
      console.log(userId, todoIds);
      const result = await sequelize.query('UPDATE \`todo\` SET \`checked\` = 1 WHERE \`id\` IN (:ids)',
        {
          replacements: { ids: todoIds },
          type: QueryTypes.UPDATE
        }
      );
    }
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
    for (const [userId, todoIds] of mariaMap) {
      const query = `
        UNWIND $ids AS id
        MATCH (todo:Todo {id: id})
        SET todo.checked = true
        RETURN todo
      `;   
      const result = await session.run(query, { ids: todoIds });
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

  for (const [userId, todoIds] of mongoMap) {    
    const updateDocument = await MongooseTodoWO.updateMany({ _id: { $in: todoIds }}, { $set: { checked: 1 } });
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|todos=${LIMIT}\r\n`;

  fs.appendFileSync(`benchmark_results/update.log`, line);
})();
