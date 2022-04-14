import neo4j from 'neo4j-driver'

import b from 'benny';
import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";
import { MongooseUserWO } from '../mongoose/models/UserWO';

require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

/*
 * #8: Mit welchem Benutzer wurde ich am häufigsten zu einer Todo hinzugefügt? (ABGEÄNDERT!)
 */
b.suite(
  'Testcase #8',

  b.add('Neo4j', async () => {
    // #1: ?, #2: 5
    const queryOne = `
      MATCH (user:User {id: 5})-[:ASSIGNED_TO]->(todo:Todo)
      WITH todo
      MATCH (otherUser: User)-[assignment:ASSIGNED_TO]->(todo)
      WHERE otherUser.id <> 5
      RETURN otherUser, count(otherUser) AS count
      ORDER BY count DESC
      LIMIT 1
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(queryOne);
      console.log("Neo4j: ", result.records[0].get('count')['low'], result.records[0].get('otherUser'));
    } finally {
      await session.close()
    }
  }),

  b.add('MariaDB', async () => {
    const queryOne = `
      SELECT *, COUNT(*) as \`count\` 
      FROM \`todo_user\` 
      JOIN user ON user.id = user_id
      WHERE \`todo_id\` IN (
        SELECT \`todo_id\` FROM \`todo_user\` WHERE user_id = 5
      )
      AND user_id != 5
      GROUP BY user_id
      ORDER BY \`count\`
      DESC LIMIT 1
    `;
  
    const [results, metadata] = await sequelize.query(queryOne);
    console.log("MariaDB", results);
  }),

  b.add('MongoDB', async () => {
    // #1: ? , #2: 6257c871483363da23f9063c
    const pipeline = [
      {
        '$match': {
          'users': new Types.ObjectId('6257c871483363da23f9063c')
        }
      }, {
        '$unwind': {
          'path': '$users'
        }
      }, {
        '$match': {
          'users': {
            '$ne': new Types.ObjectId('6257c871483363da23f9063c')
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
    ]

    // Sortieren in der Pipeline geht nicht?!
    /*
    {
      '$sort': {
        'count': -1
      }
    },
    */

    const result = await MongooseTodoWO.aggregate(pipeline).exec();
    console.log("MongoDB: ", result);
  }),

  b.cycle(),

  b.complete(),
  
  b.save({ file: 'reduce', version: '1.0.0' }),

  b.save({ file: 'reduce', format: 'chart.html' }),
);
