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
 * #7: Welche Freunde hat mein Freund die ich nicht als Freund habe?
 */
b.suite(
  'Testcase #7',

  b.add('Neo4j', async () => {
    // (Vorsicht: Dynamische drei Tage) <- bei GoogleDoc Version
    // #1: 5 -> 4, #2: 5 -> 4
    const queryOne = `
      MATCH (friend:User {id: 4})-[:FRIENDS_WITH]->(commonFriend:User)
      WITH commonFriend
      WHERE NOT (:User {id: 5})-[:FRIENDS_WITH]->(commonFriend)
      RETURN commonFriend
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(queryOne);
      console.log("Neo4j: ", result.records.length);
    } finally {
      await session.close()
    }
  }),

  b.add('MariaDB', async () => {
    const queryOne = `
      SELECT *, COUNT(*) AS counter 
      FROM (SELECT * FROM user_user WHERE (user_id = 5 AND user_friend_id != 4) OR (user_id = 4)) users 
      JOIN user ON user.id = users.user_friend_id
      GROUP BY user_friend_id
      HAVING counter = 1 AND user_id != 5
    `;
  
    const [results, metadata] = await sequelize.query(queryOne);
    console.log("MariaDB", results.length);
  }),
  
  b.add('MongoDB', async () => {
    // #1: ? / ?, #2: 6257c871483363da23f9063c / 6257c871483363da23f9059b
    const pipeline = [
      {
        '$match': {
          '_id': new Types.ObjectId('6257c871483363da23f9063c')
        }
      }, {
        '$project': {
          'friends': {
            '$filter': {
              'input': '$friends', 
              'as': 'friend', 
              'cond': {
                '$eq': [
                  '$$friend', new Types.ObjectId('6257c871483363da23f9059b')
                ]
              }
            }
          }
        }
      }, {
        '$lookup': {
          'from': 'wo_user', 
          'localField': 'friends', 
          'foreignField': '_id', 
          'as': 'friend_document'
        }
      }, {
        '$unwind': {
          'path': '$friend_document'
        }
      }, {
        '$set': {
          'friend_document.other_friends': {
            '$setDifference': [
              '$friend_document.friends', '$friends'
            ]
          }
        }
      }, {
        '$replaceRoot': {
          'newRoot': '$friend_document'
        }
      }
    ]
    const result = await MongooseUserWO.aggregate(pipeline).exec();
    console.log("MongoDB: ", result);
  }),

  b.cycle(),

  b.complete(),
  
  b.save({ file: 'reduce', version: '1.0.0' }),

  b.save({ file: 'reduce', format: 'chart.html' }),
);
