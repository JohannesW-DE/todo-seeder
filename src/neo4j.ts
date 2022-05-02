import neo4j from 'neo4j-driver'
import { Op } from 'sequelize/types';
import { Meeting } from './sequelize/models/Meeting';
import { Tag } from './sequelize/models/Tag';
import { Todo } from './sequelize/models/Todo';
import { TodoTag } from './sequelize/models/TodoTag';
import { TodoUser } from './sequelize/models/TodoUser';
import { User } from './sequelize/models/User';
import { UserUser } from './sequelize/models/UserUser';

require('dotenv').config({ path: './.env' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)
const session = driver.session()

// operations
const deleteAll = "MATCH (n) DETACH DELETE n"

const createUser = "CREATE (user:User {id: $id, username: $username, name: $name, email: $email}) RETURN user";
const createTag = "CREATE (tag:Tag {id: $id, name: $name, weight: $weight, color: $color, background: $background}) RETURN tag";
const createTodo = "CREATE (todo:Todo {id: $id, name: $name, description: $description, moment: datetime($moment), priority: $priority, checked: $checked}) RETURN todo";
const createMeeting = "CREATE (todo:Todo:Meeting {id: $id, name: $name, description: $description, moment: datetime($moment), priority: $priority, checked: $checked, venue: $venue, duration: $duration, user_limit:$user_limit}) RETURN todo";

const createUserToTodo = "MATCH (u:User), (t:Todo) WHERE u.id = $userId AND t.id = $todoId CREATE (u)-[r:CREATED]->(t) RETURN type(r)";
const createUserToTag = "MATCH (u:User), (t:Tag) WHERE u.id = $userId AND t.id = $tagId CREATE (u)-[r:CREATED]->(t) RETURN type(r)";
const createTodoToTag = "MATCH (todo:Todo), (tag:Tag) WHERE todo.id = $todoId AND tag.id = $tagId CREATE (todo)-[r:HAS_TAG]->(tag) RETURN type(r)";
const createTodoToTodo = "MATCH (parent:Todo), (child:Todo) WHERE parent.id = $parentId AND child.id = $childId CREATE (parent)-[r:HAS_CHILD]->(child) RETURN type(r)";
const createUserToUser = "MATCH (user:User), (friend:User) WHERE user.id = $userId AND friend.id = $friendId CREATE (user)-[r:FRIENDS_WITH]->(friend) RETURN type(r)";
const createTodoToUser = "MATCH (u:User), (t:Todo) WHERE u.id = $userId AND t.id = $todoId CREATE (u)-[r:ASSIGNED_TO]->(t) RETURN type(r)";

const createUserIndex = "CREATE INDEX FOR (user:User) ON (user.id)";
const createTodoIndex = "CREATE INDEX FOR (tag:Tag) ON (tag.id)";
const createTagIndex = "CREATE INDEX FOR (todo:Todo) ON (todo.id)";

(async () => {
  try {
    await session.run(deleteAll)
    
    const sequelizeUsers = await User.findAll( {} );

    for (const sequelizeUser of sequelizeUsers) {
      const userJson = sequelizeUser.toJSON();

      // Create User
      await session.run(createUser,
        { id: neo4j.int(userJson.id), username: userJson.username, name: userJson.username, email: userJson.email }
      )

      // Create User-User (IMPORTANT: USER MUSS BEREITS EXISITIEREN!)
      const sequelizeFriends = await UserUser.findAll( { attributes: {exclude: ['id']}, where: { user_id: userJson.id } } )

      for (const sequelizeFriend of sequelizeFriends) {
        let friendJson = sequelizeFriend.toJSON();

        const result = await session.run(createUserToUser, {userId: friendJson.user_id, friendId: friendJson.user_friend_id});      
      }

      // Create Tags
      const sequelizeTags = await Tag.findAll( { where: { user_id: userJson.id } } );

      for (const sequelizeTag of sequelizeTags) {
        let tagJson = sequelizeTag.toJSON();

        await session.run(createTag, {id: neo4j.int(tagJson.id), name: tagJson.name, weight: neo4j.int(tagJson.weight), color: tagJson.color, background: tagJson.background});
        await session.run(createUserToTag, {userId: userJson.id, tagId: tagJson.id});      
      }

      // Create Todos
      const sequelizeTodos = await Todo.findAll( { where: { user_id: userJson.id } } );

      for (const sequelizeTodo of sequelizeTodos) {
        let todoJson = sequelizeTodo.toJSON();

        todoJson.moment = todoJson.moment.toISOString();

        // check for meeting and possibly add properties
        const sequelizeMeeting = await Meeting.findByPk(todoJson.id);
        if (sequelizeMeeting) {
          const meetingJson = sequelizeMeeting.toJSON();
          await session.run(createMeeting, {
            id: neo4j.int(todoJson.id),
            name: todoJson.name,
            description: todoJson.description,
            moment: todoJson.moment,
            checked: todoJson.checked,
            priority: neo4j.int(todoJson.priority),
            venue: meetingJson.venue,
            duration: neo4j.int(meetingJson.duration), 
            user_limit: neo4j.int(meetingJson.user_limit),            
          });
        } else {
          await session.run(createTodo, {
            id: neo4j.int(todoJson.id),
            name: todoJson.name,
            description: todoJson.description,
            moment: todoJson.moment,
            checked: todoJson.checked,
            priority: neo4j.int(todoJson.priority)
          });
        }
        
        await session.run(createUserToTodo, {userId: userJson.id, todoId: todoJson.id});      
      }

      // Create Todo-Relations & Todo-Tag Relations
      for (const sequelizeTodo of sequelizeTodos) {
        const todoJson = sequelizeTodo.toJSON();

        if (todoJson.parent_id !== null) {
          await session.run(createTodoToTodo, {parentId: todoJson.parent_id, childId: todoJson.id});  
        }
        
        const sequelizeTodoTags = await TodoTag.findAll( { attributes: {exclude: ['id']}, where: { todo_id: todoJson.id } } );

        for (const sequelizeTodoTag of sequelizeTodoTags) {
          const todoTagJson = sequelizeTodoTag.toJSON();

          await session.run(createTodoToTag, {todoId: todoTagJson.todo_id, tagId: todoTagJson.tag_id});
        }

        const sequelizeTodoUsers = await TodoUser.findAll( { attributes: {exclude: ['id']}, where: { todo_id: todoJson.id } } );

        for (const sequelizeTodoUser of sequelizeTodoUsers) {
          const todoUserJson = sequelizeTodoUser.toJSON();

          await session.run(createTodoToUser, {userId: todoUserJson.user_id, todoId: todoUserJson.todo_id});
        }  
      }   
    }

    // set indexes
    await session.run(createUserIndex);
    await session.run(createTagIndex);
    await session.run(createTodoIndex);

  } finally {
    await session.close()
  }
})();
