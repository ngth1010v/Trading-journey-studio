import { RGB, RGBA } from "../../../../type.js";

export interface Link {
  id?: number;
  name: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}