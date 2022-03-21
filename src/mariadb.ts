import { Op } from 'sequelize';
import sequelize from './sequelize';
import { Tag } from './sequelize/models/Tag';
import { Todo } from './sequelize/models/Todo';
import { TodoTag } from './sequelize/models/TodoTag';
import { TodoUser } from './sequelize/models/TodoUser';
import { User } from './sequelize/models/User';
import { UserUser } from './sequelize/models/UserUser';

import { getRandomInteger, ITag, ITodo, percent, randomTag, randomTodo, randomUsers } from './generator';

// parameters

const USER_COUNT = 5;

// chance in percent to "do something"
const PROBABILITIES_TAGS_CREATION = [90, 70, 10, 1];
const PROBABILITIES_TAGS_ADD = [40, 10, 1];
const PROBABILITIES_TODO_CHILDREN = [80, 80, 80, 80, 20, 20]; // add child
const PROBABILITIES_TODO_DEPTH = [5, 25, 50, 75, 100]; // end at a certain depth
const PROBABILITIES_FRIENDS = [100, 50];
const PROBABILITIES_TODO_ADD_USER = [20, 10];

//// sequelize associations

// User -> Tag
User.hasMany(Tag, { foreignKey: 'user_id' });

// User -> Todo
User.hasMany(Todo, { foreignKey: 'user_id' });

// Todo -> Todo
Todo.hasOne(Todo, {as: 'parent', foreignKey: 'parent_id'});

// Todo <-> Tag
Todo.belongsToMany(Tag, { through: 'TodoTag', foreignKey: 'todo_id', as: 'tagTodos'});
Tag.belongsToMany(Todo, { through: 'TodoTag', foreignKey: 'tag_id', as: 'tags'});

// User <-> User
User.belongsToMany(User, { through: 'UserUser', foreignKey: 'user_id', as: 'users'});
User.belongsToMany(User, { through: 'UserUser', foreignKey: 'user_friend_id', as: 'friends'});

// Todo <-> User
Todo.belongsToMany(User, { through: 'TodoUser', foreignKey: 'todo_id', as: 'userTodos'});
User.belongsToMany(Todo, { through: 'TodoUser', foreignKey: 'user_id', as: 'todoUsers'});


//// creation

interface ITodoWithChildren extends ITodo {
  todos: ITodoWithChildren[];
}


function createTodos(todo: ITodoWithChildren, depth: number): ITodoWithChildren {
  if (percent( { percentage: PROBABILITIES_TODO_DEPTH[depth] } )) { // no children
    return todo;
  }

  for (const todoChildProbability of PROBABILITIES_TODO_CHILDREN) {
    if (percent({percentage: todoChildProbability})) {
      const children = createTodos({...randomTodo(todo.moment), todos: [] }, depth + 1);
      todo.todos.push(children);
    }
  }

  return todo;
}

function createTags(): ITag[] {
  const tags: ITag[] = [];

  for (let tagCreationProbability of PROBABILITIES_TAGS_CREATION) {
    if (percent({percentage: tagCreationProbability})) {
      tags.push(randomTag());
    }
  }

  return tags;
}


async function iterateTodoObject(todo: ITodoWithChildren, parentId: number | null, userId: number) {
  const dbTodo = await Todo.create({
    ...todo,
    parent_id: parentId,
    user_id: userId,
  });

  for (const child of todo.todos) {
    await iterateTodoObject(child, dbTodo.toJSON().id, userId);
  }
}

(async () => {
  await sequelize.drop();
  await sequelize.sync();

  const userObjects = randomUsers({ length: USER_COUNT })

  for (const userObject of userObjects) {

    // Create User
    const user = await User.create({
      username: userObject.username,
      name: `${userObject.firstName} ${userObject.lastName}`,
      email: userObject.email,
    });

    const userId = user.toJSON().id

    // Create Friends
    const dbUsers = await User.findAll( { where: { id: { [Op.not]: userId } } } )

    if (dbUsers.length > 0) {
      for (const friendProbability of PROBABILITIES_FRIENDS) {
        if (percent({percentage: friendProbability})) {
          const friend = dbUsers.at(getRandomInteger(0, dbUsers.length - 1))?.toJSON();

          try {
            await UserUser.create( { user_id: userId, user_friend_id: friend.id } )
          } catch (error) {
            console.error('UserUser creation error');
          }
        }
      }
    }

    // Create Tags
    const tagObjects = createTags();

    for (const tagObject of tagObjects) {
      await Tag.create( { ...tagObject, user_id: userId } );
    }

    // Create Todos
    const root: ITodoWithChildren = { ...randomTodo(), todos: []};
    createTodos(root, 0);

    await iterateTodoObject(root, null, user.toJSON().id);

    // Add Tags to Todos
    const dbTodos = await Todo.findAll( { where: { user_id: userId } } );
    const dbTags = await Tag.findAll( { where: { user_id: userId } } );

    if (dbTags.length > 0) {
      for (const todo of dbTodos) {
        for (let tagAddProbability of PROBABILITIES_TAGS_ADD) {
          if (percent({percentage: tagAddProbability})) {
            const tag = dbTags.at(getRandomInteger(0, dbTags.length - 1))?.toJSON()

            try {
              await TodoTag.create( { todo_id: todo.toJSON().id, tag_id: tag.id } )
            } catch (error) {
              console.error('TodoTag creation error');
            }
          }
        }
      }
    }
    
    // Add Users to Todos
    const dbFriends = await UserUser.findAll( { where: { user_id: user.toJSON().id } } );

    if (dbFriends.length > 0) {
      for (const todo of dbTodos) {
        for (let todoAddUserProbability of PROBABILITIES_TODO_ADD_USER) {
          if (percent({percentage: todoAddUserProbability})) {
            const friend = dbFriends.at(getRandomInteger(0, dbFriends.length - 1))?.toJSON()

            try {
              await TodoUser.create( { todo_id: todo.toJSON().id, user_id: friend.user_friend_id } )
            } catch (error) {
              console.error('TodoUser creation error');
            }
          }
        }
      }
    }

  }
})();
