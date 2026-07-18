import { RGBA, RGB } from "../../shared/type.js";

export interface Trade {
  id?: number;
  type: "long" | "short";
  symbol: string;
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
  
  style: {
    editable: boolean;
    autoFitClose: boolean;
    profitColor: RGBA;
    lossColor: RGBA;
    text: {
      order: "Profit&loss - RR" | "RR - Profit&Loss";
      alwayShow: "RR" | "Profit&Loss" | "RR - Profit&Loss";
      profitLossSize: number;
      rrSize: number;
      alignX: "left" | "right";
      alignY: "top" | "bottom";
    };
  };
}

export interface TradeTag {
  id?: number;
  name: string;
  desc: string;
  style: {
    color: RGBA;
    text: {
      color: RGB;
      size: number;
    };
  };
}

export interface TradeTemplate {
  name: string;
  style: {
    editable: boolean;
    autoFitClose: boolean;
    profitColor: RGBA;
    lossColor: RGBA;
    text: {
      order: "Profit&loss - RR" | "RR - Profit&Loss";
      alwayShow: "RR" | "Profit&Loss" | "RR - Profit&Loss";
      profitLossSize: number;
      rrSize: number;
      alignX: "left" | "right";
      alignY: "top" | "bottom";
    };
  };
}