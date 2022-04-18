import neo4j from 'neo4j-driver'

import b from 'benny';
import sequelize from '../sequelize';
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { connect, Types } from "mongoose";

require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

connect(process.env.MONGODB_URI!); // !!!

/*
 * #2: Was sind alle ? getaggten ToDos der nächsten 3 Tage?
 */
b.suite(
  'Testcase #2',

  b.add('Neo4j', async () => {
    // (Vorsicht: Dynamische drei Tage) <- bei GoogleDoc Version
    // #1: 2 (2022-03-18 14:45:00, 2022-03-21 14:45:00), #2: 8 (2022-04-13 08:00:00, 2022-04-16 08:00:00)
    const queryOne = `
      MATCH (todo:Todo)
      WHERE datetime("2022-04-13T08:00:00.000Z") <= todo.moment <= datetime("2022-04-16T08:00:00.000Z")
      AND EXISTS {
        MATCH (todo)-[:HAS_TAG]->(tag:Tag)
        WHERE tag.id = 8
      }
      RETURN todo
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
      SELECT * FROM \`todo\` 
      INNER JOIN \`todo_tag\` ON \`todo_tag\`.\`todo_id\` = \`todo\`.\`id\`
      WHERE \`todo_tag\`.\`tag_id\` = '8' AND \`moment\` BETWEEN '2022-04-13 08:00:00' AND '2022-04-16 08:00:00' 
    `;
  
    const [results, metadata] = await sequelize.query(queryOne);
    console.log("MariaDB", results.length);
  }),

  b.add('MongoDB', async () => {
    // #1: 62419d5fb4569bcaccb227b5, #2: 6256812b3dcaf6b5e88b466e
    const pipeline = [
      {
        '$match': {
          tags: {$elemMatch: { $eq: new Types.ObjectId('625680e73dcaf6b5e88a78e6')} },
          moment: {$gte: new Date("2022-04-13T08:00:00.000Z"), $lte: new Date("2022-04-16T08:00:00.000Z")}
        }
      }
    ]
    const result = await MongooseTodoWO.aggregate(pipeline).exec();
    console.log("MongoDB: ", result.length);
  }),
  
  b.cycle(),

  b.complete(),
  
  b.save({ file: 'reduce', version: '1.0.0' }),

  b.save({ file: 'reduce', format: 'chart.html' }),
);
