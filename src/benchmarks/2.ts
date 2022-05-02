import { hrtime } from 'process';
import fs from 'fs';

import neo4j from 'neo4j-driver'

import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect } from "mongoose";

import sequelize from '../sequelize';
import { User } from '../sequelize/models/User';
import { Tag } from '../sequelize/models/Tag';
import { MongooseUserWO } from '../mongoose/models/UserWO';


require('dotenv').config({ path: './.env' })

const NS_TO_MS = BigInt(1_000_000);

// Connections (vorbereiten)
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
connect(process.env.MONGODB_URI!);

/**
 * Testfall: Finde alle mit ? getaggten Todos der nächsten 7 Tage!
 * 
 * Hier bietet es sich an jedes Tag anzuschauen.
 */

(async () => {

  /**
   * Vorbereitungen
   */

  const mariaUsers = await User.findAll(); // verwenden um die Datenbankgrösse on the fly zu bestimmen

  const mariaTags = await Tag.findAll();
  const mariaTagIds = mariaTags.map((e) => e.getDataValue('id'));

  const tagsPipeline = [
    {
      '$unwind': {
        'path': '$tags'
      }
    }, {
      '$replaceRoot': {
        'newRoot': '$tags'
      }
    }, {
      '$group': {
        '_id': 0, 
        'ids': {
          '$addToSet': '$_id'
        }
      }
    }
  ]
  const mongoTags = await MongooseUserWO.aggregate(tagsPipeline).exec();
  const mongoTagIds = mongoTags[0].ids;

  /**
   * MariaDB
   */

  const mariaStart = hrtime.bigint();

  for (const id of mariaTagIds) {  
    const query = `
      SELECT * FROM \`todo\` 
      INNER JOIN \`todo_tag\` ON \`todo_tag\`.\`todo_id\` = \`todo\`.\`id\`
      WHERE \`todo_tag\`.\`tag_id\` = '${id}' AND \`moment\` BETWEEN '2022-04-20 08:00:00' AND '2022-04-27 08:00:00' 
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

  for (const id of mariaTagIds) {  
    const query = `
      MATCH (todo:Todo)-[r:HAS_TAG]->(tag:Tag {id: ${id}})
      WHERE datetime("2022-04-20T08:00:00.000Z") <= todo.moment <= datetime("2022-04-27T08:00:00.000Z")
      RETURN todo
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

  for (const id of mongoTagIds) {
    const pipeline = [
      {
        '$match': {
          tags: id,
          moment: {$gte: new Date("2022-04-20T08:00:00.000Z"), $lte: new Date("2022-04-27T08:00:00.000Z")}
        }
      }
    ]
    const result = await MongooseTodoWO.aggregate(pipeline).exec();
    //console.log("MongoDB: ", result.length);
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|queries=${mariaTags.length}\r\n`;

  fs.appendFileSync(`benchmark_results/${mariaUsers.length}_2.log`, line);
})();