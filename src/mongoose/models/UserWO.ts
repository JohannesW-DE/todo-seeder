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
  friends: MongoUserWO[];
}

const userSchemaWO = new Schema<MongoUserWO>(
  {
    username: String,
    name: String,
    email: String,
    tags: [tagSchema],
    friends: [{ type: Schema.Types.ObjectId, ref: "UserWO", index: true }]
  }
);

export const MongooseUserWO = model('UserWO', userSchemaWO, 'wo_user');