import { RGB, RGBA } from "../../../../type.js";

export interface LinkChild {
  pageId: number
  elementId: number
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

export interface Link {
  id?: number;
  name: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  children: LinkChild[]
}


export interface LinkData {
  symbol: string
  view: {
    fromTs: number
    toTs: number
    fromPrice: number
    toPrice: number
  } 
}