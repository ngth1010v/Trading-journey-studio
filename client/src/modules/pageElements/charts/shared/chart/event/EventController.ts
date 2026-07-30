import type React from "react";
import type EventData from "../../../../../data/chartData/event/EventData";
import type { Event, InputEvent, KeyInput, MouseInput } from "../../../../../data/chartData/event/EventData";

export type EventOutput = React.MouseEvent | React.KeyboardEvent | React.WheelEvent;

interface CallbackEntry {
  event: string;
  cb: (output: EventOutput) => void;
}

export default class EventController {
  private eventData: EventData | null = null;
  private chartType: string = "";

  // Registered callbacks map: id -> CallbackEntry
  private callbacks: Map<string, CallbackEntry> = new Map();

  // Set of currently pressed physical keys tracked by e.code
  private activeKeys: Set<string> = new Set();

  /**
   * Initializes the controller with EventData instance and target chartType.
   */
  public init(eventData: EventData, chartType: string): void {
    this.eventData = eventData;
    this.chartType = chartType;
  }

  /**
   * Cleans up registered callbacks and resets key tracking state.
   */
  public destroy(): void {
    this.callbacks.clear();
    this.activeKeys.clear();
    this.eventData = null;
    this.chartType = "";
  }

  // =========================================================================
  // Event Input Handlers
  // =========================================================================

  public onMouseDown = (e: React.MouseEvent): void => {
    const mouseInput = this.getMouseDownInput(e.button);
    if (mouseInput) {
      this.processEventTrigger(e, mouseInput, undefined);
    }
  };

  public onMouseUp = (e: React.MouseEvent): void => {
    const mouseInput = this.getMouseUpInput(e.button);
    if (mouseInput) {
      this.processEventTrigger(e, mouseInput, undefined);
    }
  };

  public onMouseMove = (e: React.MouseEvent): void => {
    this.processEventTrigger(e, "MouseMove", undefined);
  };

  public onMouseEnter = (e: React.MouseEvent): void => {
    this.processEventTrigger(e, "MouseEnter", undefined);
  };

  public onMouseLeave = (e: React.MouseEvent): void => {
    this.processEventTrigger(e, "MouseLeave", undefined);
  };

  public onWheel = (e: React.WheelEvent): void => {
    this.processEventTrigger(e, "Wheel", undefined);
  };

  public onKeyDown = (e: React.KeyboardEvent): void => {
    this.activeKeys.add(e.code);
    this.processEventTrigger(e, undefined, { code: e.code, type: "down" });
  };

  public onKeyUp = (e: React.KeyboardEvent): void => {
    this.activeKeys.delete(e.code);
    this.processEventTrigger(e, undefined, { code: e.code, type: "up" });
  };

  // =========================================================================
  // Event Registry
  // =========================================================================

  /**
   * Registers or overwrites a callback for a specific event name and id.
   */
  public addOnEvent(event: string, id: string, cb: (output: EventOutput) => void): void {
    this.callbacks.set(id, { event, cb });
  }

  /**
   * Removes a callback by its registration id.
   */
  public removeOnEvent(id: string): void {
    this.callbacks.delete(id);
  }

  // =========================================================================
  // Internal Processing & Logic
  // =========================================================================

  /**
   * Core execution loop: retrieves events, checks for the first match,
   * triggers matching callbacks, and halts further loop execution on match.
   */
  private processEventTrigger(
    output: EventOutput,
    currentMouseInput?: MouseInput,
    currentKeyInput?: KeyInput
  ): void {
    if (!this.eventData || !this.chartType) {
      return;
    }

    const eventList: Event[] = this.eventData.getAllChart(this.chartType);

    for (const eventDef of eventList) {
      if (this.isEventMatch(eventDef.input, output, currentMouseInput, currentKeyInput)) {
        this.triggerCallbacks(eventDef.event, output);
        // Halts loop after matching the first event
        break;
      }
    }
  }

  /**
   * Evaluates if current user interaction matches the rule definition.
   */
  private isEventMatch(
    input: InputEvent,
    e: EventOutput,
    currentMouseInput?: MouseInput,
    currentKeyInput?: KeyInput
  ): boolean {
    // 1. Check Modifier Keys
    if (!this.checkModifiers(input.modifiers, e)) {
      return false;
    }

    // 2. Check Mouse Requirements
    if (input.mouse && input.mouse.length > 0) {
      if (!currentMouseInput) {
        return false;
      }
      if (!input.mouse.includes(currentMouseInput)) {
        return false;
      }
    }

    // 3. Check Key Code Requirements
    if (input.code && input.code.length > 0) {
      for (const requiredKey of input.code) {
        if (!this.checkSingleKeyCondition(requiredKey, currentKeyInput)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Checks key condition based on key type (pressed, unpressed, down, up).
   */
  private checkSingleKeyCondition(requiredKey: KeyInput, currentKeyInput?: KeyInput): boolean {
    switch (requiredKey.type) {
      case "pressed":
        return this.activeKeys.has(requiredKey.code);

      case "unpressed":
        return !this.activeKeys.has(requiredKey.code);

      case "down":
        return (
          currentKeyInput?.type === "down" &&
          currentKeyInput.code === requiredKey.code
        );

      case "up":
        return (
          currentKeyInput?.type === "up" &&
          currentKeyInput.code === requiredKey.code
        );

      default:
        return false;
    }
  }

  /**
   * Validates modifier key states (ctrl, shift, alt, meta).
   * - Undefined: skip check
   * - Boolean: must strictly equal event status
   */
  private checkModifiers(modifiers: InputEvent["modifiers"], e: EventOutput): boolean {
    if (!modifiers) return true;

    if (modifiers.ctrl !== undefined && e.ctrlKey !== modifiers.ctrl) {
      return false;
    }
    if (modifiers.shift !== undefined && e.shiftKey !== modifiers.shift) {
      return false;
    }
    if (modifiers.alt !== undefined && e.altKey !== modifiers.alt) {
      return false;
    }
    if (modifiers.meta !== undefined && e.metaKey !== modifiers.meta) {
      return false;
    }

    return true;
  }

  /**
   * Maps mouse button index to Mouse<Name>Down type.
   */
  private getMouseDownInput(button: number): MouseInput | null {
    switch (button) {
      case 0:
        return "MouseLeftDown";
      case 1:
        return "MouseMiddleDown";
      case 2:
        return "MouseRightDown";
      case 3:
        return "MouseBackDown";
      case 4:
        return "MouseForwardDown";
      default:
        return null;
    }
  }

  /**
   * Maps mouse button index to Mouse<Name>Up type.
   */
  private getMouseUpInput(button: number): MouseInput | null {
    switch (button) {
      case 0:
        return "MouseLeftUp";
      case 1:
        return "MouseMiddleUp";
      case 2:
        return "MouseRightUp";
      case 3:
        return "MouseBackUp";
      case 4:
        return "MouseForwardUp";
      default:
        return null;
    }
  }

  /**
   * Executes all registered callbacks for a specific event name.
   */
  private triggerCallbacks(eventName: string, output: EventOutput): void {
    for (const entry of this.callbacks.values()) {
      if (entry.event === eventName) {
        try {
          entry.cb(output);
        } catch (err) {
          console.error(`Error executing callback for event "${eventName}":`, err);
        }
      }
    }
  }
}