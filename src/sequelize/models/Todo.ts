import { DataTypes } from "sequelize";
import sequelize from "..";
import { User } from "./User";

export const Todo = sequelize.define('Todo', {
  id: {
    primaryKey: true,
    autoIncrement: true,
    type: DataTypes.INTEGER.UNSIGNED,
  },  
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING,
  },
  moment: {
    type: DataTypes.DATE,
  },
  priority: {
    type: DataTypes.INTEGER,
  },
  checked: {
    type: DataTypes.BOOLEAN,
  },
  parent_id: {
    type: DataTypes.INTEGER.UNSIGNED,
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }    
  },  
}, {
  tableName: 'todo',
});