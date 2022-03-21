import { Model, model, Schema, Types } from "mongoose";

export interface MongoTodo {
  _id: Types.ObjectId;
  name: string;
  description: string;
  moment: Date;
  priority: number;
  parent: Types.ObjectId;
  tags: Types.ObjectId[];
  users: Types.ObjectId[];
}

const todoSchema = new Schema<MongoTodo>(
  {
    name: String,
    description: String,
    moment: Date,
    priority: Number,
    parent: { type: Schema.Types.ObjectId, ref: 'Todo' },
    tags: [Schema.Types.ObjectId],
    users: [Schema.Types.ObjectId]    
  }
);

export { todoSchema }