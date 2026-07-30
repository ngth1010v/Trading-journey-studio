export type MouseCode =
  | "MouseLeft"
  | "MouseMiddle"
  | "MouseRight"
  | "MouseBack"
  | "MouseForward"
  | "WheelUp"
  | "WheelDown";

export interface InputEvent {
  mouse?: MouseCode[]; // AND logic
  code?: string[]; // AND logic
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

export interface Event {
  id?: number;
  chartType: string;
  event: string;
  input: InputEvent; // saved in database as JSON string
}