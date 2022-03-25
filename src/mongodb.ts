import { connect, Types } from "mongoose";
import { MongooseUser } from "./mongoose/models/User";
import { Meeting } from "./sequelize/models/Meeting";
import { Tag } from "./sequelize/models/Tag";
import { Todo } from "./sequelize/models/Todo";
import { TodoTag } from "./sequelize/models/TodoTag";
import { TodoUser } from "./sequelize/models/TodoUser";
import { User } from "./sequelize/models/User";
import { UserUser } from "./sequelize/models/UserUser";

require('dotenv').config({ path: './.env' })

connect(process.env.MONGODB_URI!);

(async () => {

  await MongooseUser.deleteMany( {} );
  
  const sequelizeUsers = await User.findAll( {} );
  const userIds: Record<number, Types.ObjectId> = {}

  for (const sequelizeUser of sequelizeUsers) {
    const userJson = sequelizeUser.toJSON();

    // Create User
    const mongooseUser = new MongooseUser({
      username: userJson.username,
      name: userJson.name,
      email: userJson.email,
    });
    const savedUser = await mongooseUser.save();

    userIds[userJson.id] = savedUser._id;

    // Create User-User (IMPORTANT: USER MUSS BEREITS EXISITIEREN!)
    const sequelizeFriends = await UserUser.findAll( { attributes: {exclude: ['id']}, where: { user_id: userJson.id } } )

    for (const sequelizeFriend of sequelizeFriends) {
      const friendJson = sequelizeFriend.toJSON();

      const friend = await MongooseUser.findOne({'id': friendJson.id})
      if (friend) {
        mongooseUser.friends.push(friend)
      }  
    }

    // Create Tags
    const sequelizeTags = await Tag.findAll( { where: { user_id: userJson.id } } );
    const tagIds: Record<number, Types.ObjectId> = {}

    for (const sequelizeTag of sequelizeTags) {
      const tagJson = sequelizeTag.toJSON();

      mongooseUser.tags.push(tagJson);

      tagIds[tagJson.id] = mongooseUser.tags[mongooseUser.tags.length - 1]._id;
    }

    // Create Todos & Todo-Relations (Tag, Users)
    const sequelizeTodos = await Todo.findAll( { where: { user_id: userJson.id } } );
    const todoIds: Record<number, Types.ObjectId> = {}

    for (const sequelizeTodo of sequelizeTodos) {
      let todoJson = sequelizeTodo.toJSON();

      if (todoJson.parent_id !== null) {
        todoJson.parent = todoIds[todoJson.parent_id]
      }

      // check for meeting and possibly add properties
      const sequelizeMeeting = await Meeting.findByPk(todoJson.id);
      if (sequelizeMeeting) {
        const meetingJson = sequelizeMeeting.toJSON();

        todoJson.venue = meetingJson.venue;
        todoJson.duration = meetingJson.duration;
        todoJson.user_limit = meetingJson.user_limit;
      }

      // Add Tags
      const sequelizeTodoTags = await TodoTag.findAll( { attributes: {exclude: ['id']}, where: { todo_id: todoJson.id } } );
      const tags = sequelizeTodoTags.map((e) => tagIds[e.toJSON().tag_id]);
      todoJson.tags = tags

      // Add Users
      const sequelizeTodoUsers = await TodoUser.findAll( { attributes: {exclude: ['id']}, where: { todo_id: todoJson.id } } );
      const users = sequelizeTodoUsers.map((e) => userIds[e.toJSON().user_id]);
      todoJson.users = users

      mongooseUser.todos.push(todoJson);

      todoIds[todoJson.id] = mongooseUser.todos[mongooseUser.todos.length - 1]._id;
    }

    await mongooseUser.save();
  }
})();