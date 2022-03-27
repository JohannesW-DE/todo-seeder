import { Model, model, Schema, Types } from "mongoose";
import { tagSchema, MongoTag } from "./Tag";
import { todoSchema, MongoTodo } from "./Todo";
import { MongoUser } from "./User";

export interface MongoUserWO {
  _id: Types.ObjectId;
  username: string;
  name: string;
  email: string;
  tags: MongoTag[];
  todos: MongoTodo[];
  friends: MongoUser[];
}

const userSchemaWO = new Schema<MongoUserWO>(
  {
    username: String,
    name: String,
    email: String,
    tags: [tagSchema],
    todos: [{ type: Schema.Types.ObjectId, ref: "Todo" }],
    friends: [{ type: Schema.Types.ObjectId, ref: "UserWO" }]
  }
);

export const MongooseUserWO = model('UserWO', userSchemaWO, 'wo_user');