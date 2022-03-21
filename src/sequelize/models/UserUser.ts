import { DataTypes } from "sequelize";
import sequelize from "..";
import { User } from "./User";

export const UserUser = sequelize.define('UserUser', {
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }        
  },
  user_friend_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }        
  }
}, {
  tableName: 'user_user',
});