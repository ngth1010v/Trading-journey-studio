import { RGB, RGBA } from "../../../type.js";

export interface Strategy {
  id?: number;
  name: string;
  desc: string;
  tagIds: string[];
  status: "live" | "end" | "backtest";
  createdTimestamp: number;

  favorite: {
    symbols: string[];
    timeframes: string[];
  };
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

export interface StrategyTag {
  id?: number;
  name: string;
  createdTimestamp: number;
  desc: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}