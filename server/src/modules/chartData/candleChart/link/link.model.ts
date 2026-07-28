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

export interface LinkState {
  lastEditor: {
    pageId: number;
    elementId: number;
    timestamp: number;
    release: boolean;
  };
  symbol: string;
  view: {
    fromTs: number;
    toTs: number;
    fromPrice: number;
    toPrice: number;
  };
}

export interface CachedLinkEntry {
  link: Link;
  state?: LinkState;
  isDirtyLink: boolean;
  isDirtyState: boolean;
}