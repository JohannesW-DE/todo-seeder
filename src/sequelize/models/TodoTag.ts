import { DataTypes } from "sequelize";
import sequelize from "..";
import { Tag } from "./Tag";
import { Todo } from "./Todo";

export const TodoTag = sequelize.define('TodoTag', {
  todo_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: Todo,
      key: 'id'
    }        
  },
  tag_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: Tag,
      key: 'id'
    }        
  }
}, {
  tableName: 'todo_tag',
});