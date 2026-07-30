

export type MouseInput =
  | "MouseLeftDown"
  | "MouseMiddleDown"
  | "MouseRightDown"
  | "MouseBackDown"
  | "MouseForwardDown"
  | "MouseLeftUp"
  | "MouseMiddleUp"
  | "MouseRightUp"
  | "MouseBackUp"
  | "MouseForwardUp"
  | "MouseMove"
  | "Wheel"
  | "MouseEnter"
  | "MouseLeave";

export type KeyType = "up" | "down" | "pressed" | "unpressed"
export type KeyInput = { 
  code: string,
  type: KeyType
}

//NEW
export interface InputEvent {
  mouse?: MouseInput[];
  code?: KeyInput[];
  modifiers?: {
    ctrl  ?: KeyType;
    shift ?: KeyType;
    alt   ?: KeyType;
    meta  ?: KeyType;
  };
}

export interface Event {
  id?: number;
  chartType: string;
  event: string;
  input: InputEvent; // saved in database as JSON string
}