import { Sequelize } from 'sequelize';

require('dotenv').config({ path: '././.env' })

const sequelize = new Sequelize(process.env.SEQUELIZE_URI!, {
  dialect: 'mariadb',
  dialectOptions: {},
  logging: false,
  define: {
    timestamps: false,
  }
});

export default sequelize;