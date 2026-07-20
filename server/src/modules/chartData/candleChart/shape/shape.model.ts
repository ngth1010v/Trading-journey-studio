// shape/shape.model.ts
import { RGB, RGBA } from "../../../../type.js";

export interface Shape {
  id?: number;
  type: string;
  symbol: string;
  tagIds: number[]; // stored as JSON string in DB
  fromTs: number;
  toTs: number;
  data: any;        // stored as JSON string in DB
  style: any;       // stored as JSON string in DB
}

export interface ShapeTag {
  id?: number;
  name: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };                // stored as JSON string in DB
}

export interface ShapeTemplate {
  id?: number;
  type: string;
  name: string;
  style: any;       // stored as JSON string in DB
}