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
 * #1: Wieviel % einer ToDo (samt ToDos unterhalb) sind bereits erledigt?
 */
b.suite(
  'Testcase #1',

  b.add('Neo4j', async () => {
    // #1: 10, #2: 16422
    const queryOne = `
      MATCH (parent:Todo {id: 16422})-[:HAS_CHILD*]->(child)
      WHERE child.checked = true
      WITH COUNT(child) as children_checked
      MATCH (parent:Todo {id: 16422})-[:HAS_CHILD*]->(child)
      WITH count(child) as children_total, children_checked
      RETURN (children_checked * 1.0 / children_total) * 100 AS checked_percentage
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(queryOne);
      console.log(result.records[0].get('checked_percentage'));
    } finally {
      await session.close()
    }

  }),

  b.add('MariaDB', async () => {
    const queryOne = `
      WITH RECURSIVE cte (\`id\`, \`name\`, \`checked\`, \`parent_id\`) AS (
        SELECT \`id\`, \`name\`, \`checked\`, \`parent_id\` FROM \`todo\` WHERE parent_id = 16422
        UNION ALL
        SELECT \`t\`.\`id\`, \`t\`.\`name\`, \`t\`.\`checked\`, \`t\`.\`parent_id\` FROM \`todo\` \`t\`
        INNER JOIN cte ON t.parent_id = cte.id
      )
      SELECT 100*SUM(\`checked\`)/COUNT(*) AS \`checked_percentage\` FROM \`cte\`;
    `;
  
    const [results, metadata] = await sequelize.query(queryOne);
    console.log(results);
  }),

  b.add('MongoDB', async () => {
    // #1: 62419d5fb4569bcaccb227b5, #2: 6256812b3dcaf6b5e88b466e
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
  }),
  
  b.cycle(),

  b.complete(),
  
  b.save({ file: 'reduce', version: '1.0.0' }),

  b.save({ file: 'reduce', format: 'chart.html' }),
);
