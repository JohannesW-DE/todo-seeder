import { Model, model, Schema, Types } from "mongoose";
import { tagSchema, MongoTag } from "./Tag";
import { todoSchema, MongoTodo } from "./Todo";

export interface MongoUser {
  _id: Types.ObjectId;
  username: string;
  name: string;
  email: string;
  tags: MongoTag[];
  todos: MongoTodo[];
  friends: MongoUser[];
}

const userSchema = new Schema<MongoUser>(
  {
    username: String,
    name: String,
    email: String,
    tags: [tagSchema],
    todos: [todoSchema],
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }]
  }
);

export const MongooseUser = model('User', userSchema, 'user');