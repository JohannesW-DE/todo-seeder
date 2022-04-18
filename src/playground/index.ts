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
  const session = driver.session();

  console.time("dbsave");

  for (let i = 0; i < 100; i++) {
    const queryOne = `
      MATCH p = (parent:Todo {id: 16422})-[:HAS_CHILD*]->(child)
      WITH TOFLOAT(COUNT(*))/100 AS divisor, COLLECT(child) AS children
      UNWIND children AS c
      WITH divisor, c
      WHERE c.checked = true
      RETURN COUNT(*)/divisor AS checked_percentage
    `;    
    
    const result = await session.run(queryOne);
    console.log(result.records[0].get('checked_percentage'));
  }

  console.timeEnd("dbsave");

  await session.close()
})();

// 123 -> 6257c871483363da23f905a5