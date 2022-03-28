import { Model, model, Schema, Types } from "mongoose";

export interface MongoTodo {
  _id: Types.ObjectId;
  name: string;
  description: string;
  moment: Date;
  priority: number;
  checked: number;
  venue: string;
  duration: number;
  user_limit: number;
  parent: Types.ObjectId;
  tags: Types.ObjectId[];
  users: Types.ObjectId[];
  user: Types.ObjectId;
}

const todoSchema = new Schema<MongoTodo>(
  {
    name: String,
    description: String,
    moment: Date,
    priority: Number,
    checked: Number,
    venue: String,
    duration: Number,
    user_limit: Number,
    parent: { type: Schema.Types.ObjectId, ref: 'TodoWO' },
    tags: [Schema.Types.ObjectId],
    users: [Schema.Types.ObjectId],
    user: { type: Schema.Types.ObjectId, ref: 'UserWO' },  
  }
);

export const MongooseTodoWO = model('TodoWO', todoSchema, 'wo_todo');

