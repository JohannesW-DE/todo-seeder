import { hrtime } from 'process';
import fs from 'fs';
import assert from 'assert';

import neo4j from 'neo4j-driver'

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
 * Testfall: Welche Freunde hat mein Freund die ich nicht als Freund habe?
 * 
 * Hier bietet es sich an jedes Tag anzuschauen.
 */

(async () => {

  /**
   * Vorbereitungen
   */

  const mariaUsers = await User.findAll(); // verwenden um die Datenbankgrösse on the fly zu bestimmen

  const mariaFriends: {userId: number, friendId: number}[] = [];
  const mariaUserUsers = await UserUser.findAll( { attributes: {exclude: ['id']} } )
  for (const userUser of mariaUserUsers) {
    mariaFriends.push({userId: userUser.getDataValue('user_id'), friendId: userUser.getDataValue('user_friend_id')})
  }

  const mongoFriends: {userId: Types.ObjectId, friendId: Types.ObjectId}[] = [];
  const mongoUsers = await MongooseUserWO.find();
  for (const user of mongoUsers) {
    for (const friend of user.friends) {
      mongoFriends.push({userId: user._id, friendId: friend._id});
    }
  }

  assert(mariaFriends.length === mongoFriends.length);

  /**
   * MariaDB
   */

  const mariaStart = hrtime.bigint();

  for (const {userId, friendId} of mariaFriends) {  
    const query = `
      SELECT *, COUNT(*) AS counter 
      FROM (SELECT * FROM user_user WHERE (user_id = ${userId} AND user_friend_id != ${friendId}) OR (user_id = ${friendId})) users 
      JOIN user ON user.id = users.user_friend_id
      GROUP BY user_friend_id
      HAVING counter = 1 AND user_id != ${userId}
    `;
  
    const [results, metadata] = await sequelize.query(query);
    //console.log("MariaDB", results.length);
  }

  const mariaEnd = hrtime.bigint();
  const mariaDiff = (mariaEnd - mariaStart) / NS_TO_MS;

  console.log(`MariaDB: ${mariaDiff} ms`);  

  /**
   * Neo4j
   */

  const neoStart = hrtime.bigint();

  for (const {userId, friendId} of mariaFriends) {  
    const query = `
      MATCH (friend:User {id: ${friendId}})-[:FRIENDS_WITH]->(commonFriend:User)
      WITH commonFriend
      WHERE NOT (:User {id: ${userId}})-[:FRIENDS_WITH]->(commonFriend)
      RETURN commonFriend
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(query);
      //console.log("Neo4j", result.records.length);
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

  for (const {userId, friendId} of mongoFriends) {
    const pipeline = [
      {
        '$match': {
          '_id': userId
        }
      }, {
        '$set': {
          'compare_with_friend': friendId
        }
      }, {
        '$project': {
          'compare_with_friend': 1, 
          'other_friends': {
            '$filter': {
              'input': '$friends', 
              'as': 'friend', 
              'cond': {
                '$ne': [
                  '$$friend', '$compare_with_friend'
                ]
              }
            }
          }
        }
      }, {
        '$lookup': {
          'from': 'wo_user', 
          'localField': 'compare_with_friend', 
          'foreignField': '_id', 
          'as': 'friend'
        }
      }, {
        '$unwind': {
          'path': '$friend'
        }
      }, {
        '$set': {
          'potential_friends': {
            '$setDifference': [
              '$friend.friends', '$other_friends'
            ]
          }
        }
      }, {
        '$unwind': {
          'path': '$potential_friends'
        }
      }, {
        '$lookup': {
          'from': 'wo_user', 
          'localField': 'potential_friends', 
          'foreignField': '_id', 
          'as': 'friend_object'
        }
      }, {
        '$unwind': {
          'path': '$friend_object'
        }
      }, {
        '$project': {
          'friend_object': 1
        }
      }, {
        '$replaceRoot': {
          'newRoot': '$friend_object'
        }
      }
    ];
    const result = await MongooseUserWO.aggregate(pipeline).exec();
    //console.log("MongoDB: ", result.length);
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|queries=${mariaFriends.length}\r\n`;

  fs.appendFileSync(`benchmark_results/${mariaUsers.length}_7.log`, line);
})();