import { DataTypes } from "sequelize";
import sequelize from "..";
import { Todo } from "./Todo";
import { User } from "./User";

export const TodoUser = sequelize.define('TodoUser', {
  todo_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: Todo,
      key: 'id'
    }        
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }        
  }
}, {
  tableName: 'todo_user',
});
