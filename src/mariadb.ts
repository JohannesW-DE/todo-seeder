import { Op, QueryTypes } from 'sequelize';
import sequelize from './sequelize';
import { Tag } from './sequelize/models/Tag';
import { Todo } from './sequelize/models/Todo';
import { TodoTag } from './sequelize/models/TodoTag';
import { TodoUser } from './sequelize/models/TodoUser';
import { User } from './sequelize/models/User';
import { UserUser } from './sequelize/models/UserUser';

import { getRandomInteger, ITag, ITodo, percent, randomMeeting, randomTag, randomTodo, randomUsers } from './generator';
import { Meeting } from './sequelize/models/Meeting';

// parameters

const USER_COUNT = 5;

// chance in percent to "do something"
const PROBABILITIES_TAGS_CREATION = [90, 70, 10, 1];
const PROBABILITIES_TAGS_ADD = [40, 10, 1];
const PROBABILITIES_TODO_CHILDREN = [80, 80, 80, 80, 20, 20]; // add child
const PROBABILITIES_TODO_DEPTH = [5, 25, 50, 75, 100]; // end at a certain depth
const PROBABILITIES_FRIENDS = [100, 50];
const PROBABILITIES_TODO_ADD_USER = [20, 10];
const PROBABILITIES_MEETING_ADD_USER = [100, 90, 80, 70, 30];
const PROBABILITY_TODO_IS_A_MEETING = 15; // TODO: lower

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

//

const meetingQuery = `
WITH RECURSIVE cte (\`id\`, \`name\`, \`checked\`, \`parent_id\`, \`todo_id\`) AS (
  SELECT \`todo\`.\`id\`, \`todo\`.\`name\`, \`todo\`.\`checked\`, \`todo\`.\`parent_id\`, \`meeting\`.\`todo_id\` FROM \`todo\` LEFT JOIN \`meeting\` ON \`meeting\`.\`todo_id\` = \`todo\`.\`id\` WHERE \`todo\`.\`id\` = :id
  UNION ALL
  SELECT \`todo\`.\`id\`, \`todo\`.\`name\`, \`todo\`.\`checked\`, \`todo\`.\`parent_id\`, \`meeting\`.\`todo_id\` FROM \`todo\` LEFT JOIN \`meeting\` ON \`meeting\`.\`todo_id\` = \`todo\`.\`id\`
  INNER JOIN \`cte\` ON \`todo\`.\`id\` = \`cte\`.\`parent_id\`
)

SELECT COUNT(*) AS \`meeting_ascendants\` FROM \`cte\` WHERE \`cte\`.\`id\` != :id AND \`cte\`.\`todo_id\` IS NOT NULL
`;

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

    const currentUserId = user.toJSON().id

    // Create Friends
    const dbUsers = await User.findAll( { where: { id: { [Op.not]: currentUserId } } } )
    const dbUserIds: number[] = dbUsers.map((e) => e.toJSON().id);

    if (dbUsers.length > 0) {
      for (const friendProbability of PROBABILITIES_FRIENDS) {
        let userIds = dbUserIds;

        if (userIds.length > 0 && percent({percentage: friendProbability})) {
          const userId = userIds.at(getRandomInteger(0, userIds.length - 1));
          userIds = userIds.filter((e) => e !== userId); // remove id

          try {
            await UserUser.create( { user_id: currentUserId, user_friend_id: userId } )
          } catch (error) {
            console.error('UserUser creation error');
          }
        }
      }
    }

    // Create Tags
    const tagObjects = createTags();

    for (const tagObject of tagObjects) {
      await Tag.create( { ...tagObject, user_id: currentUserId } );
    }

    // Create Todos
    const root: ITodoWithChildren = { ...randomTodo(), todos: []};
    createTodos(root, 0);

    await iterateTodoObject(root, null, user.toJSON().id);

    // Add Tags to Todos
    const dbTodos = await Todo.findAll( { where: { user_id: currentUserId } } ); // used for adding users later on as well

    const dbTags = await Tag.findAll( { where: { user_id: currentUserId } } );
    const dbTagIds: number[] = dbTags.map((e) => e.toJSON().id);

    console.log("root", root);

    if (dbTags.length > 0) {
      for (const todo of dbTodos) {
        let tagIds = dbTagIds;

        // make meeting

        const [results, metadata] = await sequelize.query(meetingQuery, {
          replacements: { id: todo.toJSON().id },
          type: QueryTypes.SELECT
        });
        console.log("meeting check", results.meeting_ascendants);

        if (results.meeting_ascendants === 0 && percent({percentage: PROBABILITY_TODO_IS_A_MEETING})) {
          console.log("make meeting", results.meeting_ascendants);
          const meeting = randomMeeting();
          await Meeting.create( { todo_id: todo.toJSON().id, venue: meeting.venue, duration: meeting.duration, user_limit: meeting.user_limit } )
        }

        // add tags
        for (let tagAddProbability of PROBABILITIES_TAGS_ADD) {
          if (tagIds.length === 0) {
            continue;
          }

          if (percent({percentage: tagAddProbability})) {
            const tagId = tagIds.at(getRandomInteger(0, tagIds.length - 1));
            tagIds = tagIds.filter((e) => e !== tagId); // remove id

            try {
              await TodoTag.create( { todo_id: todo.toJSON().id, tag_id: tagId } )
            } catch (error) {
              console.error('TodoTag creation error');
            }
          }
        }
      }
    }
    
    // Add Users to Todos
    const dbFriends = await UserUser.findAll( { where: { user_id: user.toJSON().id } } );
    const dbFriendIds: number[] = dbFriends.map((e) => e.toJSON().user_friend_id);
   
    if (dbFriends.length > 0) {
      for (const todo of dbTodos) {
        let friendIds = dbFriendIds;

        // determine probabilities to use
        const dbMeeting = await Meeting.findByPk(todo.toJSON().id);
        const probabilities = dbMeeting ? PROBABILITIES_MEETING_ADD_USER : PROBABILITIES_TODO_ADD_USER

        for (let todoAddUserProbability of probabilities) {
          if (friendIds.length === 0) {
            continue;
          }

          if (percent({percentage: todoAddUserProbability})) {
            const friendId = friendIds.at(getRandomInteger(0, friendIds.length - 1));
            friendIds = friendIds.filter((e) => e !== friendId); // remove id

            try {
              await TodoUser.create( { todo_id: todo.toJSON().id, user_id: friendId } )
            } catch (error) {
              console.error('TodoUser creation error');
            }
          }
        }
      }
    }

  }
})();
