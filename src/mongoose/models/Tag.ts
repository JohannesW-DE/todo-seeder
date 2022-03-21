import { Schema, Types } from "mongoose";

export interface MongoTag {
  _id: Types.ObjectId;
  name: string;
  weight?: number;
  color: string;
  background: string;
}

const tagSchema = new Schema<MongoTag>(
  {
    name: String,
    weight: Number,
    color: String,
    background: String,
  }
);

export { tagSchema }