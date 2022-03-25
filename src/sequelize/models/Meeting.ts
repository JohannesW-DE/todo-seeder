import { DataTypes } from "sequelize";
import sequelize from "..";
import { Todo } from "./Todo";
import { User } from "./User";

export const Meeting = sequelize.define('Meeting', {
  todo_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    allowNull: false,
    references: {
      model: Todo,
      key: 'id'
    }
  },
  venue: {
    type: DataTypes.STRING,
  },
  duration: {
    type: DataTypes.TINYINT.UNSIGNED,
  },
  user_limit: {
    type: DataTypes.TINYINT.UNSIGNED,
  },
}, {
  tableName: 'meeting',
});