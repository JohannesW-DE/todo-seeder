import neo4j from 'neo4j-driver'

import b from 'benny';
import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { hrtime } from 'process';

console.log("playground.ts")


require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

(async () => {

  const queryOne = `
    MATCH p = (parent:Todo {id: 55166})-[:HAS_CHILD*]->(child)
    WITH TOFLOAT(COUNT(*))/100 AS divisor, COLLECT(child) AS children
    UNWIND children AS c
    WITH divisor, c
    WHERE c.checked = true
    RETURN COUNT(*)/divisor AS checked_percentage
  `;    

  const session = driver.session();

  try { 
    const start = hrtime.bigint();
    const pipeline = [
      {
        '$match': {
          '_id': new Types.ObjectId('625ff6f82fd8a71aa5fec14b'),
        }
      }, {
        '$graphLookup': {
          'from': 'wo_todo', 
          'startWith': '$_id', 
          'connectFromField': '_id', 
          'connectToField': 'parent', 
          'as': 'todos'
        }
      }, {
        '$unwind': {
          'path': '$todos'
        }
      }, {
        '$group': {
          '_id': null, 
          'checked': {
            '$sum': {
              '$cond': {
                'if': {
                  '$eq': [
                    '$todos.checked', 1
                  ]
                }, 
                'then': 1, 
                'else': 0
              }
            }
          }, 
          'count': {
            '$sum': 1
          }
        }
      }, {
        '$project': {
          'checked': 1, 
          'count': 1, 
          'checked_percentage': {
            '$divide': [
              '$checked', '$count'
            ]
          }
        }
      }
    ];

    const result = await MongooseTodoWO.aggregate(pipeline).exec();
    const end = hrtime.bigint();
    console.log(`MariaDB: ${(end - start) / BigInt(1000)} microseconds`);
  } finally {
    await session.close()
  }
})();

// 123 -> 6257c871483363da23f905a5