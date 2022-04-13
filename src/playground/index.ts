import neo4j from 'neo4j-driver'

import b from 'benny';
import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";

console.log("playground.ts")


require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

(async () => {
  const before = new Date();
  for (let i = 0; i < 20; i++) {

    const pipeline = [
      {
        '$match': {
          '_id': new Types.ObjectId('6256812b3dcaf6b5e88b466e'),
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
    console.log(result[0].checked_percentage);
  }
  const after = new Date();

  console.log(`Duration: ${after.getMilliseconds() - before.getMilliseconds()}`)
})();