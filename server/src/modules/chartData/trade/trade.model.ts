import { RGB, RGBA } from "../../../type.js";

export interface Trade {
  id?: number;
  type: "long" | "short";
  symbol: string;
  strategyId: number;
  tagIds: number[];

  data: {
    openTimestamp: number;
    closeTimestamp: number;
    openPrice: number;
    closePrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    volume: number;
  };
}

export interface TradeTag {
  id?: number;
  name: string;
  desc: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

export interface TradeStyle {
  profit: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  loss: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  text: {
    order: "Profit&loss - RR" | "RR - Profit&Loss";
    alwayShow: "RR" | "Profit&Loss" | "RR - Profit&Loss" | "None";
    profitLossSize: number;
    rrSize: number;
    alignX: "left" | "right";
    alignY: "top" | "bottom";
  };
}

export const DefaultTradeStyle: TradeStyle = {
  profit: {
    font: [100, 100, 255] as RGB,
    background: [100, 100, 255, 100] as RGBA,
    border: [100, 100, 255, 255] as RGBA
  },
  loss: {
    font: [255, 100, 100] as RGB,
    background: [255, 100, 100, 100] as RGBA,
    border: [255, 100, 100, 255] as RGBA
  },
  text: {
    order: "RR - Profit&Loss",
    alwayShow: "None",
    profitLossSize: 12,
    rrSize: 12,
    alignX: "left",
    alignY: "top"
  }
};