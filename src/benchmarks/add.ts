import { hrtime } from 'process';
import { getRandomInteger, ITag, ITodo, percent, randomMeeting, randomTag, randomTodo, randomUsers } from '../generator'
import { MongooseUserWO } from '../mongoose/models/UserWO';
import sequelize from '../sequelize';
import { Todo } from '../sequelize/models/Todo';
import { User } from '../sequelize/models/User';
import { connect, Types } from "mongoose";
import { MongooseTodoWO } from '../mongoose/models/TodoWO';
import neo4j, { Session } from 'neo4j-driver'

connect(process.env.MONGODB_URI!);

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

const createTodo = "CREATE (todo:Todo {id: $id, name: $name, description: $description, moment: datetime($moment), priority: $priority, checked: $checked}) RETURN todo";
const createUserToTodo = "MATCH (u:User), (t:Todo) WHERE u.id = $userId AND t.id = $todoId CREATE (u)-[r:CREATED]->(t) RETURN *";
const createTodoToTodo = "MATCH (parent:Todo), (child:Todo) WHERE parent.id = $parentId AND child.id = $childId CREATE (parent)-[r:HAS_CHILD]->(child) RETURN *";

/**
 * Die Idee: Eine Todo-Hierarchie generieren und dem zuletzt hinzugefügten Benutzer anhängen.
 * 
 * Während das Ganze bei MariaDB und MongoDB nur je einen Query pro Todo benötigt wird sind bei Neo4j drei nötig:
 * Todo-Node, Relationship zur Parent-Todo-Node und Relationship zur User-Node!
 * 
 * Da empfohlen wird bei Neo4j nicht auf die internen IDs zu bauen und das Einfügen hier entkoppelt (im Vergleich zum Seeden) ist von dem
 * was bei der MariaDB ID-mässig passiert ist das ITodoWithChildren-Interface um die 'random_id'-Property erweitert.
 * Die Idee ist es hier zufällige IDs zu generieren die dann beim Neo4j-Teil verwendet werden können, da nicht einfach wie beim Seeding
 * die IDs der MariaDB geklaut werden können/sollen/werden.
 */

 console.log("Testcase: ADD")

/**
 * Todos
 */

const PROBABILITIES_TODO_CHILDREN = [80, 80, 80, 80, 80, 20, 20]; // add child
const PROBABILITIES_TODO_DEPTH = [5, 25, 50, 75, 100]; // end at a certain depth

interface ITodoWithChildren extends ITodo {
  todos: ITodoWithChildren[];
  random_id: number; // nötig für den Neo4j-Insert
}

function createTodos(todo: ITodoWithChildren, depth: number): ITodoWithChildren {
  if (percent( { percentage: PROBABILITIES_TODO_DEPTH[depth] } )) { // no children
    return todo;
  }

  for (const todoChildProbability of PROBABILITIES_TODO_CHILDREN) {
    if (percent({percentage: todoChildProbability})) {
      const children = createTodos({...randomTodo(todo.moment), todos: [], random_id: Math.round(Math.random() * 1_000_000_000_000) }, depth + 1);
      todo.todos.push(children);
    }
  }

  return todo;
} 

const root: ITodoWithChildren = { ...randomTodo(), todos: [], random_id: Math.round(Math.random() * 1_000_000_000_000) };
createTodos(root, 0);

console.log("Todos", root);

/**
 * Recursives
 */

async function createMariaTodos(todo: ITodoWithChildren, parentId: number | null, userId: number) {
  const obj = {
    ...todo,
    parent_id: parentId,
    user_id: userId,
  };

  const dbTodo = await Todo.create(obj);

  for (const child of todo.todos) {
    await createMariaTodos(child, dbTodo.toJSON().id, userId);
  }
}

async function createMongoTodos(todo: ITodoWithChildren, parentId: Types.ObjectId | null, userId: Types.ObjectId) {
  const obj = parentId ? { ...todo, user: userId, parent: parentId } : { ...todo, user: userId }

  const mongoTodo = await MongooseTodoWO.create(obj)
  const saved = await mongoTodo.save();

  for (const child of todo.todos) {
    await createMongoTodos(child, saved._id, userId);
  }
}

async function createNeoTodos(todo: ITodoWithChildren, parentId: number | null, userId: number, session: Session) {
  // Todo ...
  await session.run(createTodo, {
    id: neo4j.int(todo.random_id),
    name: todo.name,
    description: todo.description,
    moment: todo.moment.toISOString(),
    checked: todo.checked,
    priority: neo4j.int(todo.priority)
  });

  // ... mit User
  await session.run(createUserToTodo, {userId: userId, todoId: todo.random_id});     

  // ... und Parent?
  if (parentId) {
    await session.run(createTodoToTodo, {parentId: parentId, childId: todo.random_id}); 
  }

  for (const child of todo.todos) {
    await createNeoTodos(child, todo.random_id, userId, session);
  }
}

(async () => {
  /**
   * MariaDB
   */

  // Vorbereitung: Letzten Benutzer finden
  const mariaUser = await User.findOne( { order: sequelize.literal('id DESC') } )
  console.log("MariaDB - user", mariaUser);
  if (!mariaUser) {
    return;
  }

  // Execution

  console.log("MariaDB");

  console.time("MariaDB");
  const mariaStart = hrtime.bigint();

  await createMariaTodos(root, null, mariaUser.toJSON().id);

  console.timeEnd("MariaDB");
  const mariaEnd = hrtime.bigint();
  console.log(`MariaDB: ${(mariaEnd - mariaStart) / BigInt(1000)} microseconds`)

  /**
   * Neo4j
   */

  // Vorbereitung: Keine, User bekannt via MariaDB

  // Execution

  console.log("Neo4j");

  console.time("Neo4j");
  const neoStart = hrtime.bigint();

  const session = driver.session();
  try {  
    await createNeoTodos(root, null, mariaUser.toJSON().id, session);
  } finally {
    await session.close();

    console.timeEnd("Neo4j");
    const neoEnd = hrtime.bigint();
    console.log(`Neo4j: ${(neoEnd - neoStart) / BigInt(1000)} microseconds`)      
  }

  /**
   * MongoDB
   */

  // Vorbereitung: Letzten Benutzer finden
  const mongoUser = await MongooseUserWO.findOne({}).sort( { $natural: -1 } )

  if (!mongoUser) {
    return;
  }

  // Execution

  console.log("MongoDB");

  console.time("MongoDB");
  const mongoStart = hrtime.bigint();

  await createMongoTodos(root, null, mongoUser._id);

  console.timeEnd("MongoDB");
  const mongoEnd = hrtime.bigint();
  console.log(`MongoDB: ${(mongoEnd - mongoStart) / BigInt(1000)} microseconds`)

})();