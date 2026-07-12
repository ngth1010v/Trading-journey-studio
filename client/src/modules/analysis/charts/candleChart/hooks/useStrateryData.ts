import { useRef } from "react";
import { strategiesApi } from "../../../../../shared/api/strategiesApi";
import { throwAppError } from "../../../../../shared/appError";
import type { Strategy } from "../../../../../shared/types/strategies.type";

export type StrateryData = {
  set: (name: string) => Promise<void>;
  get: () => Strategy;
  addOnStrateryChange: (id: string, cb: () => void) => void;
  removeOnStrateryChange: (id: string) => void;
};

export default function useStrateryData(): StrateryData {
  const strategyNameRef = useRef<string | null>(null);
  const strategyRef = useRef<Strategy | null>(null);

  const callbacksRef = useRef<Map<string, () => void>>(new Map());

  // Ignore stale async requests.
  const requestIdRef = useRef(0);

  const fireOnStrategyChange = () => {
    for (const cb of callbacksRef.current.values()) {
      cb();
    }
  };

  const set = async (name: string): Promise<void> => {
    strategyNameRef.current = name;
    
    const requestId = ++requestIdRef.current;

    const allStrategies = await strategiesApi.getAllStrategies();
    
    // Ignore stale request.
    if (requestId !== requestIdRef.current) {
      return;
    }

    const strategy = allStrategies.find((s) => s.name === name);

    if (!strategy) {
      throwAppError(
        "STRATEGY_NOT_FOUND",
        `Strategy "${name}" not found.`,
      );
    }
    
    strategyRef.current = strategy;

    fireOnStrategyChange();
  };

  const get = (): Strategy => {
    if (strategyNameRef.current === null) {
      throwAppError(
        "STRATEGY_NOT_SET",
        "Strategy has not been selected.",
      );
    }

    if (strategyRef.current === null) {
      throwAppError(
        "STRATEGY_NOT_LOADED",
        `Strategy "${strategyNameRef.current}" has not finished loading.`,
      );
    }

    return strategyRef.current;
  };

  return {
    set,
    get,

    addOnStrateryChange(id: string, cb: () => void) {
      callbacksRef.current.set(id, cb);
    },

    removeOnStrateryChange(id: string) {
      callbacksRef.current.delete(id);
    },
  };
}