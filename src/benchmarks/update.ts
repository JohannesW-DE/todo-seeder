import neo4j from 'neo4j-driver'

import { QueryTypes } from 'sequelize';

import { hrtime } from 'process';

import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { MongooseUserWO } from '../mongoose/models/UserWO';
import mongoose from 'mongoose';
import { map } from 'benchmark';

require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

console.log('Testcase: UPDATE');

const LIMIT = 20;

(async () => {
  const userIds = [...Array(+(process.env.DB!)).keys()].map((e) => e + 1).reverse(); // 1...Anzahl der Benutzer (5, 50, 500, 5000)

  /**
   * MariDB
   */

  // Vorbereitung: Kostruktion einer Map user.id -> todo.id[]
  const mariaMap = new Map<number, number[]>();

  for (const userId of userIds) {
    const result = await sequelize.query(
      'SELECT * FROM \`todo\` WHERE \`user_id\` = :id AND \`checked\` = 0 LIMIT :limit',
      {
        replacements: { id: userId, limit: LIMIT },
        type: QueryTypes.SELECT
      }
    );
    const mariaTodoIds = result.map((e) => JSON.parse(JSON.stringify(e)).id);
    mariaMap.set(userId, mariaTodoIds)
  }

  // Execution

  console.log("MariaDB");

  console.time("MariaDB");
  const mariaStart = hrtime.bigint();


  for (const [userId, todoIds] of mariaMap) {
    if (todoIds.length > 0) {
      const result = await sequelize.query(
        'UPDATE \`todo\` SET \`checked\` = 1 WHERE \`id\` IN (:ids)',
        {
          replacements: { ids: todoIds },
          type: QueryTypes.UPDATE
        }
      );
    }
  }
  console.timeEnd("MariaDB");
  const mariaEnd = hrtime.bigint();
  console.log(`MariaDB: ${(mariaEnd - mariaStart) / BigInt(1000)} microseconds`)


  /**
   * Neo4j
   */

  // Vorbereitung nicht nötig, mariaMap IDs sind ja identisch!

  // Execution

  console.log("Neo4j");

  console.time("Neo4j");  
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

    console.timeEnd("Neo4j");
    const neoEnd = hrtime.bigint();
    console.log(`Neo4j: ${(neoEnd - neoStart) / BigInt(1000)} microseconds`)      
  }

  
  /**
   * MongoDB
   */

  // Vorbereitung: Kostruktion einer Map UserID -> TodoID[] für Mongos ObjectIds
  const mongoMap = new Map<Types.ObjectId, Types.ObjectId[]>();

  const mongoUsers = await MongooseUserWO.aggregate([
    {
      '$project': {
        '_id': 1
      }
    }
  ]).exec();
  const mongoUserIds = mongoUsers.map((e) => e._id).reverse();

  for (const mongoUserId of mongoUserIds) {
    const mongoTodos = await MongooseTodoWO.aggregate([
      {
        '$match': {
          'user': mongoUserId,
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
    mongoMap.set(mongoUserId, mongoTodoIds)
  }

  // Execution

  console.log("MongoDB");

  console.time("MongoDB");
  const mongoStart = hrtime.bigint();

  for (const [userId, todoIds] of mongoMap) {    
    const updateDocument = await MongooseTodoWO.updateMany({ _id: { $in: todoIds }}, { $set: { checked: 1 } });
  }

  console.timeEnd("MongoDB");
  const mongoEnd = hrtime.bigint();
  console.log(`MariaDB: ${(mongoEnd - mongoStart) / BigInt(1000)} microseconds`);
})();
