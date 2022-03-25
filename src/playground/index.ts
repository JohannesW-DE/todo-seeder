import neo4j from 'neo4j-driver'

import b from 'benny';
import sequelize from '../sequelize';

console.log("playground.ts")


require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

b.suite(
  'Testcase #1',

  b.add('Neo4j', async () => {
    const queryOne = `
    MATCH (parent:Todo {id: 25})-[:HAS_CHILD*]->(child)
    WHERE child.checked = true
    WITH COUNT(child) as children_checked
    MATCH (parent:Todo {id: 25})-[:HAS_CHILD*]->(child)
    WITH count(child) as children_total, children_checked
    RETURN (children_checked * 1.0 / children_total) * 100 AS checked_percentage
    `;    
    
    const session = driver.session();

    try {  
      const result = await session.run(queryOne);
      console.log(result.records[0].toObject()['checked_percentage']);
    } finally {
      await session.close()
    }

  }),

  b.add('MariaDB', async () => {
    const queryOne = `
    WITH RECURSIVE cte (\`id\`, \`name\`, \`checked\`, \`parent_id\`) AS (
      SELECT \`id\`, \`name\`, \`checked\`, \`parent_id\` FROM \`todo\` WHERE parent_id = 25
      UNION ALL
      SELECT \`t\`.\`id\`, \`t\`.\`name\`, \`t\`.\`checked\`, \`t\`.\`parent_id\` FROM \`todo\` \`t\`
      INNER JOIN cte ON t.parent_id = cte.id
    )
    SELECT 100*SUM(\`checked\`)/COUNT(*) AS \`checked_percentage\` FROM \`cte\`;
    `;
  
    const [results, metadata] = await sequelize.query(queryOne);
    console.log(results);
  }),
  
  b.cycle(),

  b.complete(),
  
  b.save({ file: 'reduce', version: '1.0.0' }),

  b.save({ file: 'reduce', format: 'chart.html' }),
);
