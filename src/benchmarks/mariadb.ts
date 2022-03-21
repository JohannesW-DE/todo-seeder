import sequelize from "../sequelize";

import b from 'benny';

b.suite(
  'MariaDB Benchmark',

  b.add('#1', async () => {
    const queryOne = `
    WITH RECURSIVE cte (\`id\`, \`name\`, \`checked\`, \`parent_id\`) AS (
      SELECT \`id\`, \`name\`, \`checked\`, \`parent_id\` FROM \`todo\` WHERE parent_id = 2
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
)
