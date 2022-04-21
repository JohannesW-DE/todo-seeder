import { connect } from "mongoose";
import { hrtime } from 'process';

import fs from 'fs';
import neo4j from 'neo4j-driver'

import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import { Todo } from '../sequelize/models/Todo';
import sequelize from '../sequelize';


require('dotenv').config({ path: './.env' })

const NS_TO_MS = BigInt(1_000_000);

// Connections (vorbereiten)
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
connect(process.env.MONGODB_URI!);

/**
 * Testfall: Wieviel Prozent einer Todo-Hierarchie sind bereits erledigt?
 * 
 * Der Einfachheit halber wird bei diesem Benchmark jeweils die oberste Todo jedes Benutzers genommen.
 * Diesen Sonderfall könnte man natürlich auch deutlich einfacher lösen wenn man einfach alle Todos eines Benutzer abgreift,
 * aber die Idee hinter diesem Testfall ist ja in der Praxis irgendwo mittendrin in der gesamten Todo-Hierarchie anzusetzen.
 */

(async () => {

  /**
   * Vorbereitungen
   */

  const mariaTodos = await Todo.findAll( { where: { parent_id: null } } ); // alle elternlosen Todos
  const mariaTodoIds = mariaTodos.map((e) => e.getDataValue('id'));

  const mongoTodos = await MongooseTodoWO.find( { parent: { $exists: false } } )
  const mongoTodoIds = mongoTodos.map((e) => e._id);

  /**
   * MariaDB
   */

   const mariaStart = hrtime.bigint();

   for (const id of mariaTodoIds) {  
    const query = `
      WITH RECURSIVE cte (\`id\`, \`name\`, \`checked\`, \`parent_id\`) AS (
        SELECT \`id\`, \`name\`, \`checked\`, \`parent_id\` FROM \`todo\` WHERE parent_id = ${id}
        UNION ALL
        SELECT \`t\`.\`id\`, \`t\`.\`name\`, \`t\`.\`checked\`, \`t\`.\`parent_id\` FROM \`todo\` \`t\`
        INNER JOIN cte ON t.parent_id = cte.id
      )
      SELECT 100*SUM(\`checked\`)/COUNT(*) AS \`checked_percentage\` FROM \`cte\`;
    `;

    const [results, metadata] = await sequelize.query(query);
  }

  const mariaEnd = hrtime.bigint();
  const mariaDiff = (mariaEnd - mariaStart) / NS_TO_MS;

  console.log(`MariaDB: ${mariaDiff} ms`);  

  /**
   * Neo4j
   */

   const neoStart = hrtime.bigint();

   for (const id of mariaTodoIds) {  
    const query = `
      MATCH p = (parent:Todo {id: ${id}})-[:HAS_CHILD*]->(child)
      WITH TOFLOAT(COUNT(*))/100 AS divisor, COLLECT(child) AS children
      UNWIND children AS c
      WITH divisor, c
      WHERE c.checked = true
      RETURN COUNT(*)/divisor AS checked_percentage
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(query);
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

  for (const id of mongoTodoIds) {
    const pipeline = [
      {
        '$match': {
          '_id': id,
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
          'checked_percentage': { '$multiply': [ { '$divide': [ '$checked', '$count' ] }, 100 ] }
        }
      }
    ];
    const result = await MongooseTodoWO.aggregate(pipeline).exec();
  }

  const mongoEnd = hrtime.bigint();
  const mongoDiff = (mongoEnd - mongoStart) / NS_TO_MS;

  console.log(`MongoDB: ${mongoDiff} ms`);  

  const line = `mariadb=${mariaDiff}|neo4j=${neoDiff}|mongodb=${mongoDiff}|queries=${mariaTodoIds.length}\r\n`;

  fs.appendFileSync(`benchmark_results/${mariaTodoIds.length}_1.log`, line);

})();